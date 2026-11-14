"""Persona-only regeneration uses cached research and one metered writer call."""
import json
from pathlib import Path

import pytest
from langchain_core.messages import AIMessage

from app.agent.persona import fake_persona
from app.agent.tools import BuildingTools
from app.data.provider import provider_for_mode
from app.agent.spend import SpendLedger

PID = '233953'


def cached_research(path: Path):
    tools = BuildingTools(PID, provider_for_mode('fixtures'))
    path.mkdir()
    for name, source in [('facts_property.json', 'costar'), ('facts_spatial.json', 'vexcel+vision')]:
        (path / name).write_text(json.dumps({'fact_ids': [f['id'] for f in tools.facts if f['source'] == source]}))
    return {**tools.dossier, 'facts': tools.facts}


class Writer:
    model_id = 'us.anthropic.claude-sonnet-4-6'
    max_tokens = 4096
    calls = 0
    def __init__(self, dossier): self.dossier = dossier
    def get_num_tokens_from_messages(self, messages): return 1000
    def with_structured_output(self, schema): return self
    def invoke(self, messages):
        self.calls += 1
        return fake_persona(self.dossier)


def test_persona_only_reads_cached_research_and_never_rescouts(tmp_path, monkeypatch):
    from app.agent.prep_agent import regenerate_persona
    research = tmp_path / 'research'
    dossier = cached_research(research)
    writer = Writer(dossier)
    def forbidden(*a, **kw): pytest.fail('Persona-only regeneration must not scout')
    monkeypatch.setattr(BuildingTools, 'functions', forbidden)
    result = regenerate_persona(PID, research, model=writer, provider=provider_for_mode('fixtures'),
        cache=tmp_path / 'cache', personas=tmp_path / 'personas', ledger=SpendLedger(tmp_path / 'spend.json'))
    assert writer.calls == 1 and result['prep_status'] == 'ready'
    assert (tmp_path / 'personas' / f'{PID}.json').is_file()
    assert result['persona']['backstory'][1]['fact_ref'].endswith('dark_floor_count')


def test_persona_only_estimate_refuses_above_weekend_threshold(tmp_path):
    from app.agent.prep_agent import regenerate_persona
    research = tmp_path / 'research'
    writer = Writer(cached_research(research))
    ledger = SpendLedger(tmp_path / 'spend.json')
    ledger.path.write_text(json.dumps(dict(total_usd=2.89, input_tokens=0, output_tokens=0, calls=[])))
    published = tmp_path / 'personas' / f'{PID}.json'
    published.parent.mkdir(); published.write_text('old persona')
    result = regenerate_persona(PID, research, model=writer, provider=provider_for_mode('fixtures'),
        cache=tmp_path / 'cache', personas=published.parent, ledger=ledger)
    assert result['prep_status'] == 'unaffordable'
    assert writer.calls == 0 and published.read_text() == 'old persona'


def test_writer_normalization_splits_claims_and_drops_unsupported_prose(tmp_path):
    from app.agent.persona import normalize_writer_persona, validate_persona
    dossier = cached_research(tmp_path / 'research')
    value = fake_persona(dossier).model_dump()
    year = next(f for f in dossier['facts'] if f['key'] == 'construction_ConstructionComplete')
    dark = next(f for f in dossier['facts'] if f['key'] == 'dark_floor_count')
    area = next(f for f in dossier['facts'] if f['key'] == 'dark_sqft')
    value['catchphrase'] = 'Darling, bring me a plot twist and we might have a deal.'
    value['backstory'] = [dict(text=f"I made my entrance in {year['value']}. My lobby has a pool.", fact_ref=year['id'], fiction=False),
        dict(text=f"{dark['value']} dark floors, darling. {area['value']:,.0f} square feet across my dark floors await your pitch.", fact_ref=dark['id'], fiction=False)]
    value['intro_line'] = 'Unsupported claim'
    value['neighbor_lines'][dossier['neighbors'][3]] = 'Save some applause for me.'
    normalized = normalize_writer_persona(value, dossier)
    persona = validate_persona(normalized, dossier)
    assert 'pool' not in json.dumps(normalized)
    assert len(persona.neighbor_lines) == 3
    assert {year['id'], dark['id'], area['id']} <= {b['fact_ref'] for b in persona.backstory}
    assert persona.intro_line == f"I made my entrance in {year['value']}. {value['catchphrase']}"
    # The strict validator still rejects the unnormalized model proposal.
    with pytest.raises(ValueError): validate_persona(value, dossier)
