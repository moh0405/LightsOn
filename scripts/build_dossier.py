#!/usr/bin/env python3
"""Build deterministic, source-attributed fixture dossiers from the office index."""
import argparse
import json
import os
from pathlib import Path
import sqlite3
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'server'))
from app.data.floor_status import floor_numbers, floor_status

CONTEXT_IDS = ['233918', '233905', '233935', '233928', '519027']


def property_ids():
    return list(dict.fromkeys([x.strip() for x in os.getenv('HERO_PROPERTY_IDS', '233953,233899').split(',') if x.strip()] + CONTEXT_IDS))


def build_dossier(db: sqlite3.Connection, pid: str, enums: dict) -> dict | None:
    row = db.execute('SELECT data FROM properties WHERE id=?', (pid,)).fetchone()
    if row is None:
        return None
    data = json.loads(row[0]); address = data['primaryAddress']; facts = []
    def fact(key, value, field, unit=None, kind='verified'):
        fid = f'F_{pid}_{key}'
        facts.append(dict(id=fid, key=key, value=value, unit=unit, source='costar',
                          source_field=field, kind=kind,
                          say_as=None if value is None else f'{value:,} {unit or ""}'.strip()
                          if isinstance(value, (int, float)) else str(value)))
        return fid
    stories = data.get('numStoriesAboveGrade'); height = data.get('buildingHeightInFeet')
    floor_height = height * .3048 / stories if height is not None and stories else 3.8
    for key, value in data.items():
        if key not in {'primaryAddress', 'constructionEvents'}:
            fact(key, value, f'commercial-property.{key}',
                 'sqft' if key.endswith('SquareFeet') else 'ft' if key == 'buildingHeightInFeet' else None)
    for event in data['constructionEvents']:
        fact(f'construction_{event["eventType"]}', event['year'], 'commercial-property.constructionEvents.year', 'year')
    for key in ['latitude', 'longitude']:
        fact(key, address.get(key), f'commercial-property.primaryAddress.{key}', 'degrees')
    numbers = floor_numbers(enums); floors = []
    for floor_id, name, size in db.execute('SELECT floor_id,name,size FROM floors WHERE property_id=? ORDER BY floor_id', (pid,)):
        a = db.execute('SELECT coalesce(sum(area),0) FROM available WHERE property_id=? AND floor_id=?', (pid, floor_id)).fetchone()[0]
        o = db.execute('SELECT coalesce(sum(area),0) FROM occupied WHERE property_id=? AND floor_id=?', (pid, floor_id)).fetchone()[0]
        status = floor_status(a, o, size, name); number = numbers.get(name)
        prefix = f'floor_{number}' if number is not None else f'floor_id_{floor_id}'
        available_fields = [r[0] for r in db.execute('SELECT DISTINCT source_field FROM available WHERE property_id=? AND floor_id=? ORDER BY source_field', (pid, floor_id))]
        available_source = 'commercial-listing-summary.forLeaseSummary.spaces.' + '|'.join(available_fields or ['squareFeetMax|squareFeetMin'])
        fact_ids = [fact(prefix + '_size_sqft', size, 'commercial-property.floors.floorSize.squareFeet', 'sqft'),
                    fact(prefix + '_available_sqft', a, available_source, 'sqft'),
                    fact(prefix + '_occupied_sqft', o, 'location-occupancy.spaces.squareFeetOccupied', 'sqft')]
        floors.append(dict(floor_id=floor_id, number=number, name=name, size_sqft=size,
                           available_sqft=a, occupied_sqft=o, source_status=status,
                           game_status='dark' if status == 'dark' else None, fact_ids=fact_ids))
    floors.sort(key=lambda f: (f['number'] is None, f['number'] or 0, f['floor_id']))
    history = json.loads(db.execute('SELECT data FROM tenant_history WHERE property_id=?', (pid,)).fetchone()[0])
    records, current = history['records'], history['current']
    industries, reasons = history['top_industries'], history['top_exit_reasons']
    fact('tenant_records', records, 'location-occupancy.propertyId', 'records')
    fact('current_tenants', current, 'location-occupancy.toDate', 'records')
    fact('tenant_industries', industries, 'company-detail.profile.industryType')
    fact('tenant_exit_reasons', reasons, 'location-occupancy.expirationReason')
    # Include unmatched-floor space in building totals, never in an arbitrary floor.
    for table, key, field in [('available', 'available_sqft', 'commercial-listing-summary.forLeaseSummary.spaces.squareFeetMax|squareFeetMin'),
                              ('occupied', 'occupied_sqft', 'location-occupancy.spaces.squareFeetOccupied')]:
        total = db.execute(f'SELECT coalesce(sum(area),0) FROM {table} WHERE property_id=?', (pid,)).fetchone()[0]
        fact(key, total, field, 'sqft')
    models = [dict(model_id=r[0], caption=None) for r in db.execute('SELECT model_id FROM matterport WHERE property_id=? ORDER BY model_id', (pid,))]
    fact('matterport_models', [m['model_id'] for m in models], 'commercial-properties.csv.MatterportModelId')
    street = ' '.join(str(address[k]) for k in ['streetNumber', 'streetName', 'streetType'] if address.get(k)) or None
    fact('address', street, 'commercial-property.primaryAddress')
    return dict(id=str(pid), name=data['buildingName'], address=street,
                lat=address['latitude'], lng=address['longitude'], footprint=None,
                stories=stories, floor_height_m=floor_height, floors=floors, facts=facts,
                tenant_history=history, media=dict(matterport=models, photos=[], aerial=dict(ortho=None, obliques=[])),
                neighbors=[other for other in property_ids() if other != str(pid)], data_mode='kit')


def build_dossiers(kit: Path, output: Path):
    enums = json.loads((kit / 'schemas/enums.json').read_text())
    output.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(f'file:{kit / "index.sqlite"}?mode=ro', uri=True) as db:
        for pid in property_ids():
            dossier = build_dossier(db, pid, enums)
            if dossier is None:
                raise ValueError(f'Office property {pid} is absent from index')
            (output / f'{pid}.json').write_text(json.dumps(dossier, indent=2) + '\n')
    print(f'Wrote {len(property_ids())} dossiers to {output}')


if __name__ == '__main__':
    from dotenv import load_dotenv
    load_dotenv(ROOT / '.env')
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--kit-dir', type=Path, default=ROOT / 'data/costar')
    parser.add_argument('--output', type=Path, default=ROOT / 'server/fixtures/dossiers')
    args = parser.parse_args(); build_dossiers(args.kit_dir, args.output)
