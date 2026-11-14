"""Room state, phase machine, timers and snapshots. The server owns the phase; clients only render it."""
from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import secrets
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Awaitable, Callable

from .models import Phase

log = logging.getLogger("lights_on.rooms")

PHASE_ORDER: list[Phase] = [
    "LOBBY", "EXPLORE", "INTRO", "PITCH", "CHALLENGE", "NEGOTIATE", "VERDICT", "POWER_UP", "REVIVED",
]
# REVIVED loops back to EXPLORE (the skyline) and clears the round.
NEXT_PHASE: dict[Phase, Phase] = {
    "LOBBY": "EXPLORE", "EXPLORE": "INTRO", "INTRO": "PITCH", "PITCH": "CHALLENGE",
    "CHALLENGE": "NEGOTIATE", "NEGOTIATE": "VERDICT", "VERDICT": "POWER_UP",
    "POWER_UP": "REVIVED", "REVIVED": "EXPLORE",
}
# Seconds per phase; None = waits for a player action or the host (LOBBY, EXPLORE).
DEFAULT_DURATIONS: dict[Phase, float | None] = {
    "LOBBY": None, "EXPLORE": None, "INTRO": 8, "PITCH": 45, "CHALLENGE": 10,
    "NEGOTIATE": 30, "VERDICT": 10, "POWER_UP": 10, "REVIVED": 8,
}
PLAYER_COLORS = ["#ff5d73", "#4cc9f0", "#ffd166", "#7bd88f"]
MAX_PLAYERS = len(PLAYER_COLORS)
ROOM_CODE_RE = re.compile(r"^[A-Z0-9]{4}$")
_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def new_room_code() -> str:
    return "".join(secrets.choice(_CODE_ALPHABET) for _ in range(4))


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class Player:
    id: str
    nickname: str
    color: str
    connected: bool = False

    def public(self) -> dict:
        return {"id": self.id, "nickname": self.nickname, "color": self.color, "connected": self.connected}


@dataclass
class Conn:
    role: str  # screen | play | admin
    send: Callable[[dict], Awaitable[None]]
    player_id: str | None = None


