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


def fact_line(fact: dict) -> str | None:
    value, key = fact.get('value'), fact.get('key', '')
    if value is None or not isinstance(value, (str, int, float, bool)) or not fact.get('say_as'):
        return None
    number = f'{value:,.0f}' if isinstance(value, (int, float)) and float(value).is_integer() else str(value)
    labels = {
        'buildingName': f'My name is {value}.',
        'numStoriesAboveGrade': f'My dossier lists {number} stories.',
        'buildingHeightInFeet': f'My recorded height is {number} feet.',
        'rentableBuildingAreaSquareFeet': f'My dossier lists {number} rentable square feet.',
        'grossTypicalFloorSquareFeet': f'My dossier lists {number} square feet on a typical floor.',
        'parkingRatio': f'My recorded parking ratio is {number}.',
        'address': f'My dossier places me at {value}.',
        'propertyType': f'My recorded property type is {value}.',
        'buildingClass': f'My recorded building class is {value}.',
        'tenant_records': f'My dossier includes {number} tenancy records.',
        'current_tenants': f'My dossier lists {number} current tenancy records.',
        'construction_ConstructionComplete': f'My dossier records construction completed in {value}.',
        'construction_RenovationFinished': f'My dossier records a renovation finished in {value}.',
        'construction_CommonAreaRenovated': f'My dossier records common areas renovated in {value}.',
    }
    if key in labels:
        return labels[key]
    floor = re.fullmatch(r'floor_(-?\d+)_(size|available|occupied)_sqft', key)
    if floor:
        area = {'size': 'total', 'available': 'listed available', 'occupied': 'recorded occupied'}[floor[2]]
        return f'My dossier lists {number} {area} square feet for floor {floor[1]}.'
    if fact.get('source') == 'vexcel+vision':
        # Canonical estimate wording stays valid across the independent Vexcel grammar fix.
        label = key.removeprefix('vexcel_detection_').replace('_', ' ')
        if label not in {'car', 'tree', 'parking lot', 'rooftop terrace', 'solar panel'} or not isinstance(value, int) or value <= 0:
            return None
        year = re.search(r'on the (\d{4}) flyover', fact['say_as'])
        when = f'On the {year[1]} flyover' if year else 'In imagery with an unknown capture date'
        noun = label if value == 1 else label + 's'
        scope = re.search(r'within about \d+(?:\.\d+)? m of the parcel', fact['say_as'])
        qualifier = f' {scope[0]}' if scope else ''
        verb = 'was' if value == 1 else 'were'
        return f'{when}, it looks like {value} {noun} {verb} detected{qualifier}.'
    return f"My dossier records {key}: {fact['say_as']}."


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
    if persona.voice_style not in VOICES or persona.signature_sound not in SOUNDS or persona.voice_id != '':
        raise ValueError('Use a fictional voice and sound; voice_id is empty without a configured voice')
    supported = {line for f in facts.values() if f.get('kind') == 'verified' and (line := fact_line(f))}
    for line in persona.hard_limits:
        if line not in supported:
            raise ValueError('Hard limits must be exact verified fact lines, never feasibility inferences')
    if not persona.backstory:
        raise ValueError('Backstory is required')
    for beat in persona.backstory:
        ref = beat.get('fact_ref')
        if ref is not None:
            if not isinstance(ref, str) or ref not in facts or beat.get('fiction') is not False:
                raise ValueError('Unresolved fact_ref or ambiguous fiction marker')
            if beat.get('text') != fact_line(facts[ref]):
                raise ValueError('Physical or historical claim differs from referenced fact')
        elif beat.get('fiction') is not True or beat.get('text') not in FICTION:
            raise ValueError('Fiction must be an approved emotional line without physical claims')
    if persona.catchphrase not in FICTION:
        raise ValueError('Catchphrase must be fictional')
    if len(persona.neighbor_lines) != 3 or not set(persona.neighbor_lines) <= set(dossier['neighbors']):
        raise ValueError('Exactly three known neighbors are required')
    if any(line not in FICTION for line in persona.neighbor_lines.values()):
        raise ValueError('Neighbor reactions must be fictional')
    # Intro may be one exact fact line followed by a fictional invitation, or fiction alone.
    intros = set(FICTION) | {f'{line} {fiction}' for line in supported for fiction in FICTION}
    if persona.intro_line not in intros:
        raise ValueError('Intro contains an unsupported claim')
    return persona


def fake_persona(dossier: dict) -> Persona:
    return validate_persona(dict(building_id=dossier['id'], name=dossier['name'],
        voice_style=VOICES[0], voice_id='', mood_baseline='hopeful',
        desire_key='public_ground_floor', desire_text=DESIRES['public_ground_floor'], hard_limits=[],
        backstory=[dict(text=FICTION[1], fact_ref=None, fiction=True)],
        catchphrase=FICTION[0], intro_line=FICTION[0], signature_sound=SOUNDS[0],
        neighbor_lines={pid: FICTION[8+i] for i, pid in enumerate(dossier['neighbors'][:3])}), dossier)


def writer_instructions(dossier: dict) -> str:
    import json
    # All factual candidates already have IDs and deterministic wording.
    lines = {f['id']: fact_line(f) for f in dossier['facts'] if fact_line(f)}
    return json.dumps(dict(schema=Persona.model_json_schema(), building_id=dossier['id'],
        name=dossier['name'], neighbors=dossier['neighbors'], factual_lines=lines,
        fictional_lines=FICTION, desire_text_by_key=DESIRES, voice_styles=VOICES, signature_sounds=SOUNDS))
