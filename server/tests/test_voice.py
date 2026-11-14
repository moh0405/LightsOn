import httpx
import pytest
from fastapi.testclient import TestClient
from app.voice import tts, stt
from app.main import app


@pytest.fixture(autouse=True)
def no_live_voice(monkeypatch):
    monkeypatch.delenv('ELEVENLABS_API_KEY', raising=False)


def test_tts_fallback_stream_cache(monkeypatch, tmp_path):
    assert tts.render_speech('Game invitation.', 'voice') is None
    monkeypatch.setenv('ELEVENLABS_API_KEY', 'test-secret')
    monkeypatch.setattr(tts, 'CACHE', tmp_path)
    requests = []
    def respond(request):
        requests.append(request)
        assert request.url.path.endswith('/stream')
        return httpx.Response(200, content=b'audio', headers={'content-type': 'audio/mpeg'})
    with httpx.Client(transport=httpx.MockTransport(respond)) as client:
        first = tts.render_speech('Game invitation.', 'voice', client=client)
        assert first and first.endswith('.mp3')
        assert tts.render_speech('Game invitation.', 'voice', client=client) == first
        assert len(requests) == 1
        assert tts.render_speech('Game invitation.', 'other', client=client) != first


def test_adapters_fail_without_logging_secrets(monkeypatch, caplog, tmp_path):
    monkeypatch.setenv('ELEVENLABS_API_KEY', 'test-secret')
    monkeypatch.setattr(tts, 'CACHE', tmp_path)
    def fail(request):
        raise httpx.ReadTimeout('test-secret')
    with httpx.Client(transport=httpx.MockTransport(fail)) as client:
        assert tts.render_speech('Game invitation.', 'voice', client=client) is None
        with pytest.raises(stt.SpeechUnavailable):
            stt.transcribe(b'voice', 'audio/webm', client=client)
    assert 'test-secret' not in caplog.text
    assert 'ReadTimeout' in caplog.text


def test_stt_fake(monkeypatch):
    with pytest.raises(stt.SpeechUnavailable):
        stt.transcribe(b'voice', 'audio/webm')
    monkeypatch.setenv('ELEVENLABS_API_KEY', 'test-secret')
    with httpx.Client(transport=httpx.MockTransport(lambda _: httpx.Response(200, json={'text': 'A community space.'}))) as client:
        assert stt.transcribe(b'voice', 'audio/webm', client=client) == 'A community space.'


def test_voice_routes_validate_and_use_commands(monkeypatch, tmp_path, game_mode):
    monkeypatch.setenv('STATE_DIR', str(tmp_path))
    monkeypatch.setattr(stt, 'transcribe', lambda *_: 'A community space.')
    with TestClient(app) as client:
        code = client.post('/api/rooms').json()['room']
        room = app.state.manager.get(code)
        player = room.add_player('Ann')
        room.phase, room.round_id = 'PITCH', 'R1'
        assert client.post('/api/tts', json={'room': code, 'round_id': 'R1', 'text': 'Game invitation.'}).json() == {'audio_url': None}
        args = {'player_id': player.id, 'phase': 'PITCH', 'round_id': 'R1'}
        def stale(*_):
            room.round_id = 'R2'
            return 'A community space.'
        monkeypatch.setattr(stt, 'transcribe', stale)
        response = client.post(f'/api/rooms/{code}/pitch_audio', data=args, files={'audio': ('voice.webm', b'voice', 'audio/webm')})
        assert response.status_code == 409
        assert not room.pitches
        room.round_id = 'R1'
        calls = []
        async def handle(command, origin):
            calls.append((command, origin))
            return {}
        monkeypatch.setattr(app.state.commands, 'handle', handle)
        monkeypatch.setattr(stt, 'transcribe', lambda *_: 'A community space.')
        for phase, command in [('PITCH', 'submit_pitch'), ('NEGOTIATE', 'revise_pitch')]:
            room.phase = phase
            response = client.post(f'/api/rooms/{code}/pitch_audio', data={**args, 'phase': phase}, files={'audio': ('voice.webm', b'voice', 'audio/webm')})
            assert response.status_code == 200
            assert calls[-1][0]['type'] == command
            assert calls[-1][1] == 'voice'
        monkeypatch.setattr(stt, 'transcribe', lambda *_: (_ for _ in ()).throw(stt.SpeechUnavailable()))
        response = client.post(f'/api/rooms/{code}/pitch_audio', data={**args, 'phase': 'NEGOTIATE'}, files={'audio': ('voice.webm', b'voice', 'audio/webm')})
        assert response.status_code == 503
        assert response.json()['detail']['code'] == 'stt_unavailable'


