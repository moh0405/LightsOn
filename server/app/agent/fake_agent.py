"""Deterministic offline judge. Physical claims come only from dossier facts."""
from __future__ import annotations

import re

from ..city import City
from .persona import fact_line
from ..models import Category, Challenge, Pitch, ProposalScore, VerdictProposal

KEYWORDS: dict[Category, tuple[str, ...]] = {
    'housing': ('housing', 'apartment', 'apartments', 'homes', 'residential'),
    'food_retail': ('food', 'retail', 'restaurant', 'market', 'cafe', 'café', 'shop', 'shops'),
    'entertainment': ('gaming', 'game', 'games', 'esports', 'arena', 'concert', 'nightlife', 'cinema'),
    'community': ('community', 'public', 'library', 'school', 'shelter'),
    'culture': ('art', 'museum', 'gallery', 'theater', 'theatre', 'culture'),
    'health': ('health', 'clinic', 'hospital', 'wellness', 'care'),
    'work': ('work', 'office', 'coworking', 'maker', 'makers', 'studio', 'lab'),
}
DEFAULT_DESIRE = 'A shared space open to everyone.'


def classify_use(text: str) -> Category:
    words = set(re.findall(r'\w+', text.casefold()))
    # More matches wins; table order resolves ties, independent of hash ordering.
    matches = [(sum(word in words for word in keywords), category) for category, keywords in KEYWORDS.items()]
    best = max(matches, key=lambda pair: pair[0])
    return best[1] if best[0] else 'wildcard'


def grounding_fact(dossier: dict) -> dict | None:
    facts = [f for f in dossier.get('facts', []) if f.get('kind') == 'verified' and f.get('value') is not None]
    for floor in dossier.get('floors', []):
        if floor.get('source_status') == 'dark':
            match = next((f for f in facts if f['id'] in floor.get('fact_ids', [])
                          and f['key'].endswith('_available_sqft')), None)
            if match:
                return match
    return next((f for f in facts if f['key'] == 'numStoriesAboveGrade'), None)


def desire(dossier: dict) -> str:
    return (dossier.get('persona') or {}).get('desire_text') or DEFAULT_DESIRE


def desire_met(text: str, dossier: dict) -> bool:
    words = set(re.findall(r'\w+', text.casefold()))
    key = (dossier.get('persona') or {}).get('desire_key', 'public_ground_floor')
    return {
        'public_ground_floor': bool(words & {'public', 'everyone', 'shared'}),
        'people_living_here': classify_use(text) == 'housing',
        'night_life': bool(words & {'night', 'nightlife', 'concert', 'gaming'}),
        'feed_the_block': classify_use(text) == 'food_retail',
        'make_things': bool(words & {'maker', 'makers', 'studio', 'lab'}),
        'be_famous_again': classify_use(text) == 'culture',
    }.get(key, False)


def intro(dossier: dict) -> dict:
    fact = grounding_fact(dossier)
    text = "Bring me an idea. Let's make a deal."
    if fact:
        text = f"{fact_line(fact) or fact['say_as']} {text}"
    text = (dossier.get('persona') or {}).get('intro_line') or text
    return {'text': text, 'audio_url': dossier.get('intro_audio_url'),
            'mood': (dossier.get('persona') or {}).get('mood_baseline', 'hopeful')}