@dataclass
class Room:
    code: str
    hero_ids: list[str]
    data_mode: str = field(default_factory=lambda: os.getenv("DATA_MODE") or "kit")
    state_dir: Path | None = None
    durations: dict[Phase, float | None] = field(default_factory=lambda: dict(DEFAULT_DURATIONS))
    players: dict[str, Player] = field(default_factory=dict)
    phase: Phase = "LOBBY"
    round_id: str | None = None
    building_id: str | None = None
    target_floors: list[int] = field(default_factory=list)
    ends_at: datetime | None = None
    conns: list[Conn] = field(default_factory=list)
    _timer: asyncio.Task | None = field(default=None, repr=False)
    _round_seq: int = 0

    # ---- views -------------------------------------------------------
    def snapshot(self) -> dict:
        return {
            "room": self.code,
            "phase": self.phase,
            "round_id": self.round_id,
            "building_id": self.building_id,
            "target_floors": self.target_floors,
            "ends_at": self.ends_at.isoformat() if self.ends_at else None,
            "data_mode": self.data_mode,
            "data_mode_scope": "process",
            "hero_building_ids": self.hero_ids,
            "players": [p.public() for p in self.players.values()],
        }

    # ---- messaging ---------------------------------------------------
    async def broadcast(self, event_type: str, payload: dict, to: str = "all") -> None:
        msg = {"type": event_type, **payload}
        for conn in list(self.conns):
            if to != "all" and conn.role != to:
                continue
            await self.send_to(conn, msg)

    async def send_to(self, conn: Conn, msg: dict) -> None:
        try:
            await conn.send(msg)
        except Exception as exc:  # dead socket: drop it, never crash the room
            log.warning("send failed (%s), dropping connection", type(exc).__name__)
            if conn in self.conns:
                self.conns.remove(conn)

    # ---- players -----------------------------------------------------
    def add_player(self, nickname: str) -> Player:
        if len(self.players) >= MAX_PLAYERS:
            raise RoomError("room_full", f"Room is full ({MAX_PLAYERS} players).")
        used = {p.color for p in self.players.values()}
        color = next(c for c in PLAYER_COLORS if c not in used)
        player = Player(id=secrets.token_hex(4), nickname=nickname, color=color, connected=True)
        self.players[player.id] = player
        return player

    # ---- phase machine -----------------------------------------------
    def can_wake(self, building_id: str) -> None:
        if self.phase != "EXPLORE":
            raise RoomError("wrong_phase", f"Cannot wake a building during {self.phase}.")
        if building_id not in self.hero_ids:
            raise RoomError("unknown_building", "That building is not in this game.")

    async def start_round(self, building_id: str) -> None:
        """First wake wins: state flips to INTRO synchronously, so a second wake sees a wrong phase."""
        self.can_wake(building_id)
        self._round_seq += 1
        self.round_id = f"{self.code}-{self._round_seq}"
        self.building_id = building_id
        self.target_floors = []  # chosen from the dossier in Phase 4
        await self.set_phase("INTRO", announce_round=True)

    async def set_phase(self, phase: Phase, announce_round: bool = False) -> None:
        self._cancel_timer()
        self.phase = phase
        if phase in ("LOBBY", "EXPLORE") and not announce_round:
            self.round_id = None
            self.building_id = None
            self.target_floors = []
        seconds = self.durations.get(phase)
        self.ends_at = utcnow() + timedelta(seconds=seconds) if seconds is not None else None
        self._save()
        if announce_round:
            await self.broadcast("round_started", {
                "round_id": self.round_id, "building_id": self.building_id, "target_floors": self.target_floors,
            })
        await self.broadcast("phase_changed", {
            "round_id": self.round_id, "phase": self.phase,
            "ends_at": self.ends_at.isoformat() if self.ends_at else None,
        })
        self._arm_timer(seconds)

    async def advance(self) -> None:
        await self.set_phase(NEXT_PHASE[self.phase])

    async def reset_round(self) -> None:
        await self.set_phase("EXPLORE")

    async def reset_room(self) -> None:
        self.players.clear()
        await self.set_phase("LOBBY")
        await self.broadcast("room_state", self.snapshot())

    # ---- timers ------------------------------------------------------
    def _arm_timer(self, seconds: float | None) -> None:
        if seconds is None:
            return
        token = (self.phase, self._round_seq, self.ends_at)

        async def fire() -> None:
            await asyncio.sleep(max(0.0, seconds))
            if (self.phase, self._round_seq, self.ends_at) == token:  # skipped/reset meanwhile
                await self.advance()

        self._timer = asyncio.get_running_loop().create_task(fire())

    def _cancel_timer(self) -> None:
        if self._timer and not self._timer.done() and self._timer is not asyncio.current_task():
            self._timer.cancel()
        self._timer = None

    def close(self) -> None:
        self._cancel_timer()

    # ---- persistence (phase changes only, never pointer events) -------
    def _path(self) -> Path | None:
        return self.state_dir / f"{self.code}.json" if self.state_dir else None

    def _save(self) -> None:
        path = self._path()
        if not path:
            return
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            data = self.snapshot() | {"round_seq": self._round_seq}
            tmp = path.with_suffix(".tmp")
            tmp.write_text(json.dumps(data))
            tmp.replace(path)
        except OSError as exc:
            log.error("snapshot write failed: %s", exc)

    def save_players(self) -> None:
        self._save()

    @classmethod
    def restore(cls, path: Path, hero_ids: list[str], state_dir: Path, **kw) -> "Room":
        data = json.loads(path.read_text())
        room = cls(code=data["room"], hero_ids=hero_ids, data_mode=os.getenv("DATA_MODE") or "kit",
                   state_dir=state_dir, **kw)
        room.phase = data["phase"]
        room.round_id = data.get("round_id")
        room.building_id = data.get("building_id")
        room.target_floors = data.get("target_floors", [])
        room._round_seq = data.get("round_seq", 0)
        room.players = {p["id"]: Player(p["id"], p["nickname"], p["color"], False) for p in data["players"]}
        ends = data.get("ends_at")
        room.ends_at = datetime.fromisoformat(ends) if ends else None
        return room

    def resume_timer(self) -> None:
        """After a restart, continue the interrupted phase timer (fires immediately if overdue)."""
        if self.ends_at is not None:
            self._arm_timer((self.ends_at - utcnow()).total_seconds())


class RoomError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


class RoomManager:
    def __init__(self, hero_ids: list[str], state_dir: Path | None = None,
                 durations: dict[Phase, float | None] | None = None):
        self.hero_ids = hero_ids
        self.state_dir = state_dir
        self.durations = durations
        self.rooms: dict[str, Room] = {}

    def _kw(self) -> dict:
        return {"durations": dict(self.durations)} if self.durations else {}

    def create(self, code: str | None = None) -> Room:
        if code is not None:
            existing = self.get(code)
            if existing:
                return existing
        while code is None or code in self.rooms:
            code = new_room_code()
        room = Room(code=code, hero_ids=self.hero_ids, state_dir=self.state_dir, **self._kw())
        self.rooms[code] = room
        room._save()
        return room

    def get(self, code: str) -> Room | None:
        """Return a live room, restoring it from its snapshot after a server restart. Needs a running loop."""
        code = code.upper()
        if not ROOM_CODE_RE.match(code):
            return None
        if code in self.rooms:
            return self.rooms[code]
        if self.state_dir and (self.state_dir / f"{code}.json").is_file():
            try:
                room = Room.restore(self.state_dir / f"{code}.json", self.hero_ids, self.state_dir, **self._kw())
            except (OSError, ValueError, KeyError) as exc:
                log.error("snapshot restore failed for %s: %s", code, exc)
                return None
            self.rooms[code] = room
            room.resume_timer()
            return room
        return None

    def close(self) -> None:
        for room in self.rooms.values():
            room.close()
