"""Deterministic persona grounding: prose is source text or explicit game fiction."""
from __future__ import annotations

import re

from ..models import Persona

DESIRES = {
    'public_ground_floor': 'A shared ground floor open to everyone.',
    'people_living_here': 'People making a home here.',
    'night_life': 'To be lit up and busy at night.',
    'feed_the_block': 'Food and markets for the block.',
    'make_things': 'Studios, makers and labs.',
    'be_famous_again': 'To be a place people dream of visiting.',
}
DESIRE_REASONS = {
    'public_ground_floor': 'A fictional wish for shared access, inspired by measured ground-floor space.',
    'people_living_here': 'A fictional wish for company, inspired by dark space awaiting a new game use.',
    'night_life': 'A fictional wish to shine at night, inspired by dark space awaiting a new game use.',
    'feed_the_block': 'A fictional wish to welcome the block, inspired by measured ground-floor space.',
    'make_things': 'A fictional wish for creative work, inspired by measured typical-floor space.',
    'be_famous_again': 'A fictional wish for attention, inspired by measured height; no past fame is claimed.',
}


def desire_support(dossier: dict) -> dict[str, list[str]]:
    support = {key: [] for key in DESIRES}
    dark_ids = {ref for floor in dossier.get('floors', []) if floor['source_status'] == 'dark' for ref in floor['fact_ids']}
    for fact in dossier['facts']:
        value, key, ref = fact.get('value'), fact['key'], fact['id']
        if fact.get('kind') != 'verified' or type(value) not in (int, float) or value <= 0:
            continue
        if key in {'floor_1_size_sqft', 'floor_1_available_sqft'}:
            for desire in ('public_ground_floor', 'feed_the_block'):
                support[desire].append(ref)
        if key in {'dark_floor_count', 'dark_sqft'} or (ref in dark_ids and key.endswith('_available_sqft')):
            for desire in ('people_living_here', 'night_life'):
                support[desire].append(ref)
        if key == 'grossTypicalFloorSquareFeet':
            support['make_things'].append(ref)
        if key in {'buildingHeightInFeet', 'numStoriesAboveGrade'}:
            support['be_famous_again'].append(ref)
    return support


FICTION = [
    "Bring me an idea. Let's make a deal.",
    "I have pride to spare and a little hope left.",
    "I miss being somebody's favorite place.",
    "I am ready for a little drama and a lot of imagination.",
    "Make me feel like myself again.",
    "Give me a reason to believe in your idea.",
    "I want a future worth staying up for.",
    "I pretend not to care, but I am rooting for you.",
    "Look at you stealing the spotlight. I approve.",
    "Save some applause for me.",
    "That is the kind of ambition I like.",
    "I suppose I can share the attention.",
    "I am proud of you. Keep that between us.",
    "Now we are talking.",
    "You have my attention. Make it count.",
]
VOICES = ['proud and warm', 'dry and theatrical', 'anxious and hopeful', 'gruff but affectionate']
SOUNDS = ['warm piano', 'low brass', 'bright strings', 'soft marimba']


# This is an acting brief inspired by completion era, never an architecture claim.
ERA_VOICES = [
    (1945, 'old-Houston art-deco pride'),
    (1969, 'midcentury dry wit'),
    (1979, 'brutalist gruff affection'),
    (1999, 'boomtime boardroom swagger'),
    (9999, 'insecure glass ambition'),
]


def era_voice(dossier: dict) -> str:
    year = next((f['value'] for f in dossier['facts'] if f['key'] == 'construction_ConstructionComplete'), None)
    if type(year) not in (int, float):
        return 'hopeful investor'
    return next(voice for end, voice in ERA_VOICES if year <= end)


