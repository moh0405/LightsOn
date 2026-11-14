"""Run the actual fetch and SQLite dossier builder on minimal offline inputs."""
import importlib.util
import json
from pathlib import Path
import sqlite3

import pytest

ROOT = Path(__file__).resolve().parents[2]


def script(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / f'{name}.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def builder(tmp_path, monkeypatch):
    module = script('build_dossier')
    monkeypatch.setattr(module, 'ROOT', tmp_path)
    db = sqlite3.connect(':memory:')
    db.executescript('''
        CREATE TABLE properties(id INTEGER, data TEXT);
        CREATE TABLE floors(property_id INTEGER, floor_id INTEGER, name TEXT, size REAL);
        CREATE TABLE available(property_id INTEGER, floor_id INTEGER, area REAL, source_field TEXT);
        CREATE TABLE occupied(property_id INTEGER, floor_id INTEGER, area REAL);
        CREATE TABLE tenant_history(property_id INTEGER, data TEXT);
        CREATE TABLE matterport(property_id INTEGER, model_id TEXT);
    ''')
    # Nulls deliberately supply no invented building facts.
    db.execute('INSERT INTO properties VALUES (?, ?)', ('233953', json.dumps({
        'buildingName': None, 'primaryAddress': {'latitude': None, 'longitude': None}, 'constructionEvents': []})))
    db.execute('INSERT INTO tenant_history VALUES (?, ?)', ('233953', json.dumps({
        'records': None, 'current': None, 'top_industries': None, 'top_exit_reasons': None})))
    fixtures = tmp_path / 'server/fixtures/vexcel'
    fixtures.mkdir(parents=True)
    def merge(fixture):
        (fixtures / '233953.json').write_text(json.dumps(fixture))
        return module.build_dossier(db, '233953', {'FloorName': {}})
    yield merge, fixtures
    db.close()


@pytest.mark.parametrize('capture', [None, '', 'recent', '2023-99-99'])
def test_merge_requires_real_capture_date(builder, capture):
    merge, _ = builder
    dossier = merge({'capture_dates': {'ortho': capture}, 'detections': [{'label': 'car', 'count': 31}]})
    assert not [f for f in dossier['facts'] if f['source'] == 'vexcel+vision']


def test_merge_only_positive_counts_and_natural_wording(builder):
    merge, _ = builder
    dossier = merge({'capture_dates': {'ortho': '2023-08-02T00:00:00'}, 'detections': [
        {'label': 'car', 'count': 31}, {'label': 'tree', 'count': 2},
        {'label': 'parking lot', 'count': 0}, {'label': 'solar panel', 'count': None}]})
    facts = [f for f in dossier['facts'] if f['source'] == 'vexcel+vision']
    assert [f['value'] for f in facts] == [31, 2]
    assert '31 cars' in facts[0]['say_as']
    assert '2 trees' in facts[1]['say_as']
    assert 'on the 2023 flyover' in facts[0]['say_as']


@pytest.mark.parametrize('features,counts', [([], [None, None]),
    ([{'properties': {'label': 'car', 'detections': []}}], [0, None])])
def test_fetch_missing_label_stays_unknown_through_merge(builder, tmp_path, features, counts):
    merge, fixtures = builder
    fetch = script('fetch_vexcel')
    class OfflineClient:
        def property(self, *a, **kw): return {'features': []}
        def ortho(self, *a, **kw): return None
        def obliques(self, *a, **kw): return {}
        def detect(self, *a, **kw): return {'features': features}
    fixture = fetch.fetch_building('233953', ['car', 'tree'], OfflineClient(), tmp_path / 'media', fixtures)
    assert [d['count'] for d in fixture['detections']] == counts
    assert fixture['capture_dates']['ortho'] is None
    assert not [f for f in merge(fixture)['facts'] if f['source'] == 'vexcel+vision']
