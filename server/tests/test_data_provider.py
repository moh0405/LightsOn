from pathlib import Path
import json

from fastapi.testclient import TestClient
import pytest

from app.data.fixtures import FixtureProvider
from app.data.kit import KitProvider
from app.data.provider import DEFAULT_DOSSIERS, ROOT, get_provider
from app.main import app


@pytest.mark.parametrize('mode', ['fixtures', 'kit'])
def test_provider_and_routes(mode, monkeypatch):
    if mode == 'kit' and not (ROOT / 'data/costar/index.sqlite').is_file():
        pytest.skip('Kit index absent; run scripts/build_kit_index.py')
    monkeypatch.setenv('DATA_MODE', mode)
    monkeypatch.setenv('COSTAR_DATA_DIR', str(ROOT / 'data/costar'))
    provider = get_provider()
    assert isinstance(provider, KitProvider if mode == 'kit' else FixtureProvider)
    buildings = provider.buildings()
    assert len(buildings) == 7
    hero = next(b for b in buildings if b['id'] == '233953')
    assert hero['name'] == 'Esperson' and hero['is_hero']
    assert hero['dark_floors'] == 8
    assert hero['dark_sqft'] >= 94509
    dossier = provider.dossier('233953')
    assert dossier['data_mode'] == mode
    assert provider.dossier('0') is None
    assert provider.dossier('../233953') is None
    client = TestClient(app)
    assert client.get('/api/buildings').json() == buildings
    assert client.get('/api/buildings/233953').json() == dossier
    assert client.get('/api/buildings/0').status_code == 404


def test_fact_provenance():
    required = {'id', 'key', 'value', 'unit', 'source', 'source_field', 'kind', 'say_as'}
    for path in DEFAULT_DOSSIERS.glob('*.json'):
        dossier = json.loads(path.read_text())
        ids = [f['id'] for f in dossier['facts']]
        assert len(ids) == len(set(ids))
        for fact in dossier['facts']:
            assert set(fact) == required
            assert fact['source'] in {'costar', 'vexcel+vision', 'derived'}
        assert {fid for floor in dossier['floors'] for fid in floor['fact_ids']} <= set(ids)
        if dossier['id'] in {'233953', '233899'}:
            assert dossier['media']['aerial']['ortho'] == f"/media/{dossier['id']}/ortho.jpg"
        else:
            assert dossier['media']['aerial']['ortho'] is None


def test_invalid_mode(monkeypatch):
    monkeypatch.setenv('DATA_MODE', 'invalid')
    with pytest.raises(ValueError, match='Unsupported DATA_MODE'):
        get_provider()


def test_fixtures_do_not_need_kit(tmp_path, monkeypatch):
    monkeypatch.setenv('DATA_MODE', 'fixtures')
    monkeypatch.setenv('COSTAR_DATA_DIR', str(tmp_path / 'missing-kit'))
    provider = get_provider()
    assert len(provider.buildings()) == 7
    assert provider.dossier('233953')['data_mode'] == 'fixtures'
