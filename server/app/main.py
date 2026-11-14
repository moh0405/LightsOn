import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

import segno
from dotenv import dotenv_values, load_dotenv
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from .commands import CommandService
from .rooms import DEFAULT_DURATIONS, Conn, RoomError, RoomManager

REPO_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(REPO_ROOT / ".env")

log = logging.getLogger("lights_on")
ROLES = {"screen", "play", "admin"}
# Command origin for each socket role (the host panel is the only "host" origin).
ROLE_ORIGIN = {"screen": "web", "play": "web", "admin": "host"}


@asynccontextmanager
async def lifespan(app: FastAPI):
    state_dir = Path(os.getenv("STATE_DIR") or REPO_ROOT / "server" / "state")
    heroes = [h.strip() for h in (os.getenv("HERO_PROPERTY_IDS") or "233953,233899").split(",") if h.strip()]
    scale = float(os.getenv("PHASE_DURATIONS_SCALE", "1.0"))
    durations = {phase: seconds * scale if seconds is not None else None
                 for phase, seconds in DEFAULT_DURATIONS.items()}
    app.state.manager = RoomManager(heroes, state_dir, durations=durations)
    app.state.commands = CommandService(app.state.manager)
    yield
    app.state.manager.close()


app = FastAPI(title="Lights On", lifespan=lifespan)


def env_example_keys() -> list[str]:
    """Names of every key declared in .env.example (values are never read)."""
    return [k for k in dotenv_values(REPO_ROOT / ".env.example")]


def build_health() -> dict:
    data_dir = Path(os.getenv("COSTAR_DATA_DIR") or "./data/costar")
    if not data_dir.is_absolute():
        data_dir = REPO_ROOT / data_dir
    return {
        "ok": True,
        "data_mode": os.getenv("DATA_MODE") or "kit",
        # presence only (true/false), never the value
        "keys": {k: bool(os.getenv(k)) for k in env_example_keys()},
        "costar_property_file": (data_dir / "data" / "commercial-property.jsonl").is_file(),
    }


@app.get("/api/health")
def health() -> dict:
    return build_health()


class CreateRoom(BaseModel):
    room: str | None = None  # reuse this room if it exists (screen refresh)
    base_url: str | None = None  # the screen's own origin, used when PUBLIC_BASE_URL is unset


@app.post("/api/rooms")
async def create_room(request: Request, body: CreateRoom | None = None) -> dict:
    body = body or CreateRoom()
    manager: RoomManager = request.app.state.manager
    room = manager.create(body.room.upper() if body.room else None)
    base = (os.getenv("PUBLIC_BASE_URL") or body.base_url or str(request.base_url)).rstrip("/")
    join_url = f"{base}/play?room={room.code}"
    qr_svg = segno.make(join_url, error="m").svg_inline(scale=8, border=2, dark="#000", light="#fff")
    return {"room": room.code, "join_url": join_url, "qr_svg": qr_svg}


@app.websocket("/ws/{code}")
async def ws_endpoint(ws: WebSocket, code: str, role: str = "play", player_id: str | None = None) -> None:
    manager: RoomManager = ws.app.state.manager
    commands: CommandService = ws.app.state.commands
    room = manager.get(code)
    if room is None or role not in ROLES:
        await ws.close(code=4404)
        return
    await ws.accept()

    conn = Conn(role=role, send=ws.send_json)
    room.conns.append(conn)
    # Reconnect: a known player_id rebinds to the existing player. room_state goes first.
    rejoined = None
    if role == "play" and player_id and player_id in room.players:
        conn.player_id = player_id
        rejoined = room.players[player_id]
        rejoined.connected = True
    await room.send_to(conn, {"type": "room_state", **room.snapshot()})
    if rejoined:
        await room.broadcast("player_joined", {"player": rejoined.public()})

    try:
        while True:
            msg = await ws.receive_json()
            if not isinstance(msg, dict):
                continue
            msg["room"] = room.code
            if conn.player_id and role == "play":
                msg["player_id"] = conn.player_id  # never trust a client-supplied player id
            nonce = msg.get("nonce")
            try:
                result = await commands.handle(msg, ROLE_ORIGIN[role], conn)
            except RoomError as err:
                if msg.get("type") != "pointer":  # wrong-phase pointers are dropped silently
                    await room.send_to(conn, {"type": "error", "code": err.code, "message": err.message, "nonce": nonce})
                continue
            if msg.get("type") != "pointer":
                await room.send_to(conn, {"type": "ack", "nonce": nonce, "command": msg.get("type"), "result": result})
    except WebSocketDisconnect:
        pass
    except Exception:
        log.exception("websocket error")
    finally:
        if conn in room.conns:
            room.conns.remove(conn)
        player = room.players.get(conn.player_id or "")
        if player and not any(c.player_id == player.id for c in room.conns):
            player.connected = False
            await room.broadcast("player_left", {"player": player.public()})
