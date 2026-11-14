"""Public trace projection never returns arbitrary cached text or arguments."""
import json

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def trace_cache(tmp_path, monkeypatch):
    monkeypatch.setenv('PREP_TRACE_DIR', str(tmp_path))
    directory = tmp_path / '233953'
    directory.mkdir()
    (directory / 'agent_steps.json').write_text(json.dumps({'events': [
        {'step': 'research', 'tool': 'write_todos', 'duration_ms': 2,
         'summary': 'PRIVATE_OWNER api-key phone prompt', 'arguments': 'PRIVATE_OWNER'},
        {'step': 'property_scout', 'tool': 'task', 'duration_ms': 41976},
        {'step': 'PRIVATE_OWNER', 'tool': 'task', 'duration_ms': 1},
        {'step': 'research', 'tool': 'PRIVATE_OWNER', 'duration_ms': 1},
        {'step': 'complete', 'tool': 'validate_persona', 'duration_ms': 0},
    ], 'prompt': 'PRIVATE_OWNER'}))
    (directory / 'persona.json').write_text('{"owner": "PRIVATE_OWNER"}')
    return directory


@pytest.mark.parametrize('mode', ['kit', 'fixtures'])
def test_trace_endpoint_is_read_only_and_redacted(trace_cache, monkeypatch, mode):
    monkeypatch.setenv('DATA_MODE', mode)
    before = {p.name: p.read_bytes() for p in trace_cache.iterdir()}
    with TestClient(app) as client:
        result = client.get('/api/buildings/233953/trace')
    assert result.status_code == 200
    body = result.json()
    assert 'PRIVATE_OWNER' not in result.text
    assert 'arguments' not in result.text
    assert body['events'][0] == dict(step='research', tool='write_todos',
                                    summary='research: write_todos', duration_ms=2)
    assert len(body['events']) == 3
    assert body['files'] == ['persona.json']
    assert body['plan_recorded'] is True
    assert body['model_ids'] == []  # Current configuration is not historical evidence.
    assert before == {p.name: p.read_bytes() for p in trace_cache.iterdir()}


def test_trace_missing_corrupt_and_unknown_are_safe(trace_cache):
    with TestClient(app) as client:
        assert client.get('/api/buildings/unknown/trace').status_code == 404
        (trace_cache / 'agent_steps.json').write_text('{broken')
        response = client.get('/api/buildings/233953/trace')
        assert response.status_code == 200
        assert response.json()['events'] == []
        assert response.json()['available'] is False
        (trace_cache / 'agent_steps.json').unlink()
        assert client.get('/api/buildings/233953/trace').json()['available'] is False


def test_trace_rejects_invalid_timing_and_non_object_records(trace_cache):
    (trace_cache / 'agent_steps.json').write_text(json.dumps({'events': [
        None, 'PRIVATE_OWNER', {'step': 'research', 'tool': 'read_file', 'duration_ms': -1},
        {'step': 'research', 'tool': 'read_file', 'duration_ms': 'PRIVATE_OWNER'},
        {'step': 'research', 'tool': 'read_file', 'duration_ms': True},
    ]}))
    with TestClient(app) as client:
        assert client.get('/api/buildings/233953/trace').json()['events'] == []
