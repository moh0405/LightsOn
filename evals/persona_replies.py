#!/usr/bin/env python3
"""One authorized two-player live round; hard reservation ceiling of $0.10/$3.20."""
import asyncio
import json
import os
from pathlib import Path
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'server'))
from dotenv import load_dotenv
load_dotenv(ROOT / '.env')

from app.agent.spend import SpendLedger
from app.rooms import Conn, Room


async def main():
    if not os.getenv('BEDROCK_SPEND_LEDGER'):
        raise SystemExit('Set BEDROCK_SPEND_LEDGER to the shared main-checkout ledger.')
    before = SpendLedger().snapshot()['total_usd']
    if before >= 3.20:
        raise SystemExit('Ledger at or above $3.20; no paid calls allowed.')
    os.environ['BEDROCK_SPEND_CAP_USD'] = str(min(3.20, before + .10))
    os.environ.update(AGENT_MODE='live', DATA_MODE='kit', DEMO_MODE='1')
    output = {'before_usd': before, 'lines': [], 'fallbacks': [], 'events': []}
    with tempfile.TemporaryDirectory(prefix='persona-paid-') as directory:
        room = Room(code='VOICE', hero_ids=['233953'], durations={}, state_dir=Path(directory))
        async def send(event):
            output['events'].append(event['type'])
            if event['type'] == 'building_intro':
                output['lines'].append({'step': 'intro', 'text': event['text']})
            elif event['type'] == 'counteroffer' and event['fact_ids']:
                output['lines'].append({'step': 'challenge', 'text': event['line'],
                                         'counteroffer': event['counteroffer']})
            elif event['type'] == 'verdict':
                output['lines'].append({'step': 'verdict', 'text': event['reason_line']})
        room.conns.append(Conn('screen', send))
        a, b = room.add_player('Ann'), room.add_player('Bo')
        try:
            await room.set_phase('EXPLORE')
            await room.start_round('233953')
            await room.advance()
            await room.submit_pitch(a.id, 'gym', 'web', room.round_id, False)
            await room.submit_pitch(b.id, 'A public art studio with evening classes for neighbors', 'web', room.round_id, False)
            await room.advance()
            await room._agent_task
            output['fallbacks'].append(dict(room._last_live_agent.fallback_causes))
            await room.advance()
            await room.advance()
            await room._agent_task
            output['fallbacks'].append(dict(room._last_live_agent.fallback_causes))
            await room.advance()
            await room.advance()
            output['phase'] = room.phase
        finally:
            room.close()
    after = SpendLedger().snapshot()['total_usd']
    output.update(after_usd=after, spend_usd=after-before)
    target = ROOT / 'server/state/persona_replies_paid.json'
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(output, indent=2))
    print(json.dumps(output, indent=2))
    assert after <= 3.20 and after - before <= .10000001
    assert output['phase'] == 'REVIVED'
    assert not any(output['fallbacks']), 'Round completed with fallback; see recorded evidence.'


if __name__ == '__main__':
    asyncio.run(main())
