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
from app.agent.prep_agent import finalize_floors, prep_building, regenerate_persona
from app.agent.spend import SpendLedger


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('property_id')
    parser.add_argument('--force', action='store_true')
    parser.add_argument('--persona-only', action='store_true', help='Run only persona_writer on cached scout files')
    parser.add_argument('--research-dir', type=Path)
    parser.add_argument('--estimate-only', action='store_true')
    args = parser.parse_args()
    if args.persona_only:
        if args.research_dir is None:
            parser.error('--persona-only requires --research-dir')
        result = regenerate_persona(args.property_id, args.research_dir, estimate_only=args.estimate_only)
        if result['prep_status'] in {'estimate', 'unaffordable'}:
            print(json.dumps(result, indent=2))
            return 0 if result['prep_status'] == 'estimate' else 1
    else:
        result = prep_building(args.property_id, args.force)
    if result.get('prep_status') != 'ready':
        print('Prep unavailable; game retains its deterministic fallback.', file=sys.stderr)
        return 1
    finalize_floors()
    print(json.dumps(dict(building_id=args.property_id, status='ready',
                         spend=SpendLedger().snapshot()), indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
