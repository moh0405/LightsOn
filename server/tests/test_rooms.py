import asyncio

import pytest

from app.commands import CommandService
from app.rooms import NEXT_PHASE, PHASE_ORDER, Conn, RoomError, RoomManager

HEROES = ["233953", "233899"]


def make(tmp_path, durations=None):
    mgr = RoomManager(HEROES, tmp_path, durations)
    return mgr, CommandService(mgr)


class Sink:
    """Collects events sent to a fake connection."""
    def __init__(self, role="screen"):
        self.events: list[dict] = []
        self.conn = Conn(role=role, send=self._send)

    async def _send(self, msg):
        self.events.append(msg)

    def types(self):
        return [e["type"] for e in self.events]


async def join(cmds, room, name, sink=None):
    conn = sink.conn if sink else None
    return await cmds.handle({"type": "join", "room": room.code, "nickname": name}, "web", conn)


async def test_phase_order_is_a_cycle():
    seen, p = [], "LOBBY"
    for _ in range(len(PHASE_ORDER)):
        seen.append(p)
        p = NEXT_PHASE[p]
    assert seen == PHASE_ORDER and p == "EXPLORE"


async def test_full_round_via_host_skip(tmp_path, monkeypatch):
    monkeypatch.setenv("HOST_PIN", "1234")
    mgr, cmds = make(tmp_path)
    room = mgr.create()
    a = await join(cmds, room, "Ann")
    await join(cmds, room, "Bo")
    assert room.phase == "EXPLORE"  # two players leave the lobby
    await cmds.handle({"type": "wake", "room": room.code, "player_id": a["player_id"], "building_id": "233953"}, "web")
    assert room.phase == "INTRO" and room.round_id and room.building_id == "233953"
    walked = []
    while room.phase != "EXPLORE":
        await cmds.handle({"type": "host_action", "room": room.code, "action": "skip_phase", "pin": "1234"}, "host")
        walked.append(room.phase)
    assert walked == ["PITCH", "CHALLENGE", "NEGOTIATE", "VERDICT", "POWER_UP", "REVIVED", "EXPLORE"]
    assert room.round_id is None and room.building_id is None
    mgr.close()


async def test_wrong_phase_rejected(tmp_path):
    mgr, cmds = make(tmp_path)
    room = mgr.create()
    a = await join(cmds, room, "Ann")
    pid = a["player_id"]
    assert room.phase == "LOBBY"
    for cmd in ({"type": "wake", "building_id": "233953"}, {"type": "pointer", "x": 0.5, "y": 0.5}):
        with pytest.raises(RoomError) as e:
            await cmds.handle({**cmd, "room": room.code, "player_id": pid}, "web")
        assert e.value.code == "wrong_phase"
    await join(cmds, room, "Bo")
    with pytest.raises(RoomError) as e:  # not a hero building
        await cmds.handle({"type": "wake", "room": room.code, "player_id": pid, "building_id": "1"}, "web")
    assert e.value.code == "unknown_building"
    await cmds.handle({"type": "wake", "room": room.code, "player_id": pid, "building_id": "233953"}, "web")
    with pytest.raises(RoomError) as e:  # first wake wins
        await cmds.handle({"type": "wake", "room": room.code, "player_id": pid, "building_id": "233899"}, "web")
    assert e.value.code == "wrong_phase" and room.building_id == "233953"
    mgr.close()


async def test_host_actions_need_pin(tmp_path, monkeypatch):
    monkeypatch.setenv("HOST_PIN", "1234")
    mgr, cmds = make(tmp_path)
    room = mgr.create()
    for pin in (None, "", "0000"):
        with pytest.raises(RoomError) as e:
            await cmds.handle({"type": "host_action", "room": room.code, "action": "skip_phase", "pin": pin}, "host")
        assert e.value.code == "bad_pin"
    assert room.phase == "LOBBY"
    monkeypatch.delenv("HOST_PIN")  # unset PIN must never open the door
    with pytest.raises(RoomError):
        await cmds.handle({"type": "host_action", "room": room.code, "action": "skip_phase", "pin": ""}, "host")


