import asyncio

import pytest

from app.commands import CommandService
from app.rooms import Conn, RoomError, RoomManager


@pytest.fixture
def game(game_mode, tmp_path):
    manager = RoomManager(['233953', '233899'], tmp_path, durations={})
    room = manager.create('ABCD')
    room.durations = {}  # all phases under test control
    events = []
    async def send(event): events.append(event)
    room.conns.append(Conn(role='screen', send=send))
    commands = CommandService(manager)
    yield room, commands, events, manager
    manager.close()


async def setup(game):
    room, commands, _, _ = game
    players = []
    for name in ['Ann', 'Bo']:
        players.append((await commands.handle(dict(type='join', room=room.code, nickname=name), 'web'))['player_id'])
    await commands.handle(dict(type='wake', room=room.code, player_id=players[0], building_id='233953'), 'web')
    return players


async def command(game, pid, kind, **kw):
    room, commands, _, _ = game
    return await commands.handle(dict(type=kind, room=room.code, player_id=pid, round_id=room.round_id, **kw), 'web')


async def pitch_to_power(game):
    room, _, _, _ = game
    a, b = await setup(game)
    await room.advance()
    for pid in [a, b]: await command(game, pid, 'submit_pitch', text='A gaming arena')
    await room.advance()
    await room.advance()
    await command(game, a, 'revise_pitch', text='A gaming arena with a shared space open to everyone')
    await room.advance()
    await room.advance()
    assert room.phase == 'POWER_UP'
    return a, b


async def test_phase_events_and_revision_once(game):
    room, _, events, _ = game
    a, b = await setup(game)
    assert events[-1]['type'] == 'building_intro' and events[-1]['analyst_line']
    assert room.target_floors == [6, 7, 8]
    with pytest.raises(RoomError, match='PITCH'): await command(game, a, 'submit_pitch', text='hello')
    await room.advance()
    await command(game, a, 'submit_pitch', text='  museum  ')
    await command(game, a, 'submit_pitch', text='gaming arena')
    await command(game, b, 'submit_pitch', text='clinic')
    room.players[b].connected = False
    assert room.pitches[a].text == 'gaming arena'
    await room.advance()
    assert len([e for e in events if e['type'] == 'counteroffer']) == 2
    await room.advance()
    await command(game, a, 'revise_pitch', text='A gaming arena open to everyone')
    with pytest.raises(RoomError) as error: await command(game, a, 'revise_pitch', text='again')
    assert error.value.code == 'already_revised'
    await room.advance()
    assert room.verdict.winner_player_id == a
    assert any(s.player_id == b for s in room.verdict.scores)
    assert events[-1]['type'] == 'verdict'


@pytest.mark.parametrize('text', ['', '  ', 'a' * 281, None, 123])
async def test_pitch_text_validation(game, text):
    room, _, _, _ = game
    a, _ = await setup(game)
    await room.advance()
    with pytest.raises(RoomError) as error: await command(game, a, 'submit_pitch', text=text)
    assert error.value.code == 'bad_payload' and not room.pitches


async def test_round_identity_and_revision_requires_pitch(game):
    room, commands, _, _ = game
    a, b = await setup(game)
    await room.advance()
    with pytest.raises(RoomError) as error:
        await commands.handle(dict(type='submit_pitch', room=room.code, player_id=a, round_id='old', text='museum'), 'web')
    assert error.value.code == 'stale_round'
    await command(game, a, 'submit_pitch', text='museum')
    await room.advance()
    await room.advance()
    with pytest.raises(RoomError) as error: await command(game, b, 'revise_pitch', text='museum')
    assert error.value.code == 'no_pitch'


async def test_no_pitches_returns_to_explore(game):
    room, _, events, _ = game
    await setup(game)
    await room.advance()
    await room.advance()
    assert room.phase == 'EXPLORE' and room.round_id is None
    assert any(e['type'] == 'error' and e['code'] == 'no_pitches' for e in events)