def test_tts_requires_an_active_round_and_server_lines(monkeypatch, tmp_path, game_mode):
    monkeypatch.setenv('STATE_DIR', str(tmp_path))
    monkeypatch.setenv('HOST_PIN', '4321')
    from app import main
    rendered = []
    monkeypatch.setattr(tts, 'render_speech', lambda text, voice='': rendered.append((text, voice)) or '/api/tts/x.mp3')
    with TestClient(app) as client:
        # No room: never reaches the paid adapter.
        assert client.post('/api/tts', json={'text': 'Free credit.'}).status_code == 422
        assert client.post('/api/tts', json={'room': 'NOPE', 'text': 'Free credit.'}).status_code == 404
        code = client.post('/api/rooms').json()['room']
        room = app.state.manager.get(code)
        assert client.post('/api/tts', json={'room': code, 'text': 'Free credit.'}).status_code == 403  # lobby, no players
        room.add_player('Ann')
        room.phase, room.round_id = 'INTRO', 'R1'
        room.intro = {'text': 'I have waited  a long time.', 'mood': 'lonely'}
        room.dossier = {'persona': {'voice_id': 'abc123'}}
        assert client.post('/api/tts', json={'room': code, 'round_id': 'R0', 'text': 'I have waited a long time.'}).status_code == 409
        ok = client.post('/api/tts', json={'room': code, 'round_id': 'R1', 'text': 'I have waited a long time.', 'voice_id': 'abc123'})
        assert ok.status_code == 200 and rendered[-1] == ('I have waited a long time.', 'abc123')
        # Only the round's persona voice (or the default) may be used.
        assert client.post('/api/tts', json={'room': code, 'text': 'I have waited a long time.', 'voice_id': 'other'}).status_code == 403
        # Arbitrary text must be short and is rate limited per room.
        assert client.post('/api/tts', json={'room': code, 'text': 'x' * 281}).status_code == 403
        statuses = [client.post('/api/tts', json={'room': code, 'text': f'Short line {i}.'}).status_code for i in range(main.TTS_FREE_LINES + 2)]
        assert statuses[:main.TTS_FREE_LINES] == [200] * main.TTS_FREE_LINES and statuses[-1] == 429
        # Server lines are never rate limited.
        assert client.post('/api/tts', json={'room': code, 'text': 'I have waited a long time.'}).status_code == 200
        # The host PIN may render any bounded text, even outside a round.
        room.phase, room.round_id = 'EXPLORE', None
        assert client.post('/api/tts', json={'room': code, 'text': 'x' * 500}, headers={'X-Host-Pin': '4321'}).status_code == 200
        assert client.post('/api/tts', json={'room': code, 'text': 'x' * 500}, headers={'X-Host-Pin': 'nope'}).status_code == 403


def test_tts_cache_is_bounded(monkeypatch, tmp_path):
    import os, time
    monkeypatch.setattr(tts, 'CACHE', tmp_path)
    monkeypatch.setattr(tts, 'CACHE_MAX_BYTES', 25)
    for i in range(5):
        path = tmp_path / f'{i:064x}.mp3'
        path.write_bytes(b'0123456789')
        os.utime(path, (time.time() + i, time.time() + i))
    tts.prune_cache()
    assert sorted(p.name for p in tmp_path.glob('*.mp3')) == [f'{i:064x}.mp3' for i in (3, 4)]
