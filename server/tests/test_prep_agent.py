"""Offline prep acceptance checks; source values come from committed dossiers."""
import copy
import json
from pathlib import Path

import pytest

from app.agent.spend import SpendLedger, SpendUnavailable
from app.agent.tools import BuildingTools

PID = '233953'
MODEL = 'us.anthropic.claude-sonnet-4-6'


def test_spend_records_usage_persists_and_blocks(tmp_path):
    path = tmp_path / 'spend.json'
    ledger = SpendLedger(path, cap=0.001)
    assert ledger.call(MODEL, 10, 10, lambda: {'input_tokens': 10, 'output_tokens': 10}, lambda r: r)
    assert SpendLedger(path).snapshot()['input_tokens'] == 10
    assert ledger.snapshot()['total_usd'] == pytest.approx(0.000198)
    with pytest.raises(SpendUnavailable):
        ledger.call(MODEL, 1000, 1000, lambda: pytest.fail('network at cap'), lambda r: r)
    path.write_text(json.dumps({'total_usd': 3, 'calls': [], 'input_tokens': 0, 'output_tokens': 0}))
    with pytest.raises(SpendUnavailable):
        SpendLedger(path, 3).call(MODEL, 1, 1, lambda: pytest.fail('at cap'), lambda r: r)


def test_spend_failure_keeps_reservation_and_corruption_blocks(tmp_path):
    ledger = SpendLedger(tmp_path / 'spend.json', 3)
    def fail():
        raise TimeoutError('unavailable')
    with pytest.raises(SpendUnavailable):
        ledger.call(MODEL, 100, 100, fail, lambda r: r)
    assert ledger.snapshot()['total_usd'] > 0
    ledger.path.write_text('broken')
    with pytest.raises(SpendUnavailable):
        ledger.snapshot()


@pytest.mark.parametrize('mode', ['kit', 'fixtures'])
def test_tools_only_source_allowlisted_contact_free_fields(mode):
    from app.data.provider import provider_for_mode
    tools = BuildingTools(PID, provider_for_mode(mode))
    for fn in tools.functions():
        result = json.dumps(fn())
        assert not any(word in result.casefold() for word in ['broker', 'owner', 'contact', 'phone', 'email'])
    detections = tools.vexcel_detect()
    assert all(f['value'] > 0 for f in detections['facts'])
    assert '31 cars' in detections['facts'][0]['say_as']


def test_tools_strip_unexpected_fields():
    from app.data.provider import provider_for_mode
    dossier = provider_for_mode('fixtures').dossier(PID)
    dossier['contacts'] = {'owner': 'DO_NOT_SEND'}
    dossier['facts'].append({'id': 'bad', 'key': 'owner', 'value': 'DO_NOT_SEND'})
    class Provider:
        def dossier(self, _):
            return dossier
    tools = BuildingTools(PID, Provider())
    assert 'DO_NOT_SEND' not in json.dumps([f() for f in tools.functions()])


def test_detection_facts_have_natural_grammar_and_no_negatives():
    for pid, phrase in [('233953', '31 cars'), ('233899', '2 trees')]:
        dossier = json.loads((Path('fixtures/dossiers') / f'{pid}.json').read_text())
        facts = [f for f in dossier['facts'] if f['source'] == 'vexcel+vision']
        assert all(f['value'] > 0 for f in facts)
        assert any(phrase in f['say_as'] for f in facts)
