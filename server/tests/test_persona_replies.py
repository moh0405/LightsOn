"""Regression for the live gym verdict rejected on 2026-11-15."""
import re

import pytest

from app.agent import fake_agent
from app.agent.live_agent import LiveAgent
from app.agent.prompts import challenge_prompt
from app.city import City
from test_live_agent import dossier, pitch

RECORDED = "A gym pitch with no footprint, no concept, and no sizzle — bruh, I've hosted 670 former tenants and they all brought more than one word."


@pytest.mark.parametrize('label', ['candidate_0', 'p1', 'Darcy', 'unknown'])
async def test_recorded_gym_verdict_repairs_candidates_and_voice(dossier, label):
    p = pitch('gym')
    proposal = fake_agent.verdict([p], dossier, City()).model_dump()
    proposal.update(winner_player_id=label, reason_line=RECORDED,
                    fact_ids=['F_233953_former_tenancy_records'])
    proposal['scores'][0]['player_id'] = label
    def model(step, *args):
        return proposal if step == 'verdict' else {'checks': [{'index': 0, 'supported': True, 'reason': ''}]}
    agent = LiveAgent(model=model)
    result = (await agent.verdict_batches([p], [], dossier, City(), [], names={'p1': 'Darcy'}))[0][0]
    assert agent.fallbacks == 0
    assert result.winner_player_id == 'p1'
    assert [s.player_id for s in result.scores] == ['p1']
    assert 'bruh' not in result.reason_line
    assert '670 former tenants' in result.reason_line


async def test_missing_extra_revision_only_and_nonpitcher(dossier):
    original = pitch('gym', 'uuid-a')
    revision = pitch('A public art studio', 'uuid-b', revision=True)
    proposal = fake_agent.verdict([pitch(player='spectator')], dossier, City()).model_dump()
    proposal['scores'][0].update(data_fit=10, creativity=10, charm=10, neighborhood_fit=10)
    agent = LiveAgent(model=lambda step, *args: proposal if step == 'verdict' else
                      {'checks': [{'index': 0, 'supported': True, 'reason': ''}]})
    batches = await agent.verdict_batches([original], [revision], dossier, City(), [],
                                         names={'uuid-a': 'Ann', 'uuid-b': 'Ben', 'spectator': 'Sue'})
    assert agent.fallbacks == 0
    assert [b.winner_player_id for b, _ in batches] == ['uuid-a']
    for result, pitches in batches:
        assert result.scores == fake_agent.verdict(pitches, dossier, City()).scores


@pytest.mark.parametrize('slang', ['bruh', 'LOL', 'fr', '😂', '❤️', '🔥'])
async def test_short_pitch_keeps_grounded_model_nudge_without_slang(dossier, slang):
    p = pitch('gym')
    candidate = fake_agent.challenge(p, dossier).model_dump()
    candidate['line'] += f' {slang}'
    candidate['counteroffer'] = f'{slang} Darling, give your gym a purpose and a footprint.'
    agent = LiveAgent(model=lambda step, *args: {'challenges': [candidate]} if step == 'challenge' else
                      {'checks': [{'index': 0, 'supported': True, 'reason': ''}]})
    result = (await agent.challenge([p], dossier))[0]
    assert agent.fallbacks == 0
    assert slang not in result.line + result.counteroffer
    assert result.fact_ids
    assert 'give your gym a purpose' in result.counteroffer


def test_prompt_explicitly_handles_low_effort_and_prepared_voice(dossier):
    prompt = challenge_prompt(dossier, 'hopeful', pitches=[pitch('gym')])
    assert 'one-word' in prompt
    assert 'prepared voice' in prompt
    assert dossier['persona']['voice_style'] in prompt