async def test_energy_rate_dedupe_cap_and_concurrent_revive_once(game, monkeypatch):
    room, _, events, _ = game
    a, b = await pitch_to_power(game)
    now = [10.0]
    monkeypatch.setattr('app.rooms.monotonic', lambda: now[0])
    await command(game, a, 'contribute_energy', nonce='a1')
    await command(game, a, 'contribute_energy', nonce='a1')
    assert room.charge == 25
    with pytest.raises(RoomError) as error: await command(game, a, 'contribute_energy', nonce='a2')
    assert error.value.code == 'rate_limited'
    await command(game, b, 'contribute_energy', nonce='b1')
    now[0] += .601
    results = await asyncio.gather(*(command(game, pid, 'contribute_energy', nonce=nonce)
        for pid, nonce in [(a, 'a2'), (b, 'b2'), (a, 'a3'), (b, 'b3')]), return_exceptions=True)
    assert any(isinstance(r, RoomError) for r in results)
    assert room.phase == 'REVIVED' and room.charge == 100
    revived = [e for e in events if e['type'] == 'building_revived']
    assert len(revived) == 1 and revived[0]['floors'] == [6, 7, 8]
    assert revived[0]['sqft'] == 94509 and revived[0]['auto_completed'] is False
    assert room.city.sqft_reimagined == 94509
    assert room.snapshot()['revived']['233953']['floors'] == [6, 7, 8]
    assert all(f['source_status'] == 'dark' and f['game_status'] == 'revived'
               for f in room.floor_states['233953'].values())
    assert [e['type'] for e in events][-3:] == ['building_revived', 'neighborhood_updated', 'phase_changed']


async def test_energy_wrong_phase_nonplayer_and_missing_nonce(game):
    room, _, _, _ = game
    a, _ = await setup(game)
    with pytest.raises(RoomError) as error: await command(game, a, 'contribute_energy', nonce='n')
    assert error.value.code == 'wrong_phase'
    await room.advance()
    await command(game, a, 'submit_pitch', text='housing')
    for _ in range(4): await room.advance()
    with pytest.raises(RoomError) as error: await command(game, 'outsider', 'contribute_energy', nonce='n')
    assert error.value.code == 'not_joined'
    with pytest.raises(RoomError) as error: await command(game, a, 'contribute_energy')
    assert error.value.code == 'bad_payload'


async def test_auto_complete_and_restart_snapshot(game, monkeypatch):
    room, _, events, manager = game
    a, _ = await pitch_to_power(game)
    await command(game, a, 'contribute_energy', nonce='n')
    manager.close()
    restored = RoomManager(manager.hero_ids, manager.state_dir, durations={})
    back = restored.get(room.code)
    assert back.charge == 25 and back.verdict == room.verdict and back.pitches == room.pitches
    back_events = []
    async def send(event): back_events.append(event)
    back.conns.append(Conn(role='screen', send=send))
    await back.advance()
    assert back.phase == 'REVIVED' and back.charge == 100
    assert [e for e in back_events if e['type'] == 'building_revived'][0]['auto_completed'] is True
    restored.close()
    again = RoomManager(manager.hero_ids, manager.state_dir, durations={})
    reloaded = again.get(room.code)
    assert reloaded.city.snapshot() == back.city.snapshot()
    assert reloaded.floor_states == back.floor_states and reloaded.revived == back.revived
    assert len(reloaded.committed_rounds) == 1
    again.close()


async def test_timer_auto_completion(game):
    room, _, events, _ = game
    await pitch_to_power(game)
    room._arm_timer(.01)
    await asyncio.sleep(.05)
    assert room.phase == 'REVIVED'
    assert len([e for e in events if e['type'] == 'building_revived' and e['auto_completed']]) == 1


