"""Deterministic persona generator: a distinct, grounded character for any building, no model.

Every factual sentence is a `fact_clauses` clause for one cited fact; everything else is
explicitly marked fiction and must pass the same `validate_persona` gate as prepared personas.
The era (from the completion year) picks the voice, the building's own facts pick the hook.
"""
from __future__ import annotations

from ..models import Persona
from .persona import (DESIRE_REASONS, DESIRES, EMPTY_LIMITS, ERA_LINES, desire_support, era_voice,
                      fact_clauses, physical_limits, validate_persona)

# The intro's factual hook, in the order the tables below are indexed.
HOOKS = ['stories', 'height', 'dark_sqft', 'dark_floors', 'renovation', 'completion']
HOOK_KEYS = {'stories': 'numStoriesAboveGrade', 'height': 'buildingHeightInFeet', 'dark_sqft': 'dark_sqft',
             'dark_floors': 'dark_floor_count', 'renovation': 'construction_RenovationFinished',
             'completion': 'construction_ConstructionComplete'}
# Which clause of the cited fact opens the intro (an index into fact_clauses).
HOOK_CLAUSE = {'completion': 1, 'dark_floors': 1}

# Acting direction per era. Fiction only: idiom and attitude, never claims (checked by tests
# and by validate_persona). `tails` follow the intro's cited clause, one per HOOK.
ERAS = {
    'old-Houston art-deco pride': dict(
        style='proud theatrical sharp witty', sound='low brass',
        tails=['Sugar, put on your best hat; I only dance with the bold.',
               'Dollface, I look down on timid ideas, so dazzle me.',
               'Darling, that is a lot of waiting, so make it worth my evening.',
               'Honey, every one of them is holding out for a grand gesture.',
               'Sugar, a little polish never hurt a legend in waiting.',
               'Darling, I have standards, and they wear pearls.'],
        catchphrases=['Make it swell, make it bold, sugar.',
                      'Dollface, dazzle me or do not bother.',
                      'Darling, I only say yes to a showstopper.',
                      'Put on the ritz, hotshot; I am watching.',
                      'Honey, glamour is a business plan.',
                      'Sugar, bring me sparkle and bring me nerve.'],
        neighbors=['Sugar, that neighbor has spirit; I approve.',
                   'Dollface, I keep an eye on that one, always.',
                   'Honey, a rival keeps a lady sharp.']),
    'midcentury dry wit': dict(
        style='dry witty sharp playful', sound='warm piano',
        tails=['Cool it, daddy-o, and give me a pitch with some nerve.',
               'How charming; now aim your idea a little higher.',
               'Listen, that is a lot of quiet, so make some noise worth hearing.',
               'Well, they are waiting, and I am not getting any younger.',
               'Now, polish is nice, but I take my pitches strong.',
               'Listen, I take my pitches like my coffee: strong and to the point.'],
        catchphrases=['How charming. Now make it make sense.',
                      'Cool it, daddy-o; nerve beats noise.',
                      'Make it snappy and make it smart.',
                      'Well now, surprise me.',
                      'Listen, wit is cheap; conviction costs extra.',
                      'Keep it cool and keep it clever.'],
        neighbors=['How charming; they are trying so hard.',
                   'That neighbor has nerve, and I admire nerve.',
                   'Cool customer, that one; I like the style.']),
    'brutalist gruff affection': dict(
        style='gruff but affectionate dry', sound='low brass',
        tails=['Kid, I do not do flattery, so lead with conviction.',
               'Kid, I look down on fluff, so keep it real.',
               'That is a big quiet stretch, kid, so bring me something honest.',
               'Kid, they are dark, not done; bring me something real.',
               'Kid, polish does not make me soft, so pitch it straight.',
               'Skip the frosting, kid; I want the plan.'],
        catchphrases=['Listen up, kid: substance first, sparkle later.',
                      'Keep it real, kid, and keep it short.',
                      'Show me the work, kid, and spare me the sparkle.',
                      'Look, I am gruff, but I am fair.',
                      'No fluff, kid, just straight talk.',
                      'No frosting, kid; just the plan.'],
        neighbors=['Kid, that neighbor talks big; I just show up.',
                   'Let them sparkle; I will be right here, holding the line.',
                   'I respect them, kid, and that is all you get.']),
    'boomtime boardroom swagger': dict(
        style='confident sharp playful investor', sound='bright strings',
        tails=['Hotshot, I only shake hands on big ideas, so think big.',
               'Listen, I look down on small thinking, so aim higher, partner.',
               'That is a lot of upside sitting in the dark, hotshot; show me the play.',
               'Every one of them is an upside play waiting on the right partner.',
               'Now pitch me like it is a bull market, partner.',
               'Big ideas only, partner; I do not do small potatoes.'],
        catchphrases=['Go big or go home, hotshot.',
                      'Show me the upside, partner, and make it soar.',
                      "Let's talk upside, hotshot; time is money.",
                      'Bring me a deal with some swagger in it.',
                      'Make it bold, make it profitable, make it quick.',
                      'Big ideas only, partner; I do not wait around.'],
        neighbors=['Look at that neighbor, playing it big; I respect the hustle.',
                   'That neighbor keeps me sharp; competition is good for business.',
                   'I am rooting for them, but I am betting on me.']),
    'insecure glass ambition': dict(
        style='anxious playful sentimental', sound='soft marimba',
        tails=['Do I look impressive to you, or just a little extra?',
               'Honestly, is that impressive, or am I trying too hard?',
               'Everyone is watching, so make me look good in the dark.',
               'Is that a lot, or am I being dramatic again?',
               'Honestly, does the refresh make me look trendy enough?',
               'Am I still the new thing, or do I need a glow-up from you?'],
        catchphrases=['Make it shareable, make it sparkle, make it mine.',
                      'Tell me I am iconic, then tell me your plan.',
                      'Everyone is watching, so make me look good.',
                      'Please hype me up, then pitch me something real.',
                      'Make me the main character, please.',
                      'I need this to go viral, darling.'],
        neighbors=['Do they look better than me? Please do not answer.',
                   'I am not jealous; I am just paying very close attention.',
                   'Everyone loves them, and I am totally fine with that, darling.']),
    'hopeful investor': dict(
        style='hopeful warm generous', sound='warm piano',
        tails=['I am ready to believe in something new, so show me.',
               'Surprise me, and I might surprise you back.',
               'That is a lot of hope waiting, so bring me a spark.',
               'Every one of them is waiting on a good idea.',
               'Show me the spark and I will bring the fireworks.',
               'I am ready to believe in something new.'],
        catchphrases=['Show me the spark and I will bring the fireworks.',
                      'Surprise me, and I might surprise you back.',
                      'Bring me a little hope and a lot of nerve.',
                      'Make me believe, friend.',
                      'Give me a reason to light up.',
                      'I am ready when you are.'],
        neighbors=['I am cheering for them, quietly.',
                   'That neighbor gives me hope.',
                   "Let's all shine together."]),
}
# Class vocabulary: one more fictional beat, chosen by the building's verified class.
CLASS_LINES = {
    'A': 'I am top shelf, and I price my yes accordingly.',
    'B': 'I am scrappy, darling, and scrappy knows a bargain.',
    'C': 'I am humble, kid, but humble still has standards.',
}
MOOD_BY_DARK_SHARE = [(.30, 'lonely'), (.20, 'anxious'), (.10, 'hopeful'), (0, 'proud')]