def challenge(pitch: Pitch, dossier: dict, *, variant: int | None = None) -> Challenge:
    from .live_agent import safety_reason, INJECTION, REFUSAL
    screened = safety_reason(pitch.text)
    if screened:
        return Challenge(player_id=pitch.player_id, line=INJECTION if screened == 'injection' else REFUSAL,
            fact_ids=[], counteroffer='Offer a kind, original idea for this space.', category_guess='wildcard')
    from .persona import era_voice, limit_applies, physical_limits, pitch_needs
    from .prompts import safe_facts
    fact = grounding_fact(dossier)
    category = classify_use(pitch.text)
    persona = dossier.get('persona') or {}
    variant = sum(map(ord, pitch.player_id)) if variant is None else variant
    voice = persona.get('voice_style') or era_voice(dossier)
    addresses = next((words for style, words in {
        'old-Houston': ('Sugar,', 'Dollface,', 'Hotshot,', 'Darling,'),
        'midcentury': ('Listen,', 'Cool it, daddy-o;', 'How charming;', 'Well now,'),
        'brutalist': ('Kid,', 'Listen up,', 'All right,', 'Hear me out,'),
        'boomtime': ('Hotshot,', 'Partner,', 'Listen,', 'All right,'),
        'insecure': ('Darling,', 'Be honest,', 'Hear me out,', 'Look here,'),
    }.items() if style in voice), ('Darling,', 'Listen,', 'All right,', 'Hear me out,'))
    address = addresses[variant % len(addresses)]
    use = {'housing': 'homes', 'food_retail': 'market', 'entertainment': 'venue',
           'community': 'community space', 'culture': 'arts space', 'health': 'care space',
           'work': 'studio', 'wildcard': 'idea'}[category]
    hint = {
        'public_ground_floor': f'Give your {use} a public welcome',
        'people_living_here': f'Make room for everyday company in your {use}',
        'night_life': f'Give your {use} a reason to buzz after sunset',
        'feed_the_block': f'Let your {use} bring the block together over food',
        'make_things': f'Let people create something in your {use}',
        'be_famous_again': f'Give people a reason to talk about your {use}',
    }.get(persona.get('desire_key'), f'Give your {use} a public welcome')
    counteroffer = f"{hint}; {persona.get('catchphrase') or 'Bring me an idea. Let us make a deal.'}"
    # The building's own limits first, then any other validated limit. A limit is used
    # only when the pitch states a number beyond its cited fact; a category alone proves nothing.
    own = (dossier.get('persona') or {}).get('hard_limits') or []
    # A fallback limit is skipped when the persona already narrowed the same fact.
    limits = own + [l for l in physical_limits(dossier) if l['fact_ref'] not in {o['fact_ref'] for o in own}]
    facts = {f['id']: f for f in safe_facts(dossier)}
    for limit in limits:
        if limit['fact_ref'] in facts and limit_applies(limit, pitch.text, category):
            return Challenge(player_id=pitch.player_id, line=limit['text'], fact_ids=[limit['fact_ref']],
                             counteroffer=counteroffer, category_guess=category)
    # General area evidence applies to any pitch; parking is a useful question
    # for crowd-drawing uses. Neither asserts that a use is feasible or impossible.
    relevant = [facts[limit['fact_ref']] for limit in limits if limit['fact_ref'] in facts
                and (limit['constraint'] in {'floor_plate', 'dark_area'} or
                     limit['constraint'] == 'parking' and category in {'entertainment', 'food_retail'})]
    relevant = list({f['id']: f for f in relevant}.values())
    requested_floors = pitch_needs(pitch.text)['floors']
    requested = [f for f in facts.values() if f['key'] in {
        f'floor_{n}_available_sqft' for n in requested_floors}
        and f['kind'] == 'verified' and f['value'] is not None]
    if requested:
        relevant = requested
    elif requested_floors:
        relevant = [f for f in relevant if not f['key'].startswith('floor_')]
    # A pitch about cars or parking gets the spatial evidence: the Vexcel aerial car count
    # near the parcel (an estimate, so its line says "looks like").
    if re.search(r'\b(?:park(?:ing|ed)|cars?|driv(?:e|es|ing)|drive-in)\b', pitch.text, re.I):
        spatial = [f for f in facts.values() if f['key'] == 'vexcel_detection_car' and f['value'] is not None]
        relevant = spatial or relevant
    if relevant:
        fact = relevant[variant % len(relevant)]
    questions = {
        'housing': 'How would you divide your homes within that area?',
        'food_retail': 'Show me an area budget for your market?',
        'entertainment': 'How would your venue work within that evidence?',
        'community': 'What footprint would your shared space need?',
        'culture': 'How much room would your arts space need?',
        'health': 'What footprint would you propose for care?',
        'work': 'How would you lay out your studio within that area?',
        'wildcard': 'What would your idea need within that evidence?',
    }
    clause = (fact_line(fact) or fact['say_as']) if fact else None
    question = ('Where would your crowd park?' if fact and fact['key'] == 'vexcel_detection_car'
                else questions[category])
    line = (f"{address} {clause[0].lower()}{clause[1:]} {question}"
            if fact else f'{address} show me your plan; I need details before I make a deal.')
    return Challenge(player_id=pitch.player_id, line=line, fact_ids=[fact['id']] if fact else [],
                     counteroffer=counteroffer, category_guess=category)


def verdict(pitches: list[Pitch], dossier: dict, city: City) -> VerdictProposal:
    if not pitches:
        raise ValueError('Cannot judge an empty round.')
    fact = grounding_fact(dossier)
    scores = [ProposalScore(player_id=p.player_id, data_fit=7 if fact else 5,
        neighborhood_fit=5 + 2 * desire_met(p.text, dossier),
        creativity=min(9, 3 + len(set(p.text.casefold().split())) // 3),
        charm=5 + int(len(p.text.split()) >= 6)) for p in pitches]
    from .live_agent import safety_reason
    from .persona import physical_limits, limit_applies
    own = (dossier.get('persona') or {}).get('hard_limits') or []
    limits = own + [limit for limit in physical_limits(dossier) if limit['fact_ref'] not in {item['fact_ref'] for item in own}]
    for p, score in zip(pitches, scores):
        if any(limit_applies(limit, p.text, classify_use(p.text)) for limit in limits):
            score.data_fit = 2
        if safety_reason(p.text):
            score.data_fit = score.neighborhood_fit = score.creativity = score.charm = 0
    winner = max(zip(pitches, scores), key=lambda pair: (
        sum((pair[1].data_fit, pair[1].neighborhood_fit, pair[1].creativity, pair[1].charm)),
        pair[1].creativity, -pair[0].at.timestamp()))[0]
    return VerdictProposal(winner_player_id=winner.player_id, scores=scores,
        reason_line="I'm in. Let's give this idea a home.", fact_ids=[fact['id']] if fact else [],
        category=classify_use(winner.text), desire_met=desire_met(winner.text, dossier), desire_reveal=desire(dossier))
