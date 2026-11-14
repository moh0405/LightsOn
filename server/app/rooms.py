"""Room state, phase machine, timers and snapshots. The server owns the phase; clients only render it."""
from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import secrets
import sqlite3
from time import monotonic
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Awaitable, Callable

from .models import Phase, Pitch, Challenge, Verdict
from .actions import ActionError, select_target_floors, target_sqft, validate_verdict, validate_revival
from .agent import fake_agent, live_agent
from .city import City, analyst_line, most_needed
from .data.provider import provider_for_mode

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

    pitches: dict[str, Pitch] = field(default_factory=dict)
    revisions: dict[str, Pitch] = field(default_factory=dict)
    challenges: list[Challenge] = field(default_factory=list)
    verdict: Verdict | None = None
    dossier: dict | None = None
    intro: dict | None = None
    mood: str = "hopeful"
    _agent_task: asyncio.Task | None = field(default=None, repr=False)
    _last_live_agent: live_agent.LiveAgent | None = field(default=None, repr=False)
    charge: int = 0
    auto_completed: bool = False
    city: City = field(default_factory=City)
    revived: dict[str, dict] = field(default_factory=dict)
    floor_states: dict[str, dict] = field(default_factory=dict)
    committed_rounds: set[str] = field(default_factory=set)
    energy_nonces: dict[str, set[str]] = field(default_factory=dict)
    energy_at: dict[str, datetime] = field(default_factory=dict)
    _energy_clock: dict[str, float] = field(default_factory=dict, repr=False)
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock, repr=False)

    def wakeable_ids(self) -> list[str]:
        try:
            provider = provider_for_mode(self.data_mode)
            ids = list(dict.fromkeys(self.hero_ids + [b['id'] for b in provider.buildings()]))
            return [bid for bid in ids if (d := provider.dossier(bid)) is not None
                    and select_target_floors(d, set(self.revived.get(bid, {}).get('floors', [])))]
        except (OSError, ValueError, sqlite3.Error):
            return list(self.hero_ids)

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
            "mood": self.mood,
            "data_mode_scope": "process",
            "hero_building_ids": self.wakeable_ids(),
            "pitches": [p.model_dump(mode='json') for p in self.pitches.values()],
            "revisions": [p.model_dump(mode='json') for p in self.revisions.values()],
            "challenges": [c.model_dump() for c in self.challenges],
            "verdict": self.verdict.model_dump() if self.verdict else None,
            "intro": self.intro if self.round_id and self.phase not in ("LOBBY", "EXPLORE") else None,
            "charge": self.charge,
            "auto_completed": self.auto_completed,
            "city": self.city.snapshot(),
            "revived": self.revived,
            "floor_states": self.floor_states,
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
        if building_id not in self.hero_ids and building_id not in self.wakeable_ids() and building_id not in self.revived:
            raise RoomError("unknown_building", "That building is not in this game.")

    async def start_round(self, building_id: str) -> None:
        async with self._lock:
            self.can_wake(building_id)
            try:
                dossier = provider_for_mode(self.data_mode).dossier(building_id)
            except (OSError, ValueError, sqlite3.Error) as exc:
                log.error('Building data unavailable (%s)', type(exc).__name__)
                raise RoomError('data_unavailable', 'Building data is unavailable.') from exc
            if dossier is None:
                raise RoomError('unknown_building', 'That building has no dossier.')
            targets = select_target_floors(dossier, set(self.revived.get(building_id, {}).get('floors', [])))
            if not targets:
                raise RoomError('no_dark_floors', 'This building has no remaining verified dark floors.')
            self._round_seq += 1
            self.round_id = f'{self.code}-{self._round_seq}'
            self.building_id = building_id
            dossier = {**dossier, 'persona': live_agent.persona_for(dossier)}
            self.dossier = dossier
            self.mood = live_agent.persona_for(dossier)['mood_baseline']
            self.target_floors = targets
            self._clear_round_inputs()
            await self._set_phase('INTRO', announce_round=True)

    def _clear_round_inputs(self) -> None:
        self.intro = None
        self.pitches.clear()
        self.revisions.clear()
        self.challenges.clear()
        self.verdict = None
        self.charge = 0
        self.auto_completed = False
        self.energy_nonces.clear()
        self.energy_at.clear()
        self._energy_clock.clear()

    async def set_phase(self, phase: Phase, announce_round: bool = False) -> None:
        async with self._lock:
            await self._set_phase(phase, announce_round)

    async def _set_phase(self, phase: Phase, announce_round: bool = False) -> None:
        self._cancel_timer()
        self._cancel_agent()
        pending_live = live_agent.enabled() and phase in ('CHALLENGE', 'VERDICT')
        if phase in ('CHALLENGE', 'VERDICT') and not self.pitches:
            await self.broadcast('error', {'code': 'no_pitches', 'message': 'No pitches this round. Choose a building to try again.'})
            phase = 'EXPLORE'
        self.phase = phase
        if phase in ('LOBBY', 'EXPLORE') and not announce_round:
            self.round_id = None
            self.building_id = None
            self.target_floors = []
            self.dossier = None
            self._clear_round_inputs()
        if phase == 'CHALLENGE' and any(live_agent.safety_reason(p.text) == 'injection' for p in self.pitches.values()):
            self.mood = 'offended'
        if phase == 'CHALLENGE' and not pending_live:
            self.challenges = [fake_agent.challenge(p, self.dossier) for p in self.pitches.values()]
        if phase == 'VERDICT' and not pending_live:
            original = list(self.pitches.values())
            batches = [(fake_agent.verdict(original, self.dossier, self.city), original)]
            if self.revisions:
                revised = list(self.revisions.values())
                batches.append((fake_agent.verdict(revised, self.dossier, self.city), revised))
            try:
                self.verdict = validate_verdict(batches, dossier=self.dossier, player_ids=set(self.players),
                    round_id=self.round_id, city=self.city, sqft=target_sqft(self.dossier, self.target_floors))
            except ActionError as exc:
                log.error('Verdict rejected (%s)', type(exc).__name__)
                await self.broadcast('error', {'code': 'invalid_verdict', 'message': 'The judge could not validate a verdict. Try another round.'})
                await self._set_phase('EXPLORE')
                return
        if phase == 'VERDICT' and self.verdict and not pending_live:
            self._score_mood(batches)
        if phase == "INTRO" and self.dossier:
            self.intro = {**fake_agent.intro(self.dossier), "analyst_line": analyst_line(self.city.needs)}
        seconds = self.durations.get(phase)
        self.ends_at = utcnow() + timedelta(seconds=seconds) if seconds is not None and not pending_live else None
        self._save()
        if announce_round:
            await self.broadcast('round_started', {
                'round_id': self.round_id, 'building_id': self.building_id, 'target_floors': self.target_floors,
            })
        await self.broadcast('phase_changed', {
            'round_id': self.round_id, 'phase': self.phase,
            'ends_at': self.ends_at.isoformat() if self.ends_at else None,
        })
        if phase == 'INTRO' and self.dossier:
            await self.broadcast('building_intro', self.intro, to='screen')
        elif phase == 'CHALLENGE' and not pending_live:
            for challenge in self.challenges:
                payload = challenge.model_dump(exclude={'category_guess'})
                await self.broadcast('counteroffer', {**payload, 'audio_url': None, 'mood': self.mood})
        elif phase == 'VERDICT' and not pending_live:
            await self.broadcast('verdict', self.verdict.model_dump())
        if pending_live and phase in ('CHALLENGE', 'VERDICT'):
            if phase == 'CHALLENGE':
                for p in self.pitches.values():
                    if live_agent.safety_reason(p.text) == 'injection':
                        self.mood = 'offended'
                    await self.broadcast('counteroffer', dict(player_id=p.player_id,
                        line=live_agent.persona_for(self.dossier)['catchphrase'] or live_agent.THINKING,
                        fact_ids=[], counteroffer='', audio_url=None, mood=self.mood), to='screen')
            token = (self.round_id, self._round_seq, phase)
            self._agent_task = asyncio.create_task(self._finish_live(token))
        else:
            self._arm_timer(seconds)

    def _score_mood(self, batches) -> None:
        # Every original and revision is scored fresh. Mood follows each validated
        # pitch, while the round score still retains only the better submission.
        for proposal, pitches in batches:
            validated = validate_verdict([(proposal, pitches)], dossier=self.dossier,
                player_ids=set(self.players), round_id=self.round_id, city=self.city,
                sqft=target_sqft(self.dossier, self.target_floors))
            scores = {score.player_id: score for score in validated.scores}
            for pitch in pitches:
                self.mood = live_agent.mood_after(self.mood, scores[pitch.player_id].data_fit,
                    injection=live_agent.safety_reason(pitch.text) == 'injection')
        if self.intro:
            self.intro['mood'] = self.mood

    def _cancel_agent(self) -> None:
        if self._agent_task and not self._agent_task.done() and self._agent_task is not asyncio.current_task():
            self._agent_task.cancel()
        self._agent_task = None

    async def _finish_live(self, token: tuple) -> None:
        round_id, sequence, phase = token
        async def trace(event):
            if (self.round_id, self._round_seq, self.phase) == token:
                await self.broadcast('agent_step', event, to='screen')
                if event['step'] == 'fallback':
                    await self.broadcast('error', {'code': 'agent_fallback',
                        'message': 'The building is using its offline judge for this step.'})
        agent = live_agent.LiveAgent(emit=trace)
        self._last_live_agent = agent
        originals, revised = list(self.pitches.values()), list(self.revisions.values())
        memory = f'{self.city.buildings_revived} buildings revived in this game; {self.city.sqft_reimagined} square feet reimagined.'
        try:
            if phase == 'CHALLENGE':
                result = await agent.challenge(originals, self.dossier, self.city, self.mood, memory)
            else:
                result = await agent.verdict_batches(originals, revised, self.dossier, self.city,
                                                      self.challenges, self.mood, memory)
            async with self._lock:
                if (self.round_id, self._round_seq, self.phase) != token:
                    return
                if phase == 'CHALLENGE':
                    self.challenges = result
                    # Only grounded complete lines reach clients. Existing counteroffer messages
                    # replace cumulative prefixes, with no new event or untrusted token exposure.
                    for c in self.challenges:
                        payload = c.model_dump(exclude={'category_guess'})
                        words = c.line.split()
                        for end in range(4, len(words), 4):
                            await self.broadcast('counteroffer', {**payload, 'line': ' '.join(words[:end]),
                                'counteroffer': '', 'audio_url': None, 'mood': self.mood}, to='screen')
                            await asyncio.sleep(.015)
                        await self.broadcast('counteroffer', {**payload, 'audio_url': None, 'mood': self.mood})
                else:
                    try:
                        self.verdict = validate_verdict(result, dossier=self.dossier, player_ids=set(self.players),
                            round_id=round_id, city=self.city, sqft=target_sqft(self.dossier, self.target_floors))
                    except ActionError:
                        # The usual server validator is still the final authority.
                        await trace(dict(step='fallback', tool='actions', summary='Invalid proposal; offline judge', duration_ms=0))
                        batches = [(fake_agent.verdict(batch, self.dossier, self.city), batch)
                                   for batch in (originals, revised) if batch]
                        self.verdict = validate_verdict(batches, dossier=self.dossier, player_ids=set(self.players),
                            round_id=round_id, city=self.city, sqft=target_sqft(self.dossier, self.target_floors))
                        result = batches
                    self._score_mood(result)
                    await self.broadcast('room_state', self.snapshot())
                    await self.broadcast('verdict', self.verdict.model_dump())
                seconds = self.durations.get(phase)
                self.ends_at = utcnow() + timedelta(seconds=seconds) if seconds is not None else None
                self._save()
                await self.broadcast('phase_changed', {'round_id': round_id, 'phase': phase,
                    'ends_at': self.ends_at.isoformat() if self.ends_at else None})
                self._arm_timer(seconds)
        except asyncio.CancelledError:
            return
        except Exception as exc:
            # A failed live task has no phase timer yet. Recover under the same
            # round guard so an old task can never overwrite a reset/new round.
            log.error('Live room step failed (%s)', type(exc).__name__)
            async with self._lock:
                if (self.round_id, self._round_seq, self.phase) != token:
                    return
                await trace(dict(step='fallback', tool='room', summary='Unexpected live failure; offline judge', duration_ms=0))
                try:
                    if phase == 'CHALLENGE':
                        self.challenges = [fake_agent.challenge(p, self.dossier, variant=i)
                                           for i, p in enumerate(originals)]
                        for c in self.challenges:
                            await self.broadcast('counteroffer', {**c.model_dump(exclude={'category_guess'}),
                                'audio_url': None, 'mood': self.mood})
                    else:
                        batches = [(fake_agent.verdict(batch, self.dossier, self.city), batch)
                                   for batch in (originals, revised) if batch]
                        self.verdict = validate_verdict(batches, dossier=self.dossier, player_ids=set(self.players),
                            round_id=round_id, city=self.city, sqft=target_sqft(self.dossier, self.target_floors))
                        self._score_mood(batches)
                        await self.broadcast('room_state', self.snapshot())
                        await self.broadcast('verdict', self.verdict.model_dump())
                    seconds = self.durations.get(phase)
                    self.ends_at = utcnow() + timedelta(seconds=seconds) if seconds is not None else None
                    self._save()
                    await self.broadcast('phase_changed', {'round_id': round_id, 'phase': phase,
                        'ends_at': self.ends_at.isoformat() if self.ends_at else None})
                    self._arm_timer(seconds)
                except Exception as recovery:
                    log.error('Offline room recovery failed (%s)', type(recovery).__name__)
                    await self.broadcast('error', {'code': 'invalid_verdict',
                        'message': 'The judge could not validate this step. Try another round.'})
                    await self._set_phase('EXPLORE')

    async def advance(self, expected: tuple | None = None) -> None:
        async with self._lock:
            if expected is not None and (self.phase, self._round_seq, self.ends_at) != expected:
                return
            if self.phase == 'VERDICT' and self._agent_task and not self._agent_task.done():
                return
            if self.phase == 'POWER_UP':
                await self._revive(auto_completed=True)
            else:
                await self._set_phase(NEXT_PHASE[self.phase])

    async def reset_round(self) -> None:
        await self.set_phase('EXPLORE')

    async def reset_room(self) -> None:
        async with self._lock:
            self.players.clear()
            self.city = City()
            self.revived.clear()
            self.floor_states.clear()
            self.committed_rounds.clear()
            await self._set_phase('LOBBY')
            await self.broadcast('room_state', self.snapshot())

    def _check_round(self, round_id: str | None, phase: str) -> None:
        if self.phase != phase:
            raise RoomError('wrong_phase', f'This command requires {phase}.')
        if not self.round_id or round_id != self.round_id:
            raise RoomError('stale_round', 'This command is for an earlier round.')

    async def submit_pitch(self, player_id: str, text: str, origin: str, round_id: str | None, revision: bool) -> None:
        async with self._lock:
            self._check_round(round_id, 'NEGOTIATE' if revision else 'PITCH')
            if revision and player_id not in self.pitches:
                raise RoomError('no_pitch', 'Submit an original pitch before revising.')
            if revision and player_id in self.revisions:
                raise RoomError('already_revised', 'Each player can revise once.')
            pitch = Pitch(player_id=player_id, text=text, origin=origin, revision=revision, at=utcnow())
            (self.revisions if revision else self.pitches)[player_id] = pitch
            self._save()
            await self.broadcast('pitch_received', {'player_id': player_id, 'text': text, 'origin': origin}, to='screen')

    async def contribute_energy(self, player_id: str, nonce: str, round_id: str | None) -> None:
        async with self._lock:
            self._check_round(round_id, 'POWER_UP')
            if nonce in self.energy_nonces.get(player_id, set()):
                return
            now = monotonic()
            previous = self._energy_clock.get(player_id)
            if previous is not None and now - previous < .6 - 1e-9:
                raise RoomError('rate_limited', 'Let the charge settle before tapping again.')
            self._energy_clock[player_id] = now
            self.energy_at[player_id] = utcnow()
            self.energy_nonces.setdefault(player_id, set()).add(nonce)
            self.charge = min(100, self.charge + 25)
            self._save()
            await self.broadcast('energy_updated', {'charge': self.charge, 'by_player_id': player_id})
            if self.charge == 100:
                await self._revive(auto_completed=False)

    async def _revive(self, auto_completed: bool) -> None:
        if not self.round_id or self.round_id in self.committed_rounds:
            return
        if not self.verdict or not self.dossier or not self.building_id:
            raise RoomError('no_verdict', 'A validated verdict is required to revive floors.')
        try:
            event = validate_revival(round_id=self.round_id, committed_rounds=self.committed_rounds,
                dossier=self.dossier, target_floors=self.target_floors,
                revived_floors=set(self.revived.get(self.building_id, {}).get('floors', [])),
                verdict=self.verdict, player_colors={pid: p.color for pid, p in self.players.items()},
                auto_completed=auto_completed)
        except ActionError as exc:
            raise RoomError('invalid_revival', str(exc)) from exc
        if event is None:
            return
        self._cancel_timer()
        bid, floors, sqft, color = (event[key] for key in ('building_id', 'floors', 'sqft', 'color'))
        self.city.revive(bid, floors, self.verdict.category, sqft)
        self.revived[bid] = {'floors': sorted(set(self.revived.get(bid, {}).get('floors', [])) | set(floors)), 'color': color}
        states = self.floor_states.setdefault(bid, {})
        for floor in self.dossier['floors']:
            if floor['number'] in floors:
                states[str(floor['number'])] = {'source_status': floor['source_status'], 'game_status': 'revived', 'color': color}
        self.committed_rounds.add(self.round_id)
        self.auto_completed = auto_completed
        old_charge = self.charge
        self.charge = 100
        # Persist the commit and REVIVED phase together before broadcasting. Reloads cannot replay it.
        self.phase = 'REVIVED'
        seconds = self.durations.get('REVIVED')
        self.ends_at = utcnow() + timedelta(seconds=seconds) if seconds is not None else None
        self._save()
        if old_charge < 100:
            await self.broadcast('energy_updated', {'charge': 100, 'by_player_id': None})
        await self.broadcast('building_revived', event)
        await self.broadcast('neighborhood_updated', {'needs': dict(self.city.needs), 'most_needed': most_needed(self.city.needs)}, to='screen')
        await self.broadcast('phase_changed', {'round_id': self.round_id, 'phase': self.phase,
            'ends_at': self.ends_at.isoformat() if self.ends_at else None})
        await self.broadcast('room_state', self.snapshot(), to='play')
        self._arm_timer(seconds)

    # ---- timers ------------------------------------------------------
    def _arm_timer(self, seconds: float | None) -> None:
        if seconds is None:
            return
        token = (self.phase, self._round_seq, self.ends_at)

        async def fire() -> None:
            await asyncio.sleep(max(0.0, seconds))
            if (self.phase, self._round_seq, self.ends_at) == token:  # skipped/reset meanwhile
                await self.advance(expected=token)

        self._timer = asyncio.get_running_loop().create_task(fire())

    def _cancel_timer(self) -> None:
        if self._timer and not self._timer.done() and self._timer is not asyncio.current_task():
            self._timer.cancel()
        self._timer = None

    def close(self) -> None:
        self._cancel_timer()
        self._cancel_agent()

    # ---- persistence (phase changes only, never pointer events) -------
    def _path(self) -> Path | None:
        return self.state_dir / f"{self.code}.json" if self.state_dir else None

    def _save(self) -> None:
        path = self._path()
        if not path:
            return
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            data = self.snapshot() | {"round_seq": self._round_seq, 'dossier': self.dossier,
                'committed_rounds': sorted(self.committed_rounds), 'counted_floors': self.city.counted,
                'energy_nonces': {pid: sorted(nonces) for pid, nonces in self.energy_nonces.items()},
                'energy_at': {pid: at.isoformat() for pid, at in self.energy_at.items()}}
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
        room.dossier = data.get('dossier')
        room.intro = data.get('intro')
        room.mood = data.get('mood', (room.intro or {}).get('mood', 'hopeful'))
        room.pitches = {p['player_id']: Pitch.model_validate(p) for p in data.get('pitches', [])}
        room.revisions = {p['player_id']: Pitch.model_validate(p) for p in data.get('revisions', [])}
        room.challenges = [Challenge.model_validate(c) for c in data.get('challenges', [])]
        room.verdict = Verdict.model_validate(data['verdict']) if data.get('verdict') else None
        room.charge = data.get('charge', 0)
        room.auto_completed = data.get('auto_completed', False)
        room.revived = data.get('revived', {})
        room.floor_states = data.get('floor_states', {})
        room.committed_rounds = set(data.get('committed_rounds', []))
        if 'city' in data:
            city = data['city']
            room.city = City(needs=city['needs'], buildings_revived=city['buildings_revived'],
                sqft_reimagined=city['sqft_reimagined'], song_categories=list(city.get('song_categories', [])), counted=data.get('counted_floors', {}))
        room.energy_nonces = {pid: set(nonces) for pid, nonces in data.get('energy_nonces', {}).items()}
        room.energy_at = {pid: datetime.fromisoformat(at) for pid, at in data.get('energy_at', {}).items()}
        for pid, at in room.energy_at.items():
            elapsed = max(0, (utcnow() - at).total_seconds())
            room._energy_clock[pid] = monotonic() - elapsed
        return room

    def resume_timer(self) -> None:
        """After a restart, continue the interrupted phase timer (fires immediately if overdue)."""
        if self.phase in ('CHALLENGE', 'VERDICT') and self.ends_at is None:
            if live_agent.enabled():
                self._agent_task = asyncio.create_task(self._finish_live((self.round_id, self._round_seq, self.phase)))
            else:
                self._agent_task = asyncio.create_task(self.set_phase(self.phase))
        elif self.ends_at is not None:
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
