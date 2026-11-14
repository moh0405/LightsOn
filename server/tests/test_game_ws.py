"""Real transport coverage for typing, disconnects and consecutive timer-driven rounds."""
from fastapi.testclient import TestClient

from app.main import app


def until(ws, kind, predicate=lambda event: True, limit=150):
    for _ in range(limit):
        event = ws.receive_json()
        if event['type'] == 'error':
            raise AssertionError(event)
        if event['type'] == kind and predicate(event):
            return event
    raise AssertionError(f'No {kind} event')


def phase(ws, name):
    return until(ws, 'phase_changed', lambda event: event['phase'] == name)


def test_five_rounds_by_typing_and_timers(game_mode, monkeypatch, tmp_path):
    monkeypatch.setenv('STATE_DIR', str(tmp_path))
    monkeypatch.setenv('PHASE_DURATIONS_SCALE', '.02')
    with TestClient(app) as client:
        code = client.post('/api/rooms').json()['room']
        with client.websocket_connect(f'/ws/{code}?role=screen') as screen, \
             client.websocket_connect(f'/ws/{code}?role=play') as p1, \
             client.websocket_connect(f'/ws/{code}?role=play') as p2:
            screen.receive_json(); p1.receive_json(); p2.receive_json()
            player_ids = []
            for i, phone in enumerate([p1, p2]):
                phone.send_json(dict(type='join', nickname=f'Player {i}', nonce=f'join-{i}'))
                player_ids.append(until(phone, 'ack')['result']['player_id'])
            phase(screen, 'EXPLORE')
            observed = []
            charged_floors = set()
            for index in range(5):
                building = '233953' if index < 4 else '233899'
                p1.send_json(dict(type='wake', building_id=building, nonce=f'wake-{index}'))
                started = until(screen, 'round_started')
                round_id = started['round_id']
                intro = until(screen, 'building_intro')
                assert intro['audio_url'] is None and 'game simulation' in intro['analyst_line']
                phase(screen, 'PITCH')
                for phone in [p1, p2]:
                    phone.send_json(dict(type='submit_pitch', round_id=round_id, text='A gaming arena', nonce=f'pitch-{index}'))
                received = [until(screen, 'pitch_received') for _ in range(2)]
                phase(screen, 'CHALLENGE')
                challenges = [until(screen, 'counteroffer') for _ in range(2)]
                assert all(c['fact_ids'] and c['counteroffer'] for c in challenges)
                assert all(bid in c['fact_ids'][0] for c in challenges for bid in [building])
                phase(screen, 'NEGOTIATE')
                p1.send_json(dict(type='revise_pitch', round_id=round_id,
                    text='A gaming arena with a shared space open to everyone', nonce=f'revise-{index}'))
                until(screen, 'pitch_received')
                phase(screen, 'VERDICT')
                verdict = until(screen, 'verdict')
                assert len(verdict['scores']) == 2
                assert verdict['winner_player_id'] == player_ids[0]
                for score in verdict['scores']:
                    assert score['total'] == sum(score[k] for k in ['data_fit', 'neighborhood_fit', 'creativity', 'charm'])
                phase(screen, 'POWER_UP')
                for number, phone in enumerate([p1, p2]):
                    phone.send_json(dict(type='contribute_energy', round_id=round_id, nonce=f'energy-{index}-{number}'))
                energy = [until(screen, 'energy_updated') for _ in range(2)]
                assert [e['charge'] for e in energy] == [25, 50]
                revived = until(screen, 'building_revived')
                assert revived['auto_completed'] is True and revived['sqft'] > 0
                assert not charged_floors & {(building, f) for f in revived['floors']}
                charged_floors.update((building, f) for f in revived['floors'])
                city = until(screen, 'neighborhood_updated')
                phase(screen, 'REVIVED')
                phase(screen, 'EXPLORE')
                observed.append((revived, city))
            # A new screen gets enough data to restore all colors and meters without replaying commits.
            with client.websocket_connect(f'/ws/{code}?role=screen') as reload:
                state = reload.receive_json()
                assert state['city']['buildings_revived'] == 2
                assert state['city']['sqft_reimagined'] == sum(e[0]['sqft'] for e in observed)
                assert state['city']['needs'] == observed[-1][1]['needs']
                assert state['revived']['233953']['floors'] == [6, 7, 8, 17, 18, 20, 21, 24]
                assert state['phase'] == 'EXPLORE'
                assert len(app.state.manager.rooms[code].committed_rounds) == 5


def test_disconnected_player_pitch_survives_and_unjoined_socket_cannot_charge(game_mode, monkeypatch, tmp_path):
    monkeypatch.setenv('STATE_DIR', str(tmp_path))
    monkeypatch.setenv('HOST_PIN', '1234')
    with TestClient(app) as client:
        code = client.post('/api/rooms').json()['room']
        with client.websocket_connect(f'/ws/{code}?role=admin') as admin, \
             client.websocket_connect(f'/ws/{code}?role=play') as p1:
            admin.receive_json(); p1.receive_json()
            p1.send_json(dict(type='join', nickname='Ann'))
            pid = until(p1, 'ack')['result']['player_id']
            with client.websocket_connect(f'/ws/{code}?role=play') as p2:
                p2.receive_json()
                p2.send_json(dict(type='join', nickname='Bo'))
                until(p2, 'ack')
                p1.send_json(dict(type='wake', building_id='233953'))
                rid = until(p1, 'round_started')['round_id']
                admin.send_json(dict(type='host_action', action='skip_phase', pin='1234'))
                phase(p1, 'PITCH')
                p2.send_json(dict(type='submit_pitch', round_id=rid, text='A museum'))
                until(p2, 'ack')
            for expected in ['CHALLENGE', 'NEGOTIATE', 'VERDICT', 'POWER_UP']:
                admin.send_json(dict(type='host_action', action='skip_phase', pin='1234'))
                phase(p1, expected)
            assert len(app.state.manager.rooms[code].verdict.scores) == 1
            with client.websocket_connect(f'/ws/{code}?role=play') as stranger:
                stranger.receive_json()
                stranger.send_json(dict(type='contribute_energy', round_id=rid, player_id=pid, nonce='spoof'))
                error = stranger.receive_json()
                assert error['type'] == 'error' and error['code'] == 'not_joined'
            with client.websocket_connect(f'/ws/{code}?role=play&player_id={pid}') as reconnect:
                state = reconnect.receive_json()
                assert state['phase'] == 'POWER_UP' and len(state['pitches']) == 1 and state['verdict']
