"""Phase 3 deterministic rules, using the committed real building dossier."""
from copy import deepcopy
from datetime import datetime, timedelta, timezone

import pytest

from app.actions import ActionError, select_target_floors, target_sqft, validate_verdict
from app.agent import fake_agent
from app.city import City, housing_impact, most_needed, needs_bonus
from app.data.provider import provider_for_mode
from app.models import Pitch, ProposalScore, VerdictProposal


@pytest.fixture
def dossier(game_mode):
    return provider_for_mode(game_mode).dossier('233953')


def pitch(pid='a', text='A community space open to everyone', seconds=0, revision=False):
    return Pitch(player_id=pid, text=text, origin='web', revision=revision,
                 at=datetime(2026, 11, 13, tzinfo=timezone.utc) + timedelta(seconds=seconds))


def proposal(pitches, fact_ids=(), **kw):
    return VerdictProposal(winner_player_id=pitches[0].player_id,
        scores=[ProposalScore(player_id=p.player_id, data_fit=8, neighborhood_fit=9,
                              creativity=6, charm=6) for p in pitches],
        reason_line="I'm in.", fact_ids=list(fact_ids), category='community',
        desire_met=True, desire_reveal='A shared space open to everyone.', **kw)


def validate(dossier, batches, players=('a', 'b'), city=None):
    return validate_verdict(batches, dossier=dossier, player_ids=set(players),
                            round_id='R-1', city=city or City(), sqft=94509)


def test_city_rules_and_tie_order():
    city = City()
    assert city.snapshot() == dict(buildings_revived=0, sqft_reimagined=0,
        needs=dict(housing=40, food_retail=30, entertainment=15, community=35),
        most_needed='entertainment', song_layers=0, song_categories=[])
    assert most_needed(dict(housing=1, food_retail=1, entertainment=1, community=1)) == 'housing'
    assert needs_bonus('culture', city.needs) == 2
    assert needs_bonus('entertainment', city.needs) == 2
    assert needs_bonus('housing', city.needs) == 0
    assert needs_bonus('work', city.needs) == 0
    assert needs_bonus('wildcard', city.needs) == 0
    city.revive('one', [6, 7, 8], 'culture', 94509)
    assert city.needs['entertainment'] == 45 and city.snapshot()['most_needed'] == 'food_retail'
    city.revive('one', [6, 7, 8], 'culture', 94509)
    assert city.buildings_revived == 1 and city.sqft_reimagined == 94509
    city.revive('one', [17], 'work', 17696)
    assert city.sqft_reimagined == 112205 and city.buildings_revived == 1
    for i in range(4):
        city.revive(str(i), [6], 'housing', 31503)
    assert city.needs['housing'] == 100
    assert housing_impact(94509) == dict(kind='housing_estimate', sqft=94509, units=83,
        residents=158, label='rough game estimate, not a feasibility claim')


def test_song_layers_count_distinct_categories():
    city = City()
    city.revive('a', [6], 'culture', 1000)
    city.revive('b', [6], 'culture', 1000)
    assert city.snapshot()['song_layers'] == 1
    city.revive('c', [6], 'housing', 1000)
    assert city.snapshot()['song_layers'] == 2


def test_targets_are_lowest_contiguous_dark_verified_and_skip_revived(dossier):
    assert select_target_floors(dossier) == [6, 7, 8]
    assert target_sqft(dossier, [6, 7, 8]) == 94509
    assert select_target_floors(dossier, {6, 7, 8}) == [17, 18]
    modified = deepcopy(dossier)
    floor = next(f for f in modified['floors'] if f['number'] == 6)
    floor['available_sqft'] = None
    assert select_target_floors(modified) == [7, 8]
    modified = deepcopy(dossier)
    for fact in modified['facts']:
        if fact['key'] == 'floor_6_available_sqft':
            fact['kind'] = 'estimate'
    assert select_target_floors(modified) == [7, 8]
    assert target_sqft(dossier, [1]) == 0


def test_scores_clamped_fact_cap_total_and_canonical_category(dossier):
    p = pitch(text='An art museum')
    prop = proposal([p], ['invented-id'])
    prop.scores[0] = ProposalScore(player_id='a', data_fit=99, neighborhood_fit=99, creativity=-3, charm=99)
    result = validate(dossier, [(prop, [p])])
    score = result.scores[0]
    assert (score.data_fit, score.neighborhood_fit, score.creativity, score.charm) == (5, 10, 0, 10)
    assert score.needs_bonus == 2 and score.total == 25  # already at cap
    assert result.fact_ids == [] and result.category == 'culture' and result.impact is None
    prop.fact_ids = [dossier['facts'][0]['id']]
    assert validate(dossier, [(prop, [p])]).scores[0].data_fit == 10
    prop.category = 'invalid'
    assert validate(dossier, [(prop, [p])]).category == 'culture'


def test_bonus_and_ties_use_creativity_then_earlier_final_submission(dossier):
    a, b = pitch('a', 'A museum', 0), pitch('b', 'A concert hall', 1)
    prop = proposal([a, b], [dossier['facts'][0]['id']])
    result = validate(dossier, [(prop, [a, b])])
    assert result.winner_player_id == 'a'
    assert all(s.needs_bonus == 2 and s.total == 30 for s in result.scores)
    prop.scores[1].creativity += 1
    prop.scores[1].charm -= 1
    assert validate(dossier, [(prop, [a, b])]).winner_player_id == 'b'
    prop.scores[1].creativity -= 1
    prop.scores[1].charm += 1
    revision = pitch('a', 'A museum', 2, True)
    assert validate(dossier, [(prop, [a, b]), (proposal([revision], prop.fact_ids), [revision])]).winner_player_id == 'b'