def fact_clauses(fact: dict) -> list[str]:
    value, key = fact.get('value'), fact.get('key', '')
    if value is None or not fact.get('say_as'):
        return []
    n = f'{value:,.0f}' if type(value) in (int, float) and float(value).is_integer() else str(value)
    if key.startswith('construction_'):
        n = str(int(value))
    clauses = {
        'buildingName': [f'My name is {value}.'],
        'numStoriesAboveGrade': [f'I rise {n} stories.', f'{n} stories, darling.'],
        'buildingHeightInFeet': [f'I stand {n} feet tall.'],
        'rentableBuildingAreaSquareFeet': [f'I have {n} rentable square feet.'],
        'grossTypicalFloorSquareFeet': [f'My typical floor gives you {n} square feet.'],
        'parkingRatio': [f'My parking ratio is {n} spaces per thousand square feet.'],
        'construction_ConstructionComplete': [f'Completed in {n}.', f'I made my entrance in {n}.'],
        'construction_RenovationFinished': [f'A renovation finished in {n}.'],
        'construction_CommonAreaRenovated': [f'My common areas were renovated in {n}.'],
        'dark_floor_count': [f'{n} dark floors, darling.', f'I have {n} dark floors.'],
        'dark_sqft': [f'{n} square feet across my dark floors await your pitch.'],
        'tenant_records': [f'My tenancy history has {n} entries.'],
        'current_tenants': [f'My current tenancy tally is {n} entries.'],
        'former_tenancy_records': [f'{n} former tenancy entries; I still want a plot twist.'],
    }
    if key in clauses:
        return clauses[key]
    if re.fullmatch(r'top_former_industry_[1-3]', key) and isinstance(value, str):
        return [f"I've known the {value} crowd."]
    floor = re.fullmatch(r'floor_(-?\d+)_(size|available|occupied)_sqft', key)
    if floor:
        area = {'size': 'total', 'available': 'listed available', 'occupied': 'recorded occupied'}[floor[2]]
        return [f'Floor {floor[1]} has {n} {area} square feet.']
    if fact.get('source') == 'vexcel+vision' and type(value) is int and value > 0:
        wording = fact['say_as'].replace(', ', ', it looks like ', 1)
        return [wording[0].upper() + wording[1:] + '.']
    return []


def fact_line(fact: dict) -> str | None:
    clauses = fact_clauses(fact)
    return clauses[0] if clauses else None


# Fiction can be recomposed freely from emotional/investor vocabulary, without
# physical/history nouns, proper names, numbers or facts smuggled in as feelings.
FICTION += [
    'Darling, make your ambition worth my time.',
    'I invest in nerve, not polite applause.',
    'Bring me a plot twist and we might have a deal.',
    'Sweetheart, charm gets my attention; conviction gets my yes.',
    'My pride is expensive; your imagination had better be priceless.',
    'I want bustle, not another timid pitch.',
    'Pitch like you mean it, kid; I am listening.',
    'I can smell a timid idea; give me a bold deal.',
    'Your ambition is adorable; now earn my respect.',
    'The spotlight suits you, sweetheart; save me some applause.',
]
FICTION_WORDS = set(re.findall(r"[a-z]+(?:'[a-z]+)?", ' '.join(FICTION).casefold())) | set(
    'darling sweetheart kid honey ambition ambitious bold bolder boldest nerve conviction deal deals '
    'invest investor sell sold yes no maybe earn earned respect taste drama theatrical dry warm '
    'proud hopeful anxious gruff affectionate lonely bitter please promise promises timid '
    'brave patience stubborn sentimental generous splendid delicious dazzling priceless expensive '
    'myself yourself ourselves dream dreams dreaming future tomorrow tonight care caring listen '
    'listening show tell ask asking answer counteroffer bargain bargaining worthy worth because '
    'with without if then when while all any each every never always still yet so but for as '
    'into about after before over under around through together again more less enough very '
    'quite too just really truly certainly surely only own would could should will shall must '
    "can can't won't don't isn't aren't wasn't weren't i'm i've i'll i'd you're you've you'll "
    "that's let's it's there's here's who's what where why how this these those them they their "
    'our us we me myself your yours its he she his her be been being was were does do did done '
    'to of and or the a an at by on in is it i you have has had get gets got make makes made '
    'take takes taken bring brings brought want wants wanted need needs needed love loved '
    'like likes liked feel feels felt see sees seen think thinks thought believe believes believed '
    'remember miss misses missed hope hopes hoped ready attention count counts counted idea ideas '
    'plan plans pitch pitches story stories imagination pretend pretends pretending rooting '
    'time moment money risk rewards reward stakes flourish flourish'.split())
