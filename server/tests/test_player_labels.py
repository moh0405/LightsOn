"""Players never see internal labels (candidate_N, pN, player ids) in published dialogue."""
import json
from datetime import datetime, timezone

import pytest

from app.agent import fake_agent
from app.agent.grounding import name_players
from app.agent.live_agent import LiveAgent
from app.agent.prompts import pitch_data
from app.city import City
from app.data.provider import provider_for_mode
from app.models import Pitch

# The exact line a paid live verdict published (evals/latency-check.md).
LIVE_LINE = ("A night-lit community gaming studio fits my dark floors and my deepest wish — "
             "candidate_1's single-floor ask blows past every wall I have, darling.")


def pitch(text, player, revision=False):
    return Pitch(player_id=player, text=text, origin='web', revision=revision, at=datetime.now(timezone.utc))


def test_candidate_alias_becomes_the_nickname():
    named = name_players(LIVE_LINE, {'candidate_0': 'Ann', 'candidate_1': 'Bo'})
    assert named == ("A night-lit community gaming studio fits my dark floors and my deepest wish — "
                     "Bo's single-floor ask blows past every wall I have, darling.")


@pytest.mark.parametrize('line, expected', [
    ('p1 takes it with a studio.', 'Ann takes it with a studio.'),
    ('Candidate 1 wins.', 'Bo wins.'),
    ('a1b2c3d4 wins the night.', 'Ann wins the night.'),
    ('No labels here.', 'No labels here.'),
])
def test_known_labels_are_replaced(line, expected):
    assert name_players(line, {'p1': 'Ann', 'a1b2c3d4': 'Ann', 'candidate_1': 'Bo'}) == expected


@pytest.mark.parametrize('line', ["candidate_7's idea wins.", 'p9 wins.', 'candidate 3 wins.'])
def test_unknown_internal_labels_are_rejected(line):
    assert name_players(line, {'candidate_0': 'Ann', 'p1': 'Ann'}) is None


def test_a_nickname_that_looks_like_a_label_is_not_rejected():
    assert name_players('candidate_0 wins.', {'candidate_0': 'p7'}) == 'p7 wins.'


def test_prompt_presents_pitches_with_nicknames():
    data = pitch_data([pitch('A studio', 'candidate_0')], {'candidate_0': 'Ann <b>'})
    assert 'nickname="Ann &lt;b&gt;"' in data


@pytest.mark.parametrize('mode', ['kit', 'fixtures'])
async def test_live_verdict_publishes_nicknames_not_aliases(monkeypatch, mode):
    dossier = provider_for_mode(mode).dossier('233953')
    pitches = [pitch('A community gaming studio open at night', 'aaaa1111'),
               pitch('A single-floor arcade', 'bbbb2222')]
    async def model(step, system, content, schema, timeout):
        if step == 'claim_check':
            return {'checks': [{'supported': True, 'reason': ''} for _ in json.loads(content)]}
        assert 'nickname="Ann"' in content and 'nickname="Bo"' in content
        proposal = fake_agent.verdict([p.model_copy(update={'player_id': f'candidate_{i}'})
                                       for i, p in enumerate(pitches)], dossier, City())
        refs = [f['id'] for f in dossier['facts'] if f['key'] in ('dark_sqft',) and f['value'] is not None]
        return proposal.model_copy(update={'reason_line': LIVE_LINE, 'fact_ids': refs}).model_dump()
    agent = LiveAgent(model=model)
    batches = await agent.verdict_batches(pitches, [], dossier, City(), [], names={'aaaa1111': 'Ann', 'bbbb2222': 'Bo'})
    line = batches[0][0].reason_line
    assert 'candidate' not in line and "Bo's single-floor ask" in line
