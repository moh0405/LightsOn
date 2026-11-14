import importlib.util
from pathlib import Path
import sqlite3

import pytest

from app.data.floor_status import floor_status

ROOT = Path(__file__).resolve().parents[2]


@pytest.mark.parametrize('a,o,s,name,status', [
    (31503, 0, 31503, 'SixthFloor', 'dark'),
    (28352.7, 0, 31503, 'SixthFloor', 'dark'),
    (28352, 0, 31503, 'SixthFloor', 'partial'),
    (31503, 1, 31503, 'SixthFloor', 'partial'),
    (1, 0, None, 'SixthFloor', 'partial'),
    (0, 1, None, 'SixthFloor', 'occupied'),
    (0, 0, None, 'SixthFloor', 'unknown'),
    (31503, 0, 31503, 'UnknownFloor', 'unknown'),
])
def test_rule_from_small_fixture(a, o, s, name, status):
    assert floor_status(a, o, s, name) == status


def test_esperson_real_kit(tmp_path):
    kit = ROOT / 'data/costar'
    if not (kit / 'data/commercial-property.jsonl').is_file():
        pytest.skip('Real CoStar kit is absent; install data/costar to verify Esperson floors 6–8')
    # Exercise the builder on the actual kit, not a possibly stale local index.
    spec = importlib.util.spec_from_file_location('build_kit_index', ROOT / 'scripts/build_kit_index.py')
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    local = tmp_path / 'costar'; local.mkdir()
    for name in ['data', 'schemas', 'commercial-properties.csv']:
        (local / name).symlink_to(kit / name)
    index = module.build_index(local)
    with sqlite3.connect(index) as db:
        rows = db.execute('''SELECT f.name,f.size,
            (SELECT coalesce(sum(area),0) FROM available WHERE property_id=f.property_id AND floor_id=f.floor_id),
            (SELECT coalesce(sum(area),0) FROM occupied WHERE property_id=f.property_id AND floor_id=f.floor_id)
            FROM floors f WHERE property_id=233953 AND name IN ('SixthFloor','SeventhFloor','EighthFloor')''').fetchall()
        assert len(rows) == 3
        for name, size, available, occupied in rows:
            assert size == available == 31503
            assert occupied == 0
            assert floor_status(available, occupied, size, name) == 'dark'


@pytest.mark.parametrize('available,occupied,expected', [(31503, None, 'partial'), (0, None, 'occupied'), (31503, 0, 'partial'), (0, 0, 'occupied')])
def test_current_tenancy_prevents_dark_even_without_area(available, occupied, expected):
    assert floor_status(available, occupied, 31503, 'SixthFloor', has_current_tenancy=True) == expected


def test_one_allen_center_current_tenancy_is_not_dark():
    kit = ROOT / 'data/costar'
    if not (kit / 'index.sqlite').is_file():
        pytest.skip('Real CoStar index absent')
    import json
    spec = importlib.util.spec_from_file_location('build_dossier', ROOT / 'scripts/build_dossier.py')
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    with sqlite3.connect(kit / 'index.sqlite') as db:
        dossier = module.build_dossier(db, '233935', json.loads((kit / 'schemas/enums.json').read_text()))
        floor = next(f for f in dossier['floors'] if f['floor_id'] == 611792)
        assert floor['number'] == 13
        assert floor['occupied_sqft'] is None
        assert floor['source_status'] == 'partial'
        fact = next(f for f in dossier['facts'] if f['id'] in floor['fact_ids'] and f['key'].endswith('_occupied_sqft'))
        assert fact['value'] is None