DENY = re.compile(r'\b(?:vacant|dossier|database|records show|property type|source_field)\b', re.I)


def fiction_text(text: str) -> bool:
    words = re.findall(r"[a-z]+(?:'[a-z]+)?", text.casefold())
    return (bool(words) and len(text) <= 240 and not re.search(r'\d', text)
            and not DENY.search(text) and set(words) <= FICTION_WORDS
            and len(re.findall(r'[.!?](?:\s|$)', text)) <= 2)


def validate_beat(beat: dict, facts: dict) -> None:
    text, ref = beat.get('text'), beat.get('fact_ref')
    if not isinstance(text, str) or DENY.search(text) or len(text) > 300:
        raise ValueError('Unsupported spoken prose')
    if ref is None:
        if beat.get('fiction') is not True or not fiction_text(text):
            raise ValueError('Fiction contains a physical or historical claim')
        return
    if not isinstance(ref, str) or ref not in facts or beat.get('fiction') is not False:
        raise ValueError('Unresolved fact_ref or ambiguous fiction marker')
    fact = facts[ref]
    for clause in fact_clauses(fact):
        if not text.startswith(clause):
            continue
        remainder = text[len(clause):].strip()
        # Only quantities/date components in this cited claim may appear.
        allowed = set(re.findall(r'\d+(?:\.\d+)?', clause.replace(',', '')))
        spoken = set(re.findall(r'\d+(?:\.\d+)?', text.replace(',', '')))
        if spoken <= allowed and (not remainder or fiction_text(remainder)):
            if len(re.findall(r'[.!?](?:\s|$)', text)) <= 2:
                return
    raise ValueError('Physical or historical claim differs from referenced fact')


EMPTY_LIMITS = 'Fewer than two verified physical quantities are available; ask for details instead.'


def physical_limits(dossier: dict) -> list[dict]:
    """Game pitch bounds only: no inferred engineering, zoning or legal limits."""
    result = []
    dark = {f['number'] for f in dossier.get('floors', []) if f['source_status'] == 'dark'}
    for fact in dossier['facts']:
        value, key = fact.get('value'), fact['key']
        if fact.get('kind') != 'verified' or type(value) not in (int, float) or value <= 0:
            continue
        n = f'{value:,.0f}'
        floor = re.fullmatch(r'floor_(-?\d+)_available_sqft', key)
        if key == 'grossTypicalFloorSquareFeet':
            constraint, text = 'floor_plate', f'For a typical single-floor pitch, fit within {n} square feet; show me your area budget.'
        elif floor and int(floor[1]) in dark:
            constraint, text = 'dark_area', f'For floor {floor[1]}, fit your pitch within {n} listed available square feet; show me what fits.'
        elif key == 'buildingHeightInFeet':
            constraint, text = 'height', f'My height is {n} feet; a pitch requiring a taller existing building needs a different plan.'
        elif key == 'parkingRatio':
            constraint, text = 'parking', f'My parking ratio is {value}; if your pitch needs more, explain how you will handle it.'
        else:
            continue
        result.append(dict(fact_ref=fact['id'], constraint=constraint,
                           rejects_categories=['housing', 'food_retail', 'entertainment', 'community', 'culture', 'health', 'work', 'wildcard'], text=text))
    return sorted(result, key=lambda limit: ['floor_plate', 'dark_area', 'height', 'parking'].index(limit['constraint']))