async def test_room_full_and_colors(tmp_path):
    mgr, cmds = make(tmp_path)
    room = mgr.create()
    colors = {(await join(cmds, room, f"p{i}"))["color"] for i in range(4)}
    assert len(colors) == 4
    with pytest.raises(RoomError) as e:
        await join(cmds, room, "late")
    assert e.value.code == "room_full"


async def test_pointer_goes_to_screen_only(tmp_path):
    mgr, cmds = make(tmp_path)
    room = mgr.create()
    screen, phone = Sink("screen"), Sink("play")
    room.conns += [screen.conn, phone.conn]
    a = await join(cmds, room, "Ann", phone)
    await join(cmds, room, "Bo")
    await cmds.handle({"type": "pointer", "room": room.code, "player_id": a["player_id"], "x": 2, "y": -1}, "web")
    ptr = [e for e in screen.events if e["type"] == "pointer"]
    assert ptr and ptr[0]["x"] == 1.0 and ptr[0]["y"] == 0.0 and ptr[0]["color"] == a["color"]
    assert "pointer" not in phone.types()
    mgr.close()


async def test_timers_fire_and_phase_changed_carries_ends_at(tmp_path):
    fast = {"INTRO": 0.05, "PITCH": 0.05, "CHALLENGE": None}
    mgr, cmds = make(tmp_path, fast)
    room = mgr.create()
    screen = Sink()
    room.conns.append(screen.conn)
    a = await join(cmds, room, "Ann")
    await join(cmds, room, "Bo")
    await cmds.handle({"type": "wake", "room": room.code, "player_id": a["player_id"], "building_id": "233953"}, "web")
    await asyncio.sleep(0.3)
    assert room.phase == "CHALLENGE" and room.ends_at is None
    changes = [e for e in screen.events if e["type"] == "phase_changed"]
    assert [c["phase"] for c in changes][-3:] == ["INTRO", "PITCH", "CHALLENGE"]
    assert changes[-3]["ends_at"] and changes[-1]["ends_at"] is None
    mgr.close()


async def test_skip_cancels_old_timer(tmp_path, monkeypatch):
    monkeypatch.setenv("HOST_PIN", "1234")
    mgr, cmds = make(tmp_path, {"INTRO": 0.1, "PITCH": None})
    room = mgr.create()
    a = await join(cmds, room, "Ann")
    await join(cmds, room, "Bo")
    await cmds.handle({"type": "wake", "room": room.code, "player_id": a["player_id"], "building_id": "233953"}, "web")
    await cmds.handle({"type": "host_action", "room": room.code, "action": "skip_phase", "pin": "1234"}, "host")
    await asyncio.sleep(0.25)
    assert room.phase == "PITCH"  # the stale INTRO timer did not skip a second time
    mgr.close()


async def test_snapshot_restores_after_restart(tmp_path):
    mgr, cmds = make(tmp_path)
    room = mgr.create("ABCD")
    a = await join(cmds, room, "Ann")
    await join(cmds, room, "Bo")
    await cmds.handle({"type": "wake", "room": "ABCD", "player_id": a["player_id"], "building_id": "233899"}, "web")
    mgr.close()
    mgr2, _ = make(tmp_path)
    back = mgr2.get("abcd")
    assert back and back.phase == "INTRO" and back.building_id == "233899"
    assert [p.nickname for p in back.players.values()] == ["Ann", "Bo"]
    assert all(not p.connected for p in back.players.values())
    assert mgr2.get("../x") is None  # room codes never reach the filesystem unchecked
    mgr2.close()


@pytest.mark.parametrize('mode', ['kit', 'fixtures'])
def test_new_room_defaults_to_process_data_mode(tmp_path, monkeypatch, mode):
    monkeypatch.setenv('DATA_MODE', mode)
    mgr, _ = make(tmp_path)
    assert mgr.create().snapshot()['data_mode'] == mode


def test_restored_room_uses_current_process_provider(tmp_path, monkeypatch):
    monkeypatch.setenv('DATA_MODE', 'kit')
    mgr, _ = make(tmp_path)
    room = mgr.create('ABCD')
    assert room.data_mode == 'kit'
    mgr.close()
    monkeypatch.setenv('DATA_MODE', 'fixtures')
    restored, _ = make(tmp_path)
    assert restored.get('ABCD').snapshot()['data_mode'] == 'fixtures'
    restored.close()
