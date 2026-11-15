"""Deterministic, grounded personas for every playable building (no model calls)."""
import json
import re
from pathlib import Path

import pytest

from app.agent import fake_agent
from app.agent.persona import era_voice, fiction_text, validate_persona
from app.data.provider import provider_for_mode

ROOT = Path(__file__).resolve().parents[1]
DOSSIERS = ROOT / 'fixtures/dossiers'
PERSONAS = ROOT / 'fixtures/personas'
GENERATED = ['233899', '233905', '233918', '233928', '233935', '519027']
ALL = ['233953'] + GENERATED
GENERIC = "Bring me an idea. Let's make a deal."


def dossier(bid: str) -> dict:
    return json.loads((DOSSIERS / f'{bid}.json').read_text())


def persona(bid: str) -> dict:
    return json.loads((PERSONAS / f'{bid}.json').read_text())


@pytest.mark.parametrize('bid', ALL)
def test_every_committed_persona_validates_against_its_dossier(bid):
    validate_persona(persona(bid), dossier(bid))


@pytest.mark.parametrize('bid', GENERATED)
def test_generator_is_deterministic_and_matches_committed_file(bid):
    from app.agent.persona_gen import generate_persona
    assert generate_persona(dossier(bid)).model_dump() == persona(bid)
    assert generate_persona(dossier(bid)).model_dump() == generate_persona(dossier(bid)).model_dump()


@pytest.mark.parametrize('bid', GENERATED)
def test_generated_persona_shape(bid):
    d, p = dossier(bid), persona(bid)
    facts = {f['id']: f for f in d['facts']}
    assert p['voice_style'].startswith(era_voice(d))
    intro = next(b for b in p['backstory'] if b['text'] == p['intro_line'])
    assert intro['fiction'] is False and intro['fact_ref'] in facts
    value = facts[intro['fact_ref']]['value']
    assert f'{value:,.0f}' in p['intro_line'] or str(int(value)) in p['intro_line']
    assert p['intro_line'] != GENERIC and GENERIC not in p['intro_line']
    assert len(p['hard_limits']) >= 2
    assert set(p['neighbor_lines']) <= set(d['neighbors'])
    assert len([b for b in p['backstory'] if b['fiction']]) >= 2
    assert all(fiction_text(b['text'], (d['name'],)) for b in p['backstory'] if b['fiction'])


def test_intro_lines_and_catchphrases_are_distinct():
    intros = [persona(b)['intro_line'] for b in ALL]
    catchphrases = [persona(b)['catchphrase'] for b in ALL]
    assert len(set(intros)) == len(ALL)
    assert len(set(catchphrases)) == len(ALL)


@pytest.mark.parametrize('mode', ['fixtures', 'kit'])
def test_fake_agent_intro_differs_per_building(mode):
    provider = provider_for_mode(mode)
    if mode == 'kit' and not provider.index.is_file():
        pytest.skip('Real CoStar index absent')
    texts = [fake_agent.intro(provider.dossier(b))['text'] for b in ALL]
    assert len(set(texts)) == len(ALL)
    assert GENERIC not in texts


@pytest.mark.parametrize('bid', ALL)
def test_no_persona_text_says_vacant_or_names_contacts(bid):
    text = json.dumps(persona(bid))
    assert not re.search(r'vacan', text, re.I)
    assert 'contacts' not in dossier(bid)  # contacts never reach a fixture, so nothing to leak


def test_unknown_building_still_gets_a_distinct_generated_fallback():
    from app.agent.prompts import persona_for
    d = dossier('233905')
    assert persona_for(d)['intro_line'] == persona('233905')['intro_line']


def test_every_era_line_is_pure_fiction():
    from app.agent.persona import fiction_claim
    from app.agent.persona_gen import CLASS_LINES, ERAS, HOOKS
    for era, kit in ERAS.items():
        assert len(kit['tails']) == len(kit['catchphrases']) == len(HOOKS)
        assert len(set(kit['catchphrases'])) == len(HOOKS)
        for line in kit['tails'] + kit['catchphrases'] + kit['neighbors']:
            assert fiction_claim(line) is None, (era, line)
    assert all(fiction_claim(line) is None for line in CLASS_LINES.values())