def validate_persona(value: dict, dossier: dict) -> Persona:
    persona = Persona.model_validate(value)
    facts = {f['id']: f for f in dossier['facts']
             if not (f.get('source') == 'vexcel+vision' and (not isinstance(f.get('value'), (int, float)) or f['value'] <= 0))}
    if persona.building_id != dossier['id'] or persona.name != dossier['name']:
        raise ValueError('Persona identity differs from source')
    if re.search(r'\bvacant\b', str(value), re.I):
        raise ValueError('Forbidden floor-status wording')
    if persona.desire_key not in DESIRES or persona.desire_text != DESIRES[persona.desire_key]:
        raise ValueError('Desire must use a fixed key and fictional text')
    support = desire_support(dossier)[persona.desire_key]
    if (not persona.desire_reason_fact_ids or len(set(persona.desire_reason_fact_ids)) != len(persona.desire_reason_fact_ids)
            or not set(persona.desire_reason_fact_ids) <= set(support)
            or persona.desire_reason != DESIRE_REASONS[persona.desire_key]):
        raise ValueError('Desire requires relevant supporting facts and a fictional rationale')
    if (not persona.voice_style.startswith(era_voice(dossier)) or len(persona.voice_style.split()) > 12
            or persona.signature_sound not in SOUNDS or persona.voice_id != ''):
        raise ValueError('Use a fictional voice and sound; voice_id is empty without a configured voice')
    supported = {line for f in facts.values() if f.get('kind') == 'verified' and (line := fact_line(f))}
    candidates = physical_limits(dossier)
    if len(candidates) >= 2:
        if len(persona.hard_limits) < 2 or persona.hard_limits_empty_reason is not None:
            raise ValueError('At least two physical constraints are required')
    elif persona.hard_limits or persona.hard_limits_empty_reason != EMPTY_LIMITS:
        raise ValueError('Insufficient physical facts must have explicitly empty limits and a reason')
    limits = [limit.model_dump() for limit in persona.hard_limits]
    if len({limit['fact_ref'] for limit in limits}) != len(limits):
        raise ValueError('Physical limits must cite distinct facts')
    if any(limit not in candidates for limit in limits):
        raise ValueError('Hard limits must be validated physical pitch constraints')
    if not persona.backstory:
        raise ValueError('Backstory is required')
    for beat in persona.backstory:
        validate_beat(beat, facts)
    if not fiction_text(persona.catchphrase):
        raise ValueError('Catchphrase must be fictional')
    if len(persona.neighbor_lines) != 3 or not set(persona.neighbor_lines) <= set(dossier['neighbors']):
        raise ValueError('Exactly three known neighbors are required')
    if any(not fiction_text(line) for line in persona.neighbor_lines.values()):
        raise ValueError('Neighbor reactions must be fictional')
    # Every factual intro is already a cited, validated beat. Other intros are fiction.
    if not fiction_text(persona.intro_line) and not any(
            beat.get('fact_ref') is not None and beat['text'] == persona.intro_line for beat in persona.backstory):
        raise ValueError('Intro must be fiction or an exactly cited backstory beat')
    return persona


def fake_persona(dossier: dict) -> Persona:
    support = desire_support(dossier)
    desire_key = next((key for key, refs in support.items() if refs), None)
    if desire_key is None:
        raise ValueError('No facts support a generated desire')
    return validate_persona(dict(building_id=dossier['id'], name=dossier['name'],
        voice_style=era_voice(dossier) + ' proud and warm', voice_id='', mood_baseline='hopeful',
        desire_key=desire_key, desire_text=DESIRES[desire_key],
        desire_reason_fact_ids=support[desire_key][:1], desire_reason=DESIRE_REASONS[desire_key],
        hard_limits=physical_limits(dossier)[:2] if len(physical_limits(dossier)) >= 2 else [],
        hard_limits_empty_reason=None if len(physical_limits(dossier)) >= 2 else EMPTY_LIMITS,
        backstory=[dict(text=fact_line(f), fact_ref=f['id'], fiction=False) for f in dossier['facts']
                   if f['key'] in {'construction_ConstructionComplete', 'dark_floor_count', 'top_former_industry_1'} and fact_line(f)]
                  + [dict(text=FICTION[1], fact_ref=None, fiction=True)],
        catchphrase=FICTION[0], intro_line=FICTION[0], signature_sound=SOUNDS[0],
        neighbor_lines={pid: FICTION[8+i] for i, pid in enumerate(dossier['neighbors'][:3])}), dossier)


