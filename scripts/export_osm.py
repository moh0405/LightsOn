#!/usr/bin/env python3
"""Export downtown Houston OSM context polygons; preserve prior output on errors."""
import argparse
import json
import logging
from pathlib import Path
import re
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
QUERY = '[out:json][timeout:45];way["building"](29.748,-95.375,29.766,-95.355);out geom;'


def height_m(tags):
    value = tags.get('height', '')
    match = re.fullmatch(r'\s*(\d+(?:\.\d+)?)\s*(m|ft|feet|\x27)?\s*', value)
    if match:
        return float(match[1]) * (.3048 if match[2] in {'ft', 'feet', "'"} else 1)
    try:
        return float(tags['building:levels']) * 3.5
    except (KeyError, ValueError):
        return 12


def convert(payload):
    features = []
    for element in payload.get('elements', []):
        ring = [[p['lon'], p['lat']] for p in element.get('geometry', [])]
        if len(ring) < 4 or ring[0] != ring[-1]:
            continue
        features.append(dict(type='Feature', id=element['id'],
                             properties=dict(height_m=height_m(element.get('tags', {}))),
                             geometry=dict(type='Polygon', coordinates=[ring])))
    return dict(type='FeatureCollection', attribution='© OpenStreetMap contributors, ODbL', features=features)


def export(output, endpoint):
    request = urllib.request.Request(endpoint, data=urllib.parse.urlencode({'data': QUERY}).encode(),
                                     headers={'User-Agent': 'LightsOn/0.1 (HackPrinceton context export)'})
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            result = convert(json.load(response))
        if not result['features']:
            raise ValueError('Overpass returned no closed building polygons')
    except (urllib.error.URLError, TimeoutError, ValueError) as error:
        logging.error('OSM export failed (%s); existing output retained', error)
        raise SystemExit('OSM export failed; retry later or use --endpoint with an Overpass mirror') from error
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, separators=(',', ':')) + '\n')
    print(f'Exported {len(result["features"])} OSM buildings to {output}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'apps/web/public/city.geojson')
    parser.add_argument('--endpoint', default='https://overpass-api.de/api/interpreter')
    args = parser.parse_args(); export(args.output, args.endpoint)
