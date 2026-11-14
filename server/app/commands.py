"""CommandService: the single entry point for commands from web, voice, iMessage and the host."""
from __future__ import annotations

import hmac
import logging
import os
import sqlite3
from typing import Any

from .data.provider import provider_for_mode
from .rooms import Conn, Room, RoomError, RoomManager

log = logging.getLogger("lights_on.commands")

ORIGINS = {"web", "voice", "imessage", "host"}
HOST_ACTIONS = {"skip_phase", "reset_round", "reset_room", "set_data_mode"}
DATA_MODES = {"kit", "fixtures"}
NICKNAME_MAX = 16


def _clamp01(v: Any) -> float:
    if isinstance(v, bool) or not isinstance(v, (int, float)) or v != v:
        raise RoomError("bad_payload", "x and y must be numbers.")
    return min(1.0, max(0.0, float(v)))


class CommandService:
    def __init__(self, manager: RoomManager):
        self.manager = manager

    def _pin_ok(self, pin: Any) -> bool:
        expected = os.getenv("HOST_PIN") or ""
        return bool(expected) and isinstance(pin, str) and hmac.compare_digest(pin.encode(), expected.encode())

    async def handle(self, cmd: dict, origin: str, conn: Conn | None = None) -> dict:
        """Validate and apply one command. Returns the ack result or raises RoomError."""
        if origin not in ORIGINS:
            raise RoomError("bad_origin", "Unknown command origin.")
        room = self.manager.get(str(cmd.get("room", "")))
        if room is None:
            raise RoomError("no_room", "Room not found.")
        name = cmd.get("type")
        handler = getattr(self, f"_cmd_{name}", None) if isinstance(name, str) else None
        if handler is None:
            raise RoomError("unknown_command", f"Unknown command: {name!r}.")
        return await handler(room, cmd, origin, conn)

    def _player(self, room: Room, cmd: dict):
        player = room.players.get(str(cmd.get("player_id", "")))
        if player is None:
            raise RoomError("not_joined", "Join the room first.")
        return player

    async def _cmd_join(self, room: Room, cmd: dict, origin: str, conn: Conn | None) -> dict:
        if conn and conn.player_id in room.players:  # already joined on this socket
            existing = room.players[conn.player_id]
            return {"player_id": existing.id, "color": existing.color}
        nickname = str(cmd.get("nickname", "")).strip()[:NICKNAME_MAX]
        if not nickname:
            raise RoomError("bad_payload", "Pick a nickname.")
        player = room.add_player(nickname)
        if conn:
            conn.player_id = player.id
        room.save_players()
        await room.broadcast("player_joined", {"player": player.public()})
        # Two players is enough to play: leave the attract/lobby screen automatically.
        if room.phase == "LOBBY" and len(room.players) >= 2:
            await room.advance()
        return {"player_id": player.id, "color": player.color}

    async def _cmd_pointer(self, room: Room, cmd: dict, origin: str, conn: Conn | None) -> dict:
        player = self._player(room, cmd)
        if room.phase != "EXPLORE":
            raise RoomError("wrong_phase", "Pointer is only used while exploring.")
        x, y = _clamp01(cmd.get("x")), _clamp01(cmd.get("y"))
        # Relayed to the screen only, never persisted.
        await room.broadcast("pointer", {"player_id": player.id, "color": player.color, "x": x, "y": y}, to="screen")
        return {}

    async def _cmd_wake(self, room: Room, cmd: dict, origin: str, conn: Conn | None) -> dict:
        self._player(room, cmd)
        building_id = str(cmd.get("building_id", ""))
        await room.start_round(building_id)
        return {"round_id": room.round_id}

    async def _cmd_host_action(self, room: Room, cmd: dict, origin: str, conn: Conn | None) -> dict:
        if not self._pin_ok(cmd.get("pin")):
            log.warning("host_action rejected: bad pin (room %s)", room.code)
            raise RoomError("bad_pin", "Wrong host PIN.")
        action = cmd.get("action")
        if action not in HOST_ACTIONS:
            raise RoomError("bad_payload", f"Unknown host action: {action!r}.")
        if action == "skip_phase":
            await room.advance()
        elif action == "reset_round":
            await room.reset_round()
        elif action == "reset_room":
            await room.reset_room()
        elif action == "set_data_mode":
            mode = cmd.get("data_mode")
            if mode not in DATA_MODES:
                raise RoomError("bad_payload", "data_mode must be kit or fixtures.")
            try:
                # Confirm the requested provider is usable before changing any labels.
                provider_for_mode(mode).buildings()
            except (OSError, ValueError, sqlite3.Error) as exc:
                log.error("data provider switch failed (%s)", type(exc).__name__)
                raise RoomError("data_unavailable", "Building data is unavailable; the data mode has not changed.") from exc
            os.environ["DATA_MODE"] = mode
            rooms = list(self.manager.rooms.values())
            for active in rooms:
                active.data_mode = mode
                active.save_players()
            for active in rooms:
                await active.broadcast("room_state", active.snapshot())
        return {"phase": room.phase}
