#!/usr/bin/env python3
"""Stream each kit dataset once into a contact-free, office-only SQLite index."""
import argparse
import csv
import json
import os
from pathlib import Path
import sqlite3
import time

ROOT = Path(__file__).resolve().parents[1]


def records(path):
    with path.open() as stream:
        for line in stream:
            if line.strip():
                yield json.loads(line)


def build_index(kit: Path) -> Path:
    started = time.monotonic()
    enums = json.loads((kit / 'schemas/enums.json').read_text())
    def decode(enum, value):
        return None if value is None else enums[enum][str(value)]
    target = kit / 'index.sqlite'
    temporary = kit / 'index.build.sqlite'
    temporary.unlink(missing_ok=True)
    db = sqlite3.connect(temporary)
    db.executescript('''
    CREATE TABLE properties(id INTEGER PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE floors(property_id INTEGER, floor_id INTEGER, name TEXT, size REAL,
                        PRIMARY KEY(property_id,floor_id));
    CREATE TABLE available(property_id INTEGER, floor_id INTEGER, area REAL, source_field TEXT);
    CREATE TABLE tenancies(id INTEGER PRIMARY KEY, property_id INTEGER, tenant_id INTEGER,
                           current INTEGER, exit_reason TEXT);
    CREATE TABLE occupied(property_id INTEGER, floor_id INTEGER, area REAL);
    CREATE TABLE companies(id INTEGER PRIMARY KEY, industry TEXT, business_status TEXT);
    CREATE TABLE tenant_history(property_id INTEGER PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE matterport(property_id INTEGER, model_id TEXT, PRIMARY KEY(property_id,model_id));
    CREATE INDEX available_floor ON available(property_id,floor_id);
    CREATE INDEX occupied_floor ON occupied(property_id,floor_id);
    CREATE INDEX tenancy_property ON tenancies(property_id);
    ''')
    office_ids = set()
    # Explicit allowlists avoid persisting contacts or free text that could name brokers.
    fields = ['buildingName', 'numStoriesAboveGrade', 'buildingHeightInFeet',
              'rentableBuildingAreaSquareFeet', 'grossTypicalFloorSquareFeet', 'parkingRatio']
    for r in records(kit / 'data/commercial-property.jsonl'):
        if r.get('propertyType') != 5:
            continue
        pid = r['id']; office_ids.add(pid)
        data = {key: r.get(key) for key in fields}
        address = r.get('primaryAddress') or {}
        data['primaryAddress'] = {key: address.get(key) for key in
                                 ['latitude', 'longitude', 'streetNumber', 'streetName', 'streetType', 'city', 'state', 'postcode']}
        data['propertyType'] = decode('PropertyType', r['propertyType'])
        data['buildingClass'] = decode('BuildingClass', r.get('buildingClass'))
        data['constructionEvents'] = [{'eventType': decode('ConstructionEventType', e['eventType']),
                                       'year': e.get('year')} for e in r.get('constructionEvents') or []]
        db.execute('INSERT INTO properties VALUES (?,?)', (pid, json.dumps(data)))
        for floor in r.get('floors') or []:
            db.execute('INSERT INTO floors VALUES (?,?,?,?)', (pid, floor['propertyFloorId'],
                       decode('FloorName', floor.get('floorName')), (floor.get('floorSize') or {}).get('squareFeet')))
    for r in records(kit / 'data/commercial-listing-summary.jsonl'):
        if decode('ListingStatus', r.get('listingStatus')) != 'Active':
            continue
        for space in (r.get('forLeaseSummary') or {}).get('spaces') or []:
            pid = space.get('propertyId', r.get('propertyId'))
            if pid not in office_ids or space.get('dateOffMarket') or space.get('isLeasePending'):
                continue
            field = 'squareFeetMax' if space.get('squareFeetMax') is not None else 'squareFeetMin'
            db.execute('INSERT INTO available VALUES (?,?,?,?)',
                       (pid, space.get('propertyFloorId'), space.get(field), field))
    tenant_ids = set()
    for r in records(kit / 'data/location-occupancy.jsonl'):
        pid = r.get('propertyId')
        if pid not in office_ids:
            continue
        tenant_ids.add(r.get('tenantLocationId'))
        current = r.get('toDate') is None
        db.execute('INSERT INTO tenancies VALUES (?,?,?,?,?)', (r['id'], pid, r.get('tenantLocationId'),
                   current, decode('LocationOccupancyExpirationReason', r.get('expirationReason'))))
        if current:
            for space in r.get('spaces') or []:
                db.execute('INSERT INTO occupied VALUES (?,?,?)',
                           (pid, space.get('propertyFloorId'), space.get('squareFeetOccupied')))
    for r in records(kit / 'data/company-detail.jsonl'):
        if r['id'] in tenant_ids:
            db.execute('INSERT INTO companies VALUES (?,?,?)', (r['id'],
                       decode('IndustryType', (r.get('profile') or {}).get('industryType')),
                       decode('LocationBusinessStatus', r.get('businessStatus'))))
    with (kit / 'commercial-properties.csv').open(newline='') as stream:
        for row in csv.DictReader(stream):
            pid = int(row['PropertyId'])
            if pid in office_ids and row['MatterportModelId']:
                db.execute('INSERT OR IGNORE INTO matterport VALUES (?,?)', (pid, row['MatterportModelId']))
    for pid in sorted(office_ids):
        count, current = db.execute('SELECT count(*),coalesce(sum(current),0) FROM tenancies WHERE property_id=?', (pid,)).fetchone()
        industries = [dict(industry=r[0], records=r[1]) for r in db.execute("""SELECT c.industry,count(*) FROM tenancies t
            JOIN companies c ON c.id=t.tenant_id WHERE t.property_id=? AND c.industry != 'Unknown'
            GROUP BY c.industry ORDER BY count(*) DESC,c.industry""", (pid,))]
        reasons = [dict(reason=r[0], records=r[1]) for r in db.execute("""SELECT exit_reason,count(*) FROM tenancies
            WHERE property_id=? AND current=0 GROUP BY exit_reason ORDER BY count(*) DESC,exit_reason""", (pid,))]
        db.execute('INSERT INTO tenant_history VALUES (?,?)', (pid, json.dumps(dict(
            records=count, current=current, top_industries=industries, top_exit_reasons=reasons))))
    db.commit(); db.close()
    os.replace(temporary, target)
    print(f'Indexed {len(office_ids)} office properties in {time.monotonic() - started:.2f}s: {target}')
    return target


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--kit-dir', type=Path, default=ROOT / 'data/costar')
    build_index(parser.parse_args().kit_dir)
