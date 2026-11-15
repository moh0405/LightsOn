"""Unit tests for Matterport adapter."""
import pytest
from app.data.matterport import MatterportClient, get_models, get_model


def test_matterport_get_models_for_hero():
    models = get_models("233953")
    assert isinstance(models, list)
    assert len(models) >= 1
    # Check that model objects have model_id and caption
    for m in models:
        assert "model_id" in m
        assert "caption" in m


def test_matterport_unknown_property_returns_empty():
    models = get_models("999999999")
    assert models == []


def test_matterport_invalid_id_returns_empty():
    assert get_models("") == []
    assert get_models("invalid-id") == []


def test_matterport_get_single_model():
    model = get_model("Wtxv2Mp8uQE")
    assert model is not None
    assert model["model_id"] == "Wtxv2Mp8uQE"
    assert get_model("") is None


@pytest.fixture(params=['kit', 'fixtures'])
def tours_client(request, monkeypatch):
    import httpx
    from fastapi.testclient import TestClient
    from app.main import app
    from app.data import matterport
    from app.data.provider import provider_for_mode
    if request.param == 'kit' and not provider_for_mode('kit').index.is_file():
        pytest.skip('Real CoStar index absent')
    matterport._public_metadata.cache_clear()
    monkeypatch.setenv('DATA_MODE', request.param)
    calls = []
    names = {'Wtxv2Mp8uQE': 'Lobby', 'nP2o5YT7nCP': 'Underground Tunnel System',
             'wovF4kpoaw4': '808 Travis - Suite 550'}
    def get(url, *, timeout):
        assert timeout == 3.0
        model = url.rstrip('/').split('/')[-1]
        calls.append(model)
        return httpx.Response(200, request=httpx.Request('GET', url), json={
            'name': names[model], 'is_public': True,
            'image': 'https://cdn-2.matterport.com/apifs/models/Wtxv2Mp8uQE/images/ZgZEYKhTzRA/01.22.2020_17.04.37.jpg',
            'contact_name': 'PRIVATE', 'owner': {'email': 'PRIVATE'},
        })
    monkeypatch.setattr(matterport.httpx, 'get', get)
    yield TestClient(app), calls
    matterport._public_metadata.cache_clear()


def test_tours_public_metadata_cached_and_allowlisted(tours_client):
    client, calls = tours_client
    first = client.get('/api/buildings/233953/tours')
    assert first.status_code == 200
    result = first.json()
    assert result[0]['name'] == 'Lobby'
    assert {t['model_id'] for t in result} == {'Wtxv2Mp8uQE', 'nP2o5YT7nCP', 'wovF4kpoaw4'}
    assert all(set(t) == {'model_id', 'name', 'cover_url'} for t in result)
    assert 'PRIVATE' not in first.text
    assert client.get('/api/buildings/233953/tours').json() == result
    assert len(calls) == 3
    assert client.get('/api/buildings/999999999/tours').status_code == 404
    assert len(calls) == 3


@pytest.mark.parametrize('failure', ['timeout', 'private', 'malformed', 'http'])
def test_tours_failure_returns_nulls_without_losing_kit_ids(tours_client, monkeypatch, failure, caplog):
    import httpx
    from app.data import matterport
    client, _ = tours_client
    def fail(url, *, timeout):
        if failure == 'timeout':
            raise httpx.ReadTimeout('offline')
        payload = [] if failure == 'malformed' else {'is_public': False, 'name': 'PRIVATE'}
        return httpx.Response(503 if failure == 'http' else 200,
                              request=httpx.Request('GET', url), json=payload)
    monkeypatch.setattr(matterport.httpx, 'get', fail)
    result = client.get('/api/buildings/233953/tours')
    assert result.status_code == 200
    assert len(result.json()) == 3
    assert all(t['name'] is None and t['cover_url'] is None for t in result.json())
    assert 'metadata unavailable' in caplog.text
    def unexpected_request(*args, **kwargs):
        pytest.fail('Unavailable metadata must be cached too')
    monkeypatch.setattr(matterport.httpx, 'get', unexpected_request)
    assert client.get('/api/buildings/233953/tours').json() == result.json()


def test_all_prepared_tours_match_office_index_and_csv():
    import csv
    import json
    import sqlite3
    from pathlib import Path
    from app.data.provider import ROOT, DEFAULT_DOSSIERS
    kit = ROOT / 'data/costar'
    if not (kit / 'index.sqlite').is_file():
        pytest.skip('Real kit absent')
    csv_models = {}
    with (kit / 'commercial-properties.csv').open() as stream:
        for row in csv.DictReader(stream):
            if row['MatterportModelId']:
                csv_models.setdefault(row['PropertyId'], set()).add(row['MatterportModelId'])
    with sqlite3.connect(kit / 'index.sqlite') as db:
        for path in sorted(DEFAULT_DOSSIERS.glob('*.json')):
            dossier = json.loads(path.read_text())
            assert json.loads(db.execute('SELECT data FROM properties WHERE id=?', (path.stem,)).fetchone()[0])['propertyType'] == 'Office'
            expected = csv_models.get(path.stem, set())
            assert {r[0] for r in db.execute('SELECT model_id FROM matterport WHERE property_id=?', (path.stem,))} == expected
            assert {m['model_id'] for m in dossier['media']['matterport']} == expected