def writer_instructions(dossier: dict) -> str:
    import json
    # All factual candidates already have IDs and deterministic wording.
    lines = {f['id']: fact_line(f) for f in dossier['facts'] if fact_line(f)}
    return json.dumps(dict(schema=Persona.model_json_schema(), building_id=dossier['id'],
        desire_support=desire_support(dossier), desire_reasons=DESIRE_REASONS,
        name=dossier['name'], neighbors=dossier['neighbors'], factual_lines=lines, factual_clauses={f['id']: fact_clauses(f) for f in dossier['facts'] if fact_clauses(f)},
        era_brief=era_voice(dossier), fiction_vocabulary=sorted(FICTION_WORDS),
        physical_constraints=physical_limits(dossier), hard_limits_empty_reason=EMPTY_LIMITS,
        fictional_lines=FICTION, desire_text_by_key=DESIRES, voice_style_prefix=era_voice(dossier), signature_sounds=SOUNDS))


def normalize_writer_persona(value: dict, dossier: dict) -> dict:
    """Extract supported semantic clauses; discarded prose never becomes a fact.

    This is not validation relaxation: the resulting candidate still passes the
    strict validator and the researched-ID gate before anything is published.
    """
    import copy
    result = copy.deepcopy(value)
    facts = {fact['id']: fact for fact in dossier['facts']}
    clauses = [(ref, clause) for ref, fact in facts.items() for clause in fact_clauses(fact)]
    beats = []
    for beat in value.get('backstory', []):
        if not isinstance(beat.get('text'), str):
            continue
        for sentence in re.split(r'(?<=[.!?])\s+', beat['text']):
            matches = [(ref, clause) for ref, clause in clauses if sentence.startswith(clause)]
            # Keep a valid original citation where possible; otherwise assign the exact supported clause.
            matches.sort(key=lambda pair: pair[0] != beat.get('fact_ref'))
            if matches:
                ref, clause = matches[0]
                candidate = dict(text=sentence, fact_ref=ref, fiction=False)
                try:
                    validate_beat(candidate, facts)
                except ValueError:
                    candidate['text'] = clause
                beats.append(candidate)
            elif fiction_text(sentence):
                beats.append(dict(text=sentence, fact_ref=None, fiction=True))
    factual = [beat for beat in beats if beat['fact_ref'] is not None]
    if len(factual) < 3:
        raise ValueError('Writer supplied fewer than three supportable factual beats')
    if not fiction_text(result.get('catchphrase', '')):
        raise ValueError('Writer catchphrase contains unsupported prose')
    first = factual[0]
    clause = next(clause for clause in fact_clauses(facts[first['fact_ref']]) if first['text'].startswith(clause))
    invitation = re.split(r'(?<=[.!?])\s+', result['catchphrase'])[0]
    intro = dict(text=f"{clause} {invitation}", fact_ref=first['fact_ref'], fiction=False)
    validate_beat(intro, facts)
    result['intro_line'] = intro['text']
    result['backstory'] = [intro] + [beat for beat in beats if beat is not first]
    neighbors = {pid: line for pid, line in result.get('neighbor_lines', {}).items()
                 if pid in dossier['neighbors'] and isinstance(line, str) and fiction_text(line)}
    for i, pid in enumerate(dossier['neighbors']):
        if len(neighbors) >= 3:
            break
        neighbors.setdefault(pid, FICTION[8 + i % 3])
    result['neighbor_lines'] = dict(list(neighbors.items())[:3])
    return validate_persona(result, dossier).model_dump()