async def test_repeated_building_uses_fresh_floors_and_exhaustion(game):
    room, commands, events, _ = game
    a, _ = await setup(game)
    phone_events = []
    async def send_phone(event): phone_events.append(event)
    room.conns.append(Conn(role='play', send=send_phone, player_id=a))
    rounds = 0
    while True:
        await room.advance()
        await command(game, a, 'submit_pitch', text='museum')
        for _ in range(5): await room.advance()
        assert room.phase == 'REVIVED'
        assert phone_events[-1]['type'] == 'room_state'
        assert phone_events[-1]['hero_building_ids'] == room.wakeable_ids()
        rounds += 1
        await room.advance()
        try:
            await commands.handle(dict(type='wake', room=room.code, player_id=a, building_id='233953'), 'web')
        except RoomError as error:
            assert error.code == 'no_dark_floors'
            break
    last_state = [e for e in phone_events if e['type'] == 'room_state'][-1]
    assert '233953' not in last_state['hero_building_ids']
    assert rounds >= 4
    assert room.city.sqft_reimagined == 150365
    assert room.city.buildings_revived == 1
    assert '233953' not in room.snapshot()['hero_building_ids']
    assert any(bid not in ['233953', '233899'] for bid in room.snapshot()['hero_building_ids'])
    await room.reset_room()
    last_state = [e for e in phone_events if e['type'] == 'room_state'][-1]
    assert '233953' in last_state['hero_building_ids']


async def test_stale_power_timer_cannot_skip_revived_and_reset_keeps_city(game, monkeypatch):
    room, _, _, _ = game
    a, b = await pitch_to_power(game)
    stale_token = (room.phase, room._round_seq, room.ends_at)
    now = [10.0]
    monkeypatch.setattr('app.rooms.monotonic', lambda: now[0])
    for pid in [a, b]: await command(game, pid, 'contribute_energy', nonce='first')
    now[0] += .6  # the boundary itself is accepted
    for pid in [a, b]: await command(game, pid, 'contribute_energy', nonce='second')
    await room.advance(expected=stale_token)
    assert room.phase == 'REVIVED'
    city = room.city.snapshot()
    await room.reset_round()
    assert not room.pitches and not room.revisions and room.verdict is None and room.charge == 0
    assert room.city.snapshot() == city and room.revived
    await room.reset_room()
    assert room.phase == 'LOBBY' and not room.revived and room.city.sqft_reimagined == 0


async def test_context_buildings_can_be_woken_with_their_own_facts(game):
    room, commands, events, _ = game
    a, _ = await setup(game)
    await room.reset_round()
    context = next(bid for bid in room.snapshot()['hero_building_ids'] if bid not in room.hero_ids)
    await commands.handle(dict(type='wake', room=room.code, player_id=a, building_id=context), 'web')
    assert room.building_id == context and room.target_floors
    await room.advance()
    await command(game, a, 'submit_pitch', text='A library')
    await room.advance()
    challenge = next(e for e in reversed(events) if e['type'] == 'counteroffer')
    assert challenge['fact_ids'] and all(context in fid for fid in challenge['fact_ids'])


async def test_different_winner_colors_survive_reload(game):
    room, commands, _, manager = game
    a, b = await setup(game)
    for index, winner in enumerate([a, b]):
        if index:
            await commands.handle(dict(type='wake', room=room.code, player_id=b, building_id='233953'), 'web')
        await room.advance()
        await command(game, winner, 'submit_pitch', text='A community library open to everyone')
        for _ in range(5): await room.advance()
        assert room.phase == 'REVIVED' and room.verdict.winner_player_id == winner
        await room.advance()
    assert room.floor_states['233953']['6']['color'] == room.players[a].color
    assert room.floor_states['233953']['17']['color'] == room.players[b].color
    assert room.revived['233953']['floors'] == [6, 7, 8, 17, 18]
    manager.close()
    restored = RoomManager(manager.hero_ids, manager.state_dir)
    state = restored.get(room.code).snapshot()
    assert state['floor_states'] == room.floor_states
    assert state['city']['sqft_reimagined'] == 127569
    restored.close()


async def test_intro_survives_pitch_snapshot_and_restart(game):
    room, _, events, manager = game
    await setup(game)
    intro = {k: v for k, v in events[-1].items() if k != 'type'}
    assert room.snapshot()['intro'] == intro
    await room.advance()
    assert room.snapshot()['intro'] == intro
    manager.close()
    restored = RoomManager(manager.hero_ids, manager.state_dir, durations={})
    back = restored.get(room.code)
    assert back.phase == 'PITCH' and back.snapshot()['intro'] == intro
    await back.reset_round()
    assert back.snapshot()['intro'] is None
    await back.start_round('233899')
    assert back.snapshot()['intro'] != intro
    await back.reset_room()
    assert back.snapshot()['intro'] is None
    restored.close()
