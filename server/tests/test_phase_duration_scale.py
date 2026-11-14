import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.rooms import DEFAULT_DURATIONS


@pytest.mark.parametrize("scale", [None, "0.1", "2"])
def test_lifespan_scales_only_timed_phases(monkeypatch, tmp_path, scale):
    monkeypatch.setenv("STATE_DIR", str(tmp_path))
    if scale is None:
        monkeypatch.delenv("PHASE_DURATIONS_SCALE", raising=False)
    else:
        monkeypatch.setenv("PHASE_DURATIONS_SCALE", scale)
    with TestClient(app) as client:
        code = client.post("/api/rooms").json()["room"]
        room = app.state.manager.rooms[code]
        for phase, seconds in DEFAULT_DURATIONS.items():
            expected = seconds * float(scale or "1") if seconds is not None else None
            assert room.durations[phase] == expected
        assert room.ends_at is None
