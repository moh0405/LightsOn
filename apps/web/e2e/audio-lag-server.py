"""Native audio measurement server: real kit/game, no paid provider calls."""
import asyncio
import json
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / 'server'))
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parents[3] / '.env')
# Explicitly disable provider credentials without printing their values.
os.environ.update(ELEVENLABS_API_KEY='', LANGSMITH_TRACING='false', LANGSMITH_API_KEY='',
                  AWS_EC2_METADATA_DISABLED='true', BEDROCK_SPEND_CAP_USD='0', DEMO_MODE='0')
from app.agent import fake_agent, live_agent, prep_agent
from app.city import City
from app.data.provider import get_provider
from app.models import Pitch
from app.rooms import DEFAULT_DURATIONS, utcnow

# Host drives transitions after the native voice completes; no phase is shortened.
# AUDIO_LAG_REALTIME=1 keeps the demo preset's real timers instead (no host skips).
REALTIME = bool(os.environ.get('AUDIO_LAG_REALTIME'))
if REALTIME:
    os.environ.update(DEMO_MODE='1', PHASE_DURATIONS_SCALE='1')
else:
    for phase in DEFAULT_DURATIONS:
        DEFAULT_DURATIONS[phase] = 600

def forbidden(*args, **kwargs):
    raise AssertionError('Audio measurements forbid paid provider/prep calls')
prep_agent.build_agent = forbidden

if os.environ.get('AUDIO_LAG_AGENT') == 'recorded':
    os.environ['AGENT_MODE'] = 'live'
    dossier = get_provider().dossier('233953')
    def replay(self, step, system, content, schema, timeout):
        # Dialogue recorded in tests/test_persona_replies.py from its paid confirmation.
        # Scores/aliases are a deterministic shell; these are not fresh model responses.
        if step == 'claim_check':
            return {'checks': [{'index': row['index'], 'supported': True, 'reason': ''}
                               for row in json.loads(content)]}
        if step == 'challenge':
            player = re.search(r'player="([^"]+)"', content)[1]
            gym = '>gym</pitch>' in content
            return {'challenges': [dict(player_id=player,
                line=('My typical floor gives you 22,189 square feet—a gym needs purpose, footprint, and a pitch.'
                      if gym else "8 dark floors, darling—but a studio needs light. Where's your daytime draw?"),
                counteroffer=("Show me your member count and equipment layout; I'll light up the right floor for you."
                              if gym else "Show me how evening classes fill those dark hours, and we'll talk about what the neighbors actually need."),
                fact_ids=['F_233953_grossTypicalFloorSquareFeet' if gym else 'F_233953_dark_floor_count'],
                category_guess='wildcard')]}
        candidates = [Pitch(player_id=pid, text=text, origin='web', at=utcnow())
                      for pid, text in re.findall(r'<pitch player="([^"]+)"[^>]*>(.*?)</pitch>', content)]
        proposal = fake_agent.verdict(candidates, dossier, City()).model_dump()
        proposal.update(reason_line="A gym pitch with no footprint, no concept, and no sizzle — bruh, I've hosted 670 former tenants and they all brought more than one word.",
                        fact_ids=['F_233953_former_tenancy_records'])
        return proposal
    live_agent.Bedrock.__call__ = replay
    # Let the actual preliminary line reach the screen before replay completes.
    original_call = live_agent.LiveAgent.call
    async def delayed_call(self, *args, **kwargs):
        # Realtime runs model a slow live turn so the thinking line and the timer race are real.
        await asyncio.sleep(float(os.environ.get('AUDIO_LAG_AGENT_DELAY', '.15')))
        return await original_call(self, *args, **kwargs)
    live_agent.LiveAgent.call = delayed_call
else:
    os.environ['AGENT_MODE'] = 'fake'
    live_agent.Bedrock.__call__ = forbidden
    if os.environ.get('AUDIO_LAG_LONG_VERDICT'):
        # A 46-word, fact-free reason line: far longer than the VERDICT window can speak.
        LONG_REASON = ('I listened to every pitch tonight, weighed who would walk through my doors after dark, '
                       'who would stay, and who would only pass by, and after all of that back and forth '
                       'one idea kept returning to me, so that is the one I am choosing.')
        short_verdict = fake_agent.verdict
        def long_verdict(*args, **kwargs):
            return short_verdict(*args, **kwargs).model_copy(update={'reason_line': LONG_REASON})
        fake_agent.verdict = long_verdict

import uvicorn
uvicorn.run('app.main:app', host='127.0.0.1', port=int(os.environ.get('LO_E2E_API_PORT', '21501')))
