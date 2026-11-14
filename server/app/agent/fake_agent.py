"""Deterministic offline judge. Physical claims come only from dossier facts."""
from __future__ import annotations

import re

from ..city import City
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
        text = f"My dossier records {fact['key']}: {fact['say_as']}. {text}"
    text = (dossier.get('persona') or {}).get('intro_line') or text
    return {'text': text, 'audio_url': dossier.get('intro_audio_url'),
            'mood': (dossier.get('persona') or {}).get('mood_baseline', 'hopeful')}


def challenge(pitch: Pitch, dossier: dict) -> Challenge:
    fact = grounding_fact(dossier)
    line = (f"My dossier records {fact['key']}: {fact['say_as']}. How does your idea fit?"
            if fact else 'How will you handle the details my dossier does not verify?')
    return Challenge(player_id=pitch.player_id, line=line, fact_ids=[fact['id']] if fact else [],
                     counteroffer=f"Show me this in your plan: {desire(dossier)}", category_guess=classify_use(pitch.text))


def verdict(pitches: list[Pitch], dossier: dict, city: City) -> VerdictProposal:
    if not pitches:
        raise ValueError('Cannot judge an empty round.')
    fact = grounding_fact(dossier)
    scores = [ProposalScore(player_id=p.player_id, data_fit=7 if fact else 5,
        neighborhood_fit=5 + 2 * desire_met(p.text, dossier),
        creativity=min(9, 3 + len(set(p.text.casefold().split())) // 3),
        charm=5 + int(len(p.text.split()) >= 6)) for p in pitches]
    winner = max(zip(pitches, scores), key=lambda pair: (
        sum((pair[1].data_fit, pair[1].neighborhood_fit, pair[1].creativity, pair[1].charm)),
        pair[1].creativity, -pair[0].at.timestamp()))[0]
    return VerdictProposal(winner_player_id=winner.player_id, scores=scores,
        reason_line="I'm in. Let's give this idea a home.", fact_ids=[fact['id']] if fact else [],
        category=classify_use(winner.text), desire_met=desire_met(winner.text, dossier), desire_reveal=desire(dossier))
