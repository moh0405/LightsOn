"""Run game-loop coverage against offline dossiers and the real kit when mounted."""
import pytest

from app.data.provider import provider_for_mode


@pytest.fixture(params=['kit', 'fixtures'])
def game_mode(request, monkeypatch):
    mode = request.param
    if mode == 'kit' and not provider_for_mode(mode).index.is_file():
        pytest.skip('Real CoStar index absent; mount data/costar to run kit game-loop coverage.')
    monkeypatch.setenv('DATA_MODE', mode)
    return mode


@pytest.fixture(autouse=True)
def offline_agent_by_default(monkeypatch):
    """Unit tests never inherit a developer's live opt-in."""
    monkeypatch.setenv('AGENT_MODE', 'fake')
