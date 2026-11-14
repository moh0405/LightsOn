"""Validate exported UI contracts and privacy against the real kit when installed."""
import importlib.util
import json
from pathlib import Path

import pytest
from shapely.geometry import Point, shape

from app.data.provider import DEFAULT_DOSSIERS, ROOT

PUBLIC = ROOT / 'apps/web/public'


def load_script(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / f'{name}.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_floor_artifact_contract(tmp_path):
    builder = load_script('build_floors')
    output = tmp_path / 'floors.geojson'
    builder.build_floors(DEFAULT_DOSSIERS, PUBLIC / 'city.geojson', output, {'233953', '233899'})
    assert output.read_text() == (PUBLIC / 'floors.geojson').read_text()
    result = json.loads(output.read_text())
    assert len(result['features']) == 315
    properties = {'building_id', 'building_name', 'floor_number', 'floor_id', 'base_m',
                  'height_m', 'source_status', 'game_status', 'is_hero'}
    seen = set()
    for feature in result['features']:
        p = feature['properties']; key = (p['building_id'], p['floor_number'])
        assert key not in seen
        seen.add(key)
        assert set(p) == properties
        assert isinstance(p['building_id'], str)
        assert isinstance(p['floor_number'], int) and p['floor_number'] > 0
        assert p['source_status'] in {'dark', 'partial', 'occupied', 'unknown'}
        assert p['game_status'] == ('dark' if p['source_status'] == 'dark' else None)
        assert p['height_m'] > p['base_m'] >= 0
        assert feature['geometry']['type'] == 'Polygon'
        assert shape(feature['geometry']).is_valid
        assert feature['footprint_source'] in {'vexcel', 'osm', 'approx'}
    for number in [6, 7, 8]:
        floor = next(f for f in result['features'] if f['properties']['building_id'] == '233953'
                     and f['properties']['floor_number'] == number)
        assert floor['properties']['source_status'] == 'dark'
    # Unknown catalog floors have no invented CoStar floor id.
    assert any(f['properties']['floor_id'] is None and f['properties']['source_status'] == 'unknown'
               for f in result['features'])


def test_approximate_footprint_is_explicit():
    builder = load_script('build_floors')
    dossier = json.loads((DEFAULT_DOSSIERS / '233953.json').read_text())
    geom, src = builder.footprint_for(dossier, {'features': []})
    assert src == 'vexcel'

    dossier_no_fp = {**dossier, 'footprint': None}
    geometry, source = builder.footprint_for(dossier_no_fp, {'features': []})
    assert source == 'approx'
    assert shape(geometry).covers(Point(dossier['lng'], dossier['lat']))
    actual = {'geometry': geometry}
    assert builder.footprint_for(dossier_no_fp, {'features': [actual]}) == (geometry, 'osm')


def test_osm_export_and_height():
    module = load_script('export_osm')
    city = json.loads((PUBLIC / 'city.geojson').read_text())
    assert len(city['features']) > 0
    for feature in city['features']:
        assert shape(feature['geometry']).is_valid
        assert feature['properties']['height_m'] > 0
    assert module.height_m({'height': '297 ft'}) == pytest.approx(297 * .3048)
    assert module.height_m({'height': '12 m'}) == 12
    assert module.height_m({'building:levels': '27'}) == 27 * 3.5
    assert module.height_m({}) == 12
    assert module.convert({'elements': []})['features'] == []


def test_osm_failure_retains_existing_output(tmp_path, monkeypatch):
    import urllib.error
    module = load_script('export_osm')
    target = tmp_path / 'city.geojson'
    target.write_text((PUBLIC / 'city.geojson').read_text())
    before = target.read_bytes()
    def fail(*args, **kwargs):
        assert kwargs['timeout'] == 60
        raise urllib.error.URLError('offline')
    monkeypatch.setattr(module.urllib.request, 'urlopen', fail)
    with pytest.raises(SystemExit, match='OSM export failed'):
        module.export(target, 'https://overpass-api.de/api/interpreter')
    assert target.read_bytes() == before


def walk(value):
    if isinstance(value, dict):
        for key, child in value.items():
            assert 'contact' not in key.lower()
            yield from walk(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk(child)
    elif isinstance(value, str):
        yield value


def test_artifacts_contain_no_contacts():
    paths = list(DEFAULT_DOSSIERS.glob('*.json')) + list(PUBLIC.glob('*.geojson'))
    assert len(paths) == 9
    for path in paths:
        list(walk(json.loads(path.read_text())))


def test_artifacts_contain_no_real_contact_names():
    kit = ROOT / 'data/costar/data'
    if not kit.is_dir():
        pytest.skip('Real CoStar kit absent; contact-key privacy check still runs offline')
    names = set()
    # Read private names only in memory for comparison; never print or persist them.
    def collect(value, inside=False):
        if isinstance(value, dict):
            if inside and value.get('firstName') and value.get('lastName'):
                names.add((value['firstName'] + ' ' + value['lastName']).casefold())
            for key, child in value.items():
                collect(child, inside or 'contact' in key.lower())
        elif isinstance(value, list):
            for child in value:
                collect(child, inside)
    for filename in ['commercial-property', 'commercial-listing-summary', 'location-occupancy']:
        with (kit / f'{filename}.jsonl').open() as stream:
            for line in stream:
                collect(json.loads(line))
    strings = [s.casefold() for path in list(DEFAULT_DOSSIERS.glob('*.json')) + list(PUBLIC.glob('*.geojson'))
               for s in walk(json.loads(path.read_text()))]
    assert names
    assert not any(name in value for name in names for value in strings), 'A private contact name leaked into an artifact'


@pytest.mark.parametrize('has_height', [False, True])
def test_dossier_separates_height_fact_from_rendering(has_height):
    import sqlite3
    kit = ROOT / 'data/costar'
    if not (kit / 'index.sqlite').is_file():
        pytest.skip('Real CoStar index absent')
    builder = load_script('build_dossier')
    # Use a copy of the real kit index; vary only whether the height was provided.
    with sqlite3.connect(kit / 'index.sqlite') as source, sqlite3.connect(':memory:') as db:
        source.backup(db)
        raw = json.loads(db.execute('SELECT data FROM properties WHERE id=233953').fetchone()[0])
        height = raw['buildingHeightInFeet'] if has_height else None
        raw['buildingHeightInFeet'] = height
        db.execute('UPDATE properties SET data=? WHERE id=233953', (json.dumps(raw),))
        dossier = builder.build_dossier(db, '233953', json.loads((kit / 'schemas/enums.json').read_text()))
    assert dossier['building_height_ft'] == height
    assert 'floor_height_m' not in dossier
    assert dossier['render']['floor_height_source'] == ('assumption' if height is None else 'costar')
    expected = 3.8 if height is None else height * .3048 / dossier['stories']
    assert dossier['render']['floor_height_m'] == pytest.approx(expected)
    height_fact = next(f for f in dossier['facts'] if f['key'] == 'buildingHeightInFeet')
    assert height_fact['value'] == height


def test_years_never_get_thousands_separators():
    import sqlite3
    kit = ROOT / 'data/costar'
    if not (kit / 'index.sqlite').is_file():
        pytest.skip('Real CoStar index absent')
    builder = load_script('build_dossier')
    with sqlite3.connect(kit / 'index.sqlite') as db:
        dossier = builder.build_dossier(db, '233953', json.loads((kit / 'schemas/enums.json').read_text()))
    years = [f for f in dossier['facts'] if f['unit'] == 'year']
    assert years
    for fact in years:
        assert fact['say_as'] == str(fact['value']) and ',' not in fact['say_as'], fact
