import asyncio
import logging
import os
import secrets
from contextlib import asynccontextmanager
from pathlib import Path

import segno
from dotenv import dotenv_values, load_dotenv
from fastapi.responses import FileResponse
from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

from .commands import CommandService
from .data.provider import DataProvider, get_provider
from .rooms import Conn, RoomError, RoomManager, demo_mode, phase_durations

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
    durations = phase_durations(scale)
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
        "demo_mode": demo_mode(),
        # presence only (true/false), never the value
        "keys": {k: bool(os.getenv(k)) for k in env_example_keys()},
        "costar_property_file": (data_dir / "data" / "commercial-property.jsonl").is_file(),
    }


@app.get("/api/health")
def health() -> dict:
    return build_health()


@app.get('/api/buildings')
def buildings(provider: DataProvider = Depends(get_provider)) -> list[dict]:
    return provider.buildings()


@app.get('/api/buildings/{property_id}')
def building(property_id: str, provider: DataProvider = Depends(get_provider)) -> dict:
    dossier = provider.dossier(property_id)
    if dossier is None:
        raise HTTPException(status_code=404, detail='Unknown building')
    return dossier


@app.get('/api/buildings/{property_id}/persona')
def building_persona(property_id: str, provider: DataProvider = Depends(get_provider)) -> dict:
    dossier = building(property_id, provider)
    if not dossier.get('persona'):
        raise HTTPException(status_code=404, detail='Persona has not been prepared')
    return dossier['persona']


@app.get('/api/buildings/{property_id}/trace')
def building_trace(property_id: str, provider: DataProvider = Depends(get_provider)) -> dict:
    from .trace import recorded_trace
    building(property_id, provider)
    return recorded_trace(property_id)


@app.post('/api/buildings/{property_id}/prep')
async def prepare_building(property_id: str, request: Request, force: bool = False,
                           provider: DataProvider = Depends(get_provider)) -> dict:
    from .agent.prep_agent import prep_building, read_cached_building
    building(property_id, provider)  # Authorize the exact known building before filesystem access.
    if not force:
        result = await asyncio.to_thread(read_cached_building, property_id, provider=provider)
        if result is None:
            raise HTTPException(status_code=404, detail='No trusted prep cache; host preparation required')
        return result
    expected, supplied = os.getenv('HOST_PIN', ''), request.headers.get('X-Host-Pin', '')
    matched = secrets.compare_digest(supplied.encode('utf-8'), expected.encode('utf-8'))
    if not expected or not matched:
        raise HTTPException(status_code=403, detail='Host PIN required for forced prep')
    loop = asyncio.get_running_loop()
    async def broadcast(event):
        for room in list(request.app.state.manager.rooms.values()):
            await room.broadcast('agent_step', event, to='screen')
    def emit(event):
        asyncio.run_coroutine_threadsafe(broadcast(event), loop)
    async def toast(code: str, message: str):
        for room in list(request.app.state.manager.rooms.values()):
            await room.broadcast('error', {'code': code, 'message': message})
    from .agent import prep_agent
    try:
        result = await asyncio.to_thread(prep_building, property_id, force, provider=provider, emit=emit)
    except ValueError:
        log.error('Building prep grounding failed; game fallback remains available')
        await toast('prep_grounding_failed', 'Building prep could not be grounded. Offline play still works.')
        raise HTTPException(status_code=422, detail='Prep grounding failed; game fallback remains available') from None
    except Exception:
        log.error('Building prep unavailable; game fallback remains available')
        await toast('prep_unavailable', 'Building prep unavailable. Subtitles and offline play still work.')
        raise HTTPException(status_code=503, detail='Prep unavailable; retry later') from None
    if result.get('prep_status') == 'unavailable':
        await toast('prep_unavailable', 'Building prep unavailable. Subtitles and offline play still work.')
    elif result.get('prep_status') == 'ready':
        try:
            # Same deterministic finalization as scripts/prep_building.py.
            await asyncio.to_thread(prep_agent.finalize_floors)
        except Exception:
            log.error('Floor artifact rebuild failed; previous floors remain')
            await toast('floors_unavailable', 'Floor map refresh failed. The previous floors remain.')
    return result


@app.get('/api/tts/{filename}')
def intro_audio(filename: str):
    import re
    if not re.fullmatch(r'[a-f0-9]{64}\.mp3', filename):
        raise HTTPException(status_code=404, detail='Unknown audio')
    path = REPO_ROOT / 'server/cache/tts' / filename
    if not path.is_file():
        raise HTTPException(status_code=404, detail='Unknown audio')
    return FileResponse(path, media_type='audio/mpeg')


class SpeechRequest(BaseModel):
    room: str = Field(min_length=1, max_length=16)
    round_id: str | None = Field(default=None, max_length=64)
    text: str = Field(min_length=1, max_length=2000)
    voice_id: str = Field(default='', max_length=128)


