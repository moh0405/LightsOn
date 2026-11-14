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
    for pid in ('233953', '233899'):
        db.execute('INSERT INTO properties VALUES (?, ?)', (pid, json.dumps({
            'buildingName': None, 'primaryAddress': {'latitude': None, 'longitude': None}, 'constructionEvents': []})))
        db.execute('INSERT INTO tenant_history VALUES (?, ?)', (pid, json.dumps({
            'records': None, 'current': None, 'top_industries': None, 'top_exit_reasons': None})))
    fixtures = tmp_path / 'server/fixtures/vexcel'
    fixtures.mkdir(parents=True)
    def merge(fixture, pid='233953'):
        (fixtures / f'{pid}.json').write_text(json.dumps(fixture))
        return module.build_dossier(db, pid, {'FloorName': {}})
    yield merge, fixtures
    db.close()


@pytest.mark.parametrize('capture', [None, '', 'recent', '2023-99-99'])
def test_merge_requires_real_capture_date(builder, capture):
    merge, _ = builder
    dossier = merge({'capture_dates': {'ortho': capture}, 'detections': [{'label': 'car', 'count': 31}]})
    assert all('unknown capture date' in f['say_as'] for f in dossier['facts'] if f['source'] == 'vexcel+vision')


def test_merge_only_positive_counts_and_natural_wording(builder):
    merge, _ = builder
    # Match the recorded captures: Esperson has 31 cars (2023),
    # Wells Fargo has 8 cars and 2 trees (2022).
    esperson = merge({'capture_dates': {'ortho': '2023-08-02T00:00:00'},
                      'detections': [{'label': 'car', 'count': 31, 'capture_date': '2023-08-02'}]})
    esperson_facts = [f for f in esperson['facts'] if f['source'] == 'vexcel+vision']
    assert '31 cars' in esperson_facts[0]['say_as']
    assert 'on the 2023-08-02 flyover' in esperson_facts[0]['say_as']
    dossier = merge({'capture_dates': {'ortho': '2022-02-19T00:00:00'}, 'detections': [
        {'label': 'car', 'count': 8, 'capture_date': '2022-02-19'}, {'label': 'tree', 'count': 2, 'capture_date': '2022-02-19'},
        {'label': 'parking lot', 'count': 0}, {'label': 'solar panel', 'count': None}]}, pid='233899')
    facts = [f for f in dossier['facts'] if f['source'] == 'vexcel+vision']
    assert [f['value'] for f in facts] == [8, 2]
    assert '8 cars' in facts[0]['say_as']
    assert '2 trees' in facts[1]['say_as']
    assert 'on the 2022-02-19 flyover' in facts[0]['say_as']


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


def test_fetch_detection_dates_are_bound_to_its_image_not_property(tmp_path, monkeypatch):
    fetch = script('fetch_vexcel')
    # Coordinates are unused by this recorded-response adapter.
    monkeypatch.setattr(fetch, 'get_coordinates', lambda _: (29.7588018, -95.3650891))
    class Client:
        def property(self, *a, **kw):
            return {'features': [{'properties': {'metadata.ortho-date-estimate': '2023-08-02T00:00:00'}}]}
        def ortho(self, *a, **kw): return None
        def obliques(self, *a, **kw): return {}
        def detect(self, *a, **kw):
            return {'images': [{'image-id': 'recorded-image', 'capture-date': '2022-02-19T00:00:00'}],
                'features': [{'properties': {'label': 'car', 'detections': [{'imageId': 'recorded-image', 'confidence': .8}]}}]}
    fixture = fetch.fetch_building('233953', ['car'], Client(), tmp_path / 'media', tmp_path / 'fixtures')
    assert fixture['detections'][0]['capture_date'] == '2022-02-19'
    assert fixture['detections'][0]['image_ids'] == ['recorded-image']
    class Unknown(Client):
        def detect(self, *a, **kw):
            return {'features': [{'properties': {'label': 'car', 'detections': [{'imageId': 'missing-image'}]}}]}
    fixture = fetch.fetch_building('233953', ['car'], Unknown(), tmp_path / 'media', tmp_path / 'fixtures')
    assert fixture['detections'][0]['capture_date'] is None


def test_merge_ignores_property_ortho_date_when_detection_is_undated(builder):
    merge, _ = builder
    # The ortho date belongs to a different capture; an undated detection stays undated.
    dossier = merge({'capture_dates': {'ortho': '2023-08-02T00:00:00'},
                     'detections': [{'label': 'car', 'count': 31}]})
    facts = [f for f in dossier['facts'] if f['source'] == 'vexcel+vision']
    assert facts and all('unknown capture date' in f['say_as'] for f in facts)
    assert not any('2023-08-02' in f['say_as'] for f in facts)
