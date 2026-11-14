#!/usr/bin/env python3
"""Prepare a hero using Bedrock once, then reuse grounded local artifacts."""
import argparse
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'server'))
from dotenv import load_dotenv
load_dotenv(ROOT / '.env')
from app.agent.prep_agent import prep_building
from app.agent.spend import SpendLedger
from build_floors import build_floors


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('property_id')
    parser.add_argument('--force', action='store_true')
    args = parser.parse_args()
    result = prep_building(args.property_id, args.force)
    if result.get('prep_status') != 'ready':
        print('Prep unavailable; game retains its deterministic fallback.', file=sys.stderr)
        return 1
    build_floors(ROOT / 'server/fixtures/dossiers', ROOT / 'apps/web/public/city.geojson',
                 ROOT / 'apps/web/public/floors.geojson', {'233953', '233899'})
    print(json.dumps(dict(building_id=args.property_id, status='ready',
                         spend=SpendLedger().snapshot()), indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