# Text that is not a line the server produced this round: short and rate limited per room.
TTS_FREE_CHARS = 280
TTS_FREE_LINES = 6
TTS_FREE_WINDOW_S = 60.0
_tts_free_usage: dict[str, list[float]] = {}


def host_pin_ok(request: Request) -> bool:
    expected, supplied = os.getenv('HOST_PIN', ''), request.headers.get('X-Host-Pin', '')
    return bool(expected) and secrets.compare_digest(supplied.encode('utf-8'), expected.encode('utf-8'))


@app.post('/api/tts')
async def speech(body: SpeechRequest, request: Request) -> dict:
    """Paid voice is only for a room's active round (or the host): the round's own
    lines, or a short rate-limited line, in the round persona's voice."""
    from .voice.tts import render_speech
    room = request.app.state.manager.get(body.room.upper())
    if room is None:
        raise HTTPException(404, detail={'code': 'no_room', 'message': 'Room not found.'})
    if not host_pin_ok(request):
        if not room.players or not room.round_id or room.phase in ('LOBBY', 'EXPLORE'):
            raise HTTPException(403, detail={'code': 'no_round', 'message': 'Voice is only available during a round.'})
        if body.round_id is not None and body.round_id != room.round_id:
            raise HTTPException(409, detail={'code': 'wrong_round', 'message': 'That round has ended.'})
        persona_voice = ((room.dossier or {}).get('persona') or {}).get('voice_id') or ''
        if body.voice_id not in ('', persona_voice):
            raise HTTPException(403, detail={'code': 'bad_voice', 'message': 'Use the building voice.'})
        if ' '.join(body.text.split()) not in room.spoken_lines():
            if len(body.text) > TTS_FREE_CHARS:
                raise HTTPException(403, detail={'code': 'not_a_round_line', 'message': 'Only this round\'s lines can be voiced.'})
            loop_now = asyncio.get_running_loop().time()
            recent = [t for t in _tts_free_usage.get(room.code, []) if loop_now - t < TTS_FREE_WINDOW_S]
            if len(recent) >= TTS_FREE_LINES:
                _tts_free_usage[room.code] = recent
                raise HTTPException(429, detail={'code': 'rate_limited', 'message': 'Voice is busy. Subtitles remain.'})
            _tts_free_usage[room.code] = [*recent, loop_now]
    return {'audio_url': await asyncio.to_thread(render_speech, body.text, body.voice_id)}


@app.post('/api/rooms/{code}/pitch_audio')
async def pitch_audio(code: str, request: Request, audio: UploadFile = File(),
                      player_id: str = Form(), phase: str = Form(), round_id: str | None = Form(None)) -> dict:
    from .voice import stt
    room = request.app.state.manager.get(code)
    if room is None:
        raise HTTPException(404, detail={'code': 'no_room', 'message': 'Room not found.'})
    if player_id not in room.players:
        raise HTTPException(403, detail={'code': 'not_joined', 'message': 'Join the room first.'})
    captured_round = round_id or room.round_id
    if phase not in {'PITCH', 'NEGOTIATE'} or room.phase != phase or captured_round != room.round_id:
        raise HTTPException(409, detail={'code': 'wrong_phase', 'message': 'This pitch window has ended.'})
    try:
        recording = await audio.read(stt.MAX_AUDIO + 1)
    finally:
        await audio.close()
    if not recording or len(recording) > stt.MAX_AUDIO:
        raise HTTPException(413, detail={'code': 'bad_audio', 'message': 'Record up to 30 seconds, then release.'})
    if not (audio.content_type or '').startswith(('audio/', 'video/webm')):
        raise HTTPException(415, detail={'code': 'bad_audio', 'message': 'Use an audio recording or type your pitch.'})
    try:
        text = await asyncio.to_thread(stt.transcribe, recording, audio.content_type)
    except stt.SpeechUnavailable:
        raise HTTPException(503, detail={'code': 'stt_unavailable', 'message': 'Use browser speech recognition or type your pitch.'}) from None
    if room.round_id != captured_round or room.phase != phase:
        raise HTTPException(409, detail={'code': 'wrong_phase', 'message': 'This pitch window has ended.'})
    try:
        result = await request.app.state.commands.handle({
            'room': code, 'player_id': player_id, 'round_id': captured_round,
            'type': 'revise_pitch' if phase == 'NEGOTIATE' else 'submit_pitch',
            'text': text, 'nonce': secrets.token_hex(16),
        }, 'voice')
    except RoomError as exc:
        raise HTTPException(409, detail={'code': exc.code, 'message': exc.message}) from None
    return {'text': text, 'result': result}


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