def _facts(dossier: dict) -> dict[str, dict]:
    """Verified, positive, speakable facts by key."""
    return {f['key']: f for f in dossier['facts']
            if f.get('kind') == 'verified' and f.get('value') not in (None, 0, '') and fact_clauses(f)
            and not (type(f['value']) in (int, float) and f['value'] < 0)}


def dark_share(facts: dict[str, dict]) -> float | None:
    dark, total = facts.get('dark_sqft'), facts.get('rentableBuildingAreaSquareFeet')
    if not dark or not total:
        return None
    return dark['value'] / total['value']


def choose_hook(facts: dict[str, dict], era: str) -> str | None:
    share = dark_share(facts)
    stories = facts.get('numStoriesAboveGrade')
    rules = [
        ('stories', stories is not None and stories['value'] >= 60),
        ('height', 'buildingHeightInFeet' in facts),
        ('dark_sqft', share is not None and share >= .30),
        ('completion', era not in {'boomtime boardroom swagger', 'hopeful investor'}),
        ('dark_floors', True), ('renovation', True), ('completion', True), ('stories', True),
    ]
    return next((hook for hook, ok in rules if ok and HOOK_KEYS[hook] in facts), None)


def choose_desire(dossier: dict, facts: dict[str, dict], era: str) -> str | None:
    support = desire_support(dossier)
    share = dark_share(facts)
    stories = facts.get('numStoriesAboveGrade')
    plate = facts.get('grossTypicalFloorSquareFeet')
    ground = {f['number']: f['source_status'] for f in dossier.get('floors', [])}.get(1)
    rules = [
        ('be_famous_again', stories is not None and stories['value'] >= 60),
        ('feed_the_block', ground == 'dark'),
        ('people_living_here', share is not None and share >= .30),
        ('night_life', era == 'insecure glass ambition'),
        ('make_things', plate is not None and plate['value'] >= 27000),
        ('public_ground_floor', True), ('night_life', True),
    ]
    rules += [(key, True) for key in DESIRES]
    return next((key for key, ok in rules if ok and support[key]), None)


