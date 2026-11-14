import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("STATE_DIR", str(tmp_path))
    monkeypatch.setenv("HOST_PIN", "1234")
    with TestClient(app) as c:
        yield c


def recv_until(ws, kind, limit=20):
    for _ in range(limit):
        m = ws.receive_json()
        if m["type"] == kind:
            return m
    raise AssertionError(f"no {kind} event")


def test_create_room_returns_qr(client):
    r = client.post("/api/rooms", json={"base_url": "https://example.test"}).json()
    assert len(r["room"]) == 4
    assert r["join_url"] == f"https://example.test/play?room={r['room']}"
    assert r["qr_svg"].lstrip().startswith("<svg")
    again = client.post("/api/rooms", json={"room": r["room"]}).json()
    assert again["room"] == r["room"]  # screen refresh reuses the room


def test_unknown_room_refused(client):
    with pytest.raises(Exception):
        with client.websocket_connect("/ws/ZZZZ?role=play"):
            pass


def test_join_pointer_and_reconnect(client):
    code = client.post("/api/rooms").json()["room"]
    with client.websocket_connect(f"/ws/{code}?role=screen") as screen:
        assert screen.receive_json()["type"] == "room_state"
        with client.websocket_connect(f"/ws/{code}?role=play") as p1:
            assert p1.receive_json()["phase"] == "LOBBY"
            p1.send_json({"type": "join", "nickname": "Ann", "nonce": "n1"})
            ack = recv_until(p1, "ack")
            pid, color = ack["result"]["player_id"], ack["result"]["color"]
            assert ack["nonce"] == "n1"
            assert recv_until(screen, "player_joined")["player"]["nickname"] == "Ann"
            with client.websocket_connect(f"/ws/{code}?role=play") as p2:
                p2.receive_json()
                p2.send_json({"type": "join", "nickname": "Bo", "nonce": "n2"})
                recv_until(p2, "ack")
            assert recv_until(p1, "phase_changed")["phase"] == "EXPLORE"
            p1.send_json({"type": "pointer", "x": 0.25, "y": 0.75})
            ptr = recv_until(screen, "pointer")
            assert (ptr["x"], ptr["y"], ptr["color"], ptr["player_id"]) == (0.25, 0.75, color, pid)
        # p1 dropped; reconnecting with the same player_id restores the full room_state
        with client.websocket_connect(f"/ws/{code}?role=play&player_id={pid}") as again:
            state = again.receive_json()
            assert state["type"] == "room_state" and state["phase"] == "EXPLORE"
            me = next(p for p in state["players"] if p["id"] == pid)
            assert me["nickname"] == "Ann" and me["connected"] is True
            assert len(state["players"]) == 2


def test_host_force_phase_over_ws_and_bad_pin(client):
    code = client.post("/api/rooms").json()["room"]
    with client.websocket_connect(f"/ws/{code}?role=admin") as admin:
        admin.receive_json()
        admin.send_json({"type": "host_action", "action": "skip_phase", "pin": "nope", "nonce": "a"})
        assert recv_until(admin, "error")["code"] == "bad_pin"
        admin.send_json({"type": "host_action", "action": "skip_phase", "pin": "1234", "nonce": "b"})
        assert recv_until(admin, "phase_changed")["phase"] == "EXPLORE"


def test_host_switch_changes_process_provider_and_all_room_states(tmp_path, monkeypatch):
    from app.data.provider import ROOT
    if not (ROOT / 'data/costar/index.sqlite').is_file():
        pytest.skip('Real CoStar index absent')
    monkeypatch.setenv('STATE_DIR', str(tmp_path))
    monkeypatch.setenv('HOST_PIN', '1234')
    monkeypatch.setenv('DATA_MODE', 'fixtures')
    with TestClient(app) as client:
        first = client.post('/api/rooms').json()['room']
        second = client.post('/api/rooms').json()['room']
        with client.websocket_connect(f'/ws/{first}?role=admin') as admin, client.websocket_connect(f'/ws/{second}?role=screen') as screen:
            assert admin.receive_json()['data_mode'] == 'fixtures'
            assert screen.receive_json()['data_mode'] == 'fixtures'
            for mode in ['kit', 'fixtures']:
                admin.send_json({'type': 'host_action', 'action': 'set_data_mode', 'data_mode': mode, 'pin': '1234'})
                for ws in [admin, screen]:
                    state = recv_until(ws, 'room_state')
                    assert state['data_mode'] == mode
                    assert state['data_mode_scope'] == 'process'
                recv_until(admin, 'ack')
                assert client.get('/api/buildings/233953').json()['data_mode'] == mode
                assert len(client.get('/api/buildings').json()) == 7
                assert client.get('/api/health').json()['data_mode'] == mode
                code = client.post('/api/rooms').json()['room']
                with client.websocket_connect(f'/ws/{code}?role=screen') as fresh:
                    assert fresh.receive_json()['data_mode'] == mode


def test_unavailable_provider_switch_preserves_process_mode(tmp_path, monkeypatch):
    monkeypatch.setenv('STATE_DIR', str(tmp_path))
    monkeypatch.setenv('HOST_PIN', '1234')
    monkeypatch.setenv('DATA_MODE', 'fixtures')
    monkeypatch.setenv('COSTAR_DATA_DIR', str(tmp_path / 'missing-kit'))
    with TestClient(app) as client:
        code = client.post('/api/rooms').json()['room']
        with client.websocket_connect(f'/ws/{code}?role=admin') as admin:
            admin.receive_json()
            admin.send_json({'type': 'host_action', 'action': 'set_data_mode', 'data_mode': 'kit', 'pin': '1234'})
            assert recv_until(admin, 'error')['code'] == 'data_unavailable'
            assert client.get('/api/buildings/233953').json()['data_mode'] == 'fixtures'
            assert client.get('/api/health').json()['data_mode'] == 'fixtures'