def test_revision_keeps_better_score_and_housing_impact(dossier):
    original, revised = pitch(text='Apartments'), pitch(text='Apartments', seconds=1, revision=True)
    first, second = proposal([original]), proposal([revised])
    second.scores[0].charm = 0
    result = validate(dossier, [(first, [original]), (second, [revised])])
    assert result.scores[0].charm == 6 and result.impact == housing_impact(94509)
    second.scores[0].charm = 10
    assert validate(dossier, [(first, [original]), (second, [revised])]).scores[0].charm == 10


@pytest.mark.parametrize('invalid', ['winner_not_in_room', 'winner_not_pitched', 'outsider_score', 'duplicate_score', 'missing_score'])
def test_invalid_proposals_cannot_award_points(dossier, invalid):
    p = pitch()
    prop = proposal([p])
    if invalid == 'winner_not_in_room': prop.winner_player_id = 'outsider'
    if invalid == 'winner_not_pitched': prop.winner_player_id = 'b'
    if invalid == 'outsider_score': prop.scores[0].player_id = 'b'
    if invalid == 'duplicate_score': prop.scores.append(prop.scores[0])
    if invalid == 'missing_score': prop.scores.clear()
    with pytest.raises(ActionError): validate(dossier, [(prop, [p])])


@pytest.mark.parametrize(('text', 'category'), [('apartments', 'housing'), ('café', 'food_retail'),
    ('gaming arena', 'entertainment'), ('public library', 'community'), ('art museum', 'culture'),
    ('clinic', 'health'), ('maker studio', 'work'), ('cloud dreams', 'wildcard')])
def test_keyword_classifier(text, category):
    assert fake_agent.classify_use(text) == category


def test_fake_agent_is_deterministic_grounded_and_rewards_counteroffer(dossier):
    # Test the chosen hidden desire, which can now come from a prepared persona.
    matching = {
        'public_ground_floor': 'A shared space open to everyone',
        'people_living_here': 'Housing and apartments',
        'night_life': 'A night concert',
        'feed_the_block': 'A food market',
        'make_things': 'A maker studio',
        'be_famous_again': 'An art gallery and culture space',
    }
    desire_key = (dossier.get('persona') or {}).get('desire_key', 'public_ground_floor')
    p = pitch(text='An idea for this building')
    city = City()
    assert fake_agent.intro(dossier) == fake_agent.intro(dossier)
    challenge = fake_agent.challenge(p, dossier)
    assert challenge == fake_agent.challenge(p, dossier)
    facts = {f['id']: f for f in dossier['facts']}
    assert challenge.fact_ids and set(challenge.fact_ids) <= facts.keys()
    from app.agent.persona import validate_beat
    for fid in challenge.fact_ids:
        validate_beat(dict(text=challenge.line.removesuffix(' How does your idea fit?'), fact_ref=fid, fiction=False), facts)
    original = fake_agent.verdict([p], dossier, city)
    assert original == fake_agent.verdict([p], dossier, city)
    revised = fake_agent.verdict([pitch(text=matching[desire_key])], dossier, city)
    assert revised.scores[0].neighborhood_fit > original.scores[0].neighborhood_fit
    assert set(original.fact_ids) <= facts.keys()
    empty = deepcopy(dossier)
    empty['facts'] = []
    assert fake_agent.challenge(p, empty).fact_ids == []


def test_fractional_needs_small_area_and_health_bonus():
    city = City()
    city.revive('233899', [3], 'food_retail', 24570)
    assert city.needs['food_retail'] == 54.57
    city.needs['community'] = 0
    assert needs_bonus('health', city.needs) == needs_bonus('community', city.needs) == 2


def test_four_floor_cap_uses_actual_contiguous_dossier_floors():
    dossier = provider_for_mode('fixtures').dossier('233899')
    already = {f['number'] for f in dossier['floors'] if f['number'] is not None and f['number'] < 43}
    assert select_target_floors(dossier, already) == [43, 44, 45, 46]


def test_revival_action_rejects_stale_round_and_target_tampering(dossier):
    from app.actions import validate_revival
    p = pitch()
    verdict = validate(dossier, [(proposal([p]), [p])])
    args = dict(round_id='R-1', committed_rounds=set(), dossier=dossier, target_floors=[6, 7, 8],
                revived_floors=set(), verdict=verdict, player_colors={'a': '#ff5d73'}, auto_completed=False)
    event = validate_revival(**args)
    assert event == dict(building_id='233953', floors=[6, 7, 8], color='#ff5d73',
                         category='community', sqft=94509, auto_completed=False)
    assert validate_revival(**{**args, 'committed_rounds': {'R-1'}}) is None
    for change in [{'round_id': 'R-2'}, {'target_floors': [1]}, {'target_floors': [6, 6]},
                   {'target_floors': [6, 7, 8, 17]}, {'player_colors': {}}, {'revived_floors': {6}}]:
        with pytest.raises(ActionError): validate_revival(**{**args, **change})


def test_fake_agent_grounding_for_every_available_building():
    provider = provider_for_mode('fixtures')
    for building in provider.buildings():
        d = provider.dossier(building['id'])
        c = fake_agent.challenge(pitch(), d)
        v = fake_agent.verdict([pitch()], d, City())
        ids = {f['id'] for f in d['facts']}
        assert set(c.fact_ids) <= ids and set(v.fact_ids) <= ids
        assert v == fake_agent.verdict([pitch()], d, City())
