from fastapi.testclient import TestClient

from app.main import app, env_example_keys

client = TestClient(app)


def test_health_shape(monkeypatch):
    monkeypatch.setenv("DATA_MODE", "kit")
    monkeypatch.setenv("HOST_PIN", "secret-value-9999")
    body = client.get("/api/health").json()
    assert body["ok"] is True
    assert body["data_mode"] == "kit"
    assert set(body["keys"]) == set(env_example_keys())
    assert all(isinstance(v, bool) for v in body["keys"].values())
    assert body["keys"]["HOST_PIN"] is True
    assert isinstance(body["costar_property_file"], bool)
    assert "secret-value-9999" not in str(body)
