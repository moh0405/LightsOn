#!/usr/bin/env python3
"""Render floors with matched OSM footprints or explicitly approximate 30m squares."""
import argparse
import json
import math
from pathlib import Path

from shapely.geometry import Point, shape

ROOT = Path(__file__).resolve().parents[1]


def footprint_for(dossier, city):
    point = Point(dossier['lng'], dossier['lat'])
    matches = [f['geometry'] for f in city['features'] if shape(f['geometry']).covers(point)]
    if matches:
        return min(matches, key=lambda g: shape(g).area), 'osm'
    dx = 15 / (111320 * math.cos(math.radians(dossier['lat'])))
    dy = 15 / 111320
    x, y = dossier['lng'], dossier['lat']
    ring = [[x-dx, y-dy], [x+dx, y-dy], [x+dx, y+dy], [x-dx, y+dy], [x-dx, y-dy]]
    return dict(type='Polygon', coordinates=[ring]), 'approx'


def build_floors(dossiers, city_path, output, heroes):
    city = json.loads(city_path.read_text())
    features = []
    for path in sorted(dossiers.glob('*.json')):
        dossier = json.loads(path.read_text())
        geometry, source = footprint_for(dossier, city)
        indexed = {f['number']: f for f in dossier['floors'] if f['number'] is not None}
        # Missing catalog floors remain unknown, with no invented floor id or area.
        for number in range(1, (dossier['stories'] or 0) + 1):
            floor = indexed.get(number, {})
            status = floor.get('source_status', 'unknown')
            height = dossier['render']['floor_height_m']
            properties = dict(building_id=dossier['id'], building_name=dossier['name'],
                              floor_number=number, floor_id=floor.get('floor_id'),
                              base_m=(number-1)*height, height_m=number*height,
                              source_status=status, game_status='dark' if status == 'dark' else None,
                              is_hero=dossier['id'] in heroes)
            # Foreign member keeps the UI's exact property contract intact.
            features.append(dict(type='Feature', properties=properties, geometry=geometry,
                                 footprint_source=source))
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(dict(type='FeatureCollection', features=features), separators=(',', ':')) + '\n')
    print(f'Wrote {len(features)} floor polygons to {output}')


if __name__ == '__main__':
    import os
    from dotenv import load_dotenv
    load_dotenv(ROOT / '.env')
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dossiers', type=Path, default=ROOT / 'server/fixtures/dossiers')
    parser.add_argument('--city', type=Path, default=ROOT / 'apps/web/public/city.geojson')
    parser.add_argument('--output', type=Path, default=ROOT / 'apps/web/public/floors.geojson')
    args = parser.parse_args()
    build_floors(args.dossiers, args.city, args.output,
                 {x.strip() for x in os.getenv('HERO_PROPERTY_IDS', '233953,233899').split(',')})
