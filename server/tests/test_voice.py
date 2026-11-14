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
        assert client.post('/api/tts', json={'text': 'Game invitation.', 'voice_id': ''}).json() == {'audio_url': None}
        code = client.post('/api/rooms').json()['room']
        room = app.state.manager.get(code)
        player = room.add_player('Ann')
        room.phase, room.round_id = 'PITCH', 'R1'
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