def choose_limits(facts: dict[str, dict], hook: str | None) -> list[dict]:
    candidates = physical_limits({'facts': list(facts.values()), 'floors': []})
    by_key = {c['fact_ref'].split('_', 2)[2]: c for c in candidates}
    order = ['grossTypicalFloorSquareFeet', 'dark_sqft',
             'buildingHeightInFeet' if hook == 'height' else 'parkingRatio',
             'numStoriesAboveGrade', 'parkingRatio', 'buildingHeightInFeet']
    chosen = []
    for key in order:
        if key in by_key and by_key[key] not in chosen and len(chosen) < 3:
            chosen.append(by_key[key])
    return chosen


def generate_persona(dossier: dict) -> Persona:
    era = era_voice(dossier)
    kit = ERAS[era]
    facts = _facts(dossier)
    hook = choose_hook(facts, era)
    desire_key = choose_desire(dossier, facts, era)
    if desire_key is None:
        raise ValueError('No facts support a generated desire')
    index = HOOKS.index(hook) if hook else len(HOOKS) - 1
    catchphrase = kit['catchphrases'][index]
    backstory = []
    if hook:
        fact = facts[HOOK_KEYS[hook]]
        clauses = fact_clauses(fact)
        clause = clauses[min(HOOK_CLAUSE.get(hook, 0), len(clauses) - 1)]
        backstory.append(dict(text=f"{clause} {kit['tails'][index]}", fact_ref=fact['id'], fiction=False))
    intro_line = backstory[0]['text'] if backstory else catchphrase
    for key in ['construction_ConstructionComplete', 'construction_RenovationFinished', 'numStoriesAboveGrade',
                'buildingHeightInFeet', 'dark_floor_count', 'dark_sqft', 'top_former_industry_1']:
        if key in facts and (not hook or key != HOOK_KEYS[hook]):
            backstory.append(dict(text=fact_clauses(facts[key])[0], fact_ref=facts[key]['id'], fiction=False))
    building_class = next((f['value'] for f in dossier['facts'] if f['key'] == 'buildingClass'
                           and f.get('kind') == 'verified'), None)
    fiction = ERA_LINES[era][:2] + ([CLASS_LINES[building_class]] if building_class in CLASS_LINES else [])
    backstory += [dict(text=line, fact_ref=None, fiction=True) for line in fiction]
    limits = physical_limits(dossier)
    chosen = [c for c in choose_limits(facts, hook) if c in limits] if len(limits) >= 2 else []
    if len(limits) >= 2 and len(chosen) < 2:
        chosen = limits[:2]
    share = dark_share(facts)
    mood = next(m for floor, m in MOOD_BY_DARK_SHARE if share >= floor) if share is not None else 'hopeful'
    support = desire_support(dossier)[desire_key]
    neighbors = {pid: kit['neighbors'][i] for i, pid in enumerate(dossier['neighbors'][:3])}
    return validate_persona(dict(
        building_id=dossier['id'], name=dossier['name'],
        voice_style=f"{era} {kit['style']} {mood}", voice_id='', mood_baseline=mood,
        desire_key=desire_key, desire_text=DESIRES[desire_key],
        desire_reason_fact_ids=list(dict.fromkeys(support)), desire_reason=DESIRE_REASONS[desire_key],
        hard_limits=chosen, hard_limits_empty_reason=None if chosen else EMPTY_LIMITS,
        backstory=backstory, catchphrase=catchphrase, intro_line=intro_line,
        signature_sound=kit['sound'], neighbor_lines=neighbors), dossier)