async def test_original_revision_alias_ambiguity_and_duplicate_nicknames(dossier):
    from app.agent.live_agent import repair_scores
    sources = [pitch('gym', 'a'), pitch('library', 'b'), pitch('public gym', 'a', True)]
    candidates = [p.model_copy(update={'player_id': f'candidate_{i}'}) for i, p in enumerate(sources)]
    proposal = fake_agent.verdict([pitch(player='a'), pitch(player='Same'),
                                   pitch(player='candidate_1'), pitch(player='candidate_1')], dossier, City())
    for score in proposal.scores:
        score.data_fit = 10
    repaired = repair_scores(proposal, candidates, sources, {'a': 'Same', 'b': 'Same'}, dossier, City())
    defaults = fake_agent.verdict(candidates, dossier, City()).scores
    assert repaired.scores[0] == defaults[0] and repaired.scores[2] == defaults[2]
    assert repaired.scores[1].data_fit == 10
    assert len(repaired.scores) == 3


async def test_fake_bedrock_full_round_publishes_intro_challenges_recorded_verdict(dossier, monkeypatch, tmp_path):
    import json
    from app.agent.live_agent import Bedrock
    from app.rooms import Room, Conn
    from app.agent.persona import fact_line

    monkeypatch.setenv('AGENT_MODE', 'live')
    monkeypatch.setenv('DEMO_MODE', '1')
    fact = next(f for f in dossier['facts'] if f['key'] == 'former_tenancy_records')
    replies = {}
    def model(self, step, system, content, schema, timeout):
        if step == 'claim_check':
            return {'checks': [{'index': row['index'], 'supported': True, 'reason': ''}
                               for row in json.loads(content)]}
        if step == 'challenge':
            player = re.search(r'player="([^"]+)"', content)[1]
            line = f"{fact_line(fact)} Darling, give this idea a little substance."
            replies[player] = line
            return {'challenges': [dict(player_id=player, line=line, fact_ids=[fact['id']],
                counteroffer='Kid, propose a footprint and a welcome for your neighbors.', category_guess='wildcard')]}
        proposal = fake_agent.verdict([pitch('gym', 'Ann')], dossier, City()).model_dump()
        proposal.update(reason_line=RECORDED, fact_ids=[fact['id']])
        return proposal
    monkeypatch.setattr(Bedrock, '__call__', model)
    room = Room(code='REPLY', hero_ids=['233953'], durations={}, state_dir=tmp_path)
    events = []
    async def send(event): events.append(event)
    room.conns.append(Conn('screen', send))
    a, b, spectator = [room.add_player(name) for name in ('Ann', 'Bo', 'Sue')]
    try:
        await room.set_phase('EXPLORE')
        await room.start_round('233953')
        assert next(e for e in events if e['type'] == 'building_intro')['text'] == room.intro['text']
        await room.advance()
        await room.submit_pitch(a.id, 'gym', 'web', room.round_id, False)
        await room.submit_pitch(b.id, 'A public art studio', 'web', room.round_id, False)
        await room.advance()
        await room._agent_task
        assert room._last_live_agent.fallbacks == 0
        for pid, line in replies.items():
            assert any(e['type'] == 'counteroffer' and e['player_id'] == pid and e['line'] == line for e in events)
        assert len(replies) == 2
        await room.advance()
        # Simulate an old/corrupt snapshot: a non-pitcher's revision must never win.
        room.revisions[spectator.id] = pitch('public art studio', spectator.id, True)
        await room.advance()
        await room._agent_task
        assert room._last_live_agent.fallbacks == 0
        assert '670 former tenants' in room.verdict.reason_line and 'bruh' not in room.verdict.reason_line
        assert {s.player_id for s in room.verdict.scores} == {a.id, b.id}
        assert any(e['type'] == 'verdict' and e['reason_line'] == room.verdict.reason_line for e in events)
        await room.advance()
        await room.advance()
        assert room.phase == 'REVIVED' and room.city.buildings_revived == 1
        assert not any(e['type'] == 'error' for e in events)
    finally:
        room.close()
