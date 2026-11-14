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
    assert 'within about 30 m of the parcel' in detections['facts'][0]['say_as']
    from app.agent.persona import fact_line
    assert 'within about 30 m of the parcel' in fact_line(detections['facts'][0])


def test_tools_strip_unexpected_fields():
    from app.data.provider import provider_for_mode
    dossier = provider_for_mode('fixtures').dossier(PID)
    dossier['contacts'] = {'owner': 'DO_NOT_SEND'}
    for key in ('owner', 'floor_owner', 'construction_owner'):
        dossier['facts'].append({'id': 'bad', 'key': key, 'value': 'DO_NOT_SEND'})
    class Provider:
        def dossier(self, _):
            return dossier
    tools = BuildingTools(PID, Provider())
    assert 'DO_NOT_SEND' not in json.dumps([f() for f in tools.functions()])


def test_detection_facts_have_natural_grammar_and_no_negatives():
    for pid, phrase in [('233953', '31 cars'), ('233899', '2 trees')]:
        from app.data.provider import provider_for_mode
        facts = BuildingTools(pid, provider_for_mode('fixtures')).vexcel_detect()['facts']
        assert all(f['value'] > 0 for f in facts)
        assert any(phrase in f['say_as'] for f in facts)


def source_dossier():
    from app.data.provider import provider_for_mode
    tools = BuildingTools(PID, provider_for_mode('fixtures'))
    return {**tools.dossier, 'facts': tools.facts}


def test_persona_validation_rejects_bad_refs_inventions_and_disguised_fiction():
    from app.agent.persona import fake_persona, validate_persona, fact_line
    dossier = source_dossier()
    persona = fake_persona(dossier).model_dump()
    for beat in [
        dict(text='Unsupported', fact_ref='F_missing', fiction=False),
        dict(text='Unsupported', fact_ref=['F_missing'], fiction=False),
        dict(text='My lobby has a pool.', fact_ref='F_233953_numStoriesAboveGrade', fiction=False),
        dict(text='My lobby has a pool.', fact_ref=None, fiction=True),
    ]:
        bad = copy.deepcopy(persona)
        bad['backstory'] = [beat]
        with pytest.raises(ValueError):
            validate_persona(bad, dossier)
    bad = copy.deepcopy(persona)
    bad['hard_limits'] = ['Cannot support a rooftop garden.']
    with pytest.raises(ValueError):
        validate_persona(bad, dossier)
    fact = next(f for f in dossier['facts'] if f['key'] == 'numStoriesAboveGrade')
    persona['backstory'] = [dict(text=fact_line(fact), fact_ref=fact['id'], fiction=False)]
    assert validate_persona(persona, dossier).backstory[0]['fact_ref'] == fact['id']


def scripted_model(dossier):
    """A fake chat model that actually exercises deepagents delegation and filesystem tools."""
    from langchain_core.language_models.chat_models import BaseChatModel
    from langchain_core.messages import AIMessage, ToolMessage
    from langchain_core.outputs import ChatGeneration, ChatResult
    from pydantic import PrivateAttr
    from app.agent.persona import fake_persona, fact_line
    class ScriptedChat(BaseChatModel):
        _calls: int = PrivateAttr(default=0)
        @property
        def _llm_type(self):
            return 'offline-prep-test'
        def bind_tools(self, tools, **kwargs):
            return self
        def _generate(self, messages, stop=None, run_manager=None, **kwargs):
            self._calls += 1
            system = str(messages[0].content)
            completed = [m.name for m in messages if isinstance(m, ToolMessage)]
            def call(name, args):
                return ChatResult(generations=[ChatGeneration(message=AIMessage(content='',
                    tool_calls=[dict(name=name, args=args, id=f'fake_{self._calls}')]))])
            if 'Call all four kit tools' in system:
                for name in ['kit_get_building', 'kit_get_floor_status', 'kit_get_tenant_history', 'kit_get_matterport_models']:
                    if name not in completed:
                        return call(name, {})
                if 'write_file' not in completed:
                    ids = [f['id'] for f in dossier['facts'] if f['source'] != 'vexcel+vision']
                    return call('write_file', {'file_path': '/facts_property.json', 'content': json.dumps({'fact_ids': ids})})
            elif 'Call all four spatial tools' in system:
                for name in ['vexcel_property', 'vexcel_imagery', 'vexcel_detect', 'matterport_get_model']:
                    if name not in completed:
                        return call(name, {})
                if 'write_file' not in completed:
                    ids = [f['id'] for f in dossier['facts'] if f['source'] == 'vexcel+vision']
                    return call('write_file', {'file_path': '/facts_spatial.json', 'content': json.dumps({'fact_ids': ids})})
            elif 'Read both facts files' in system:
                reads = sum(name == 'read_file' for name in completed)
                if reads < 2:
                    return call('read_file', {'file_path': ['/facts_property.json', '/facts_spatial.json'][reads]})
                if 'write_file' not in completed:
                    value = fake_persona(dossier).model_dump()
                    fact = next(f for f in dossier['facts'] if f['key'] == 'numStoriesAboveGrade')
                    value['backstory'].append(dict(text=fact_line(fact), fact_ref=fact['id'], fiction=False))
                    return call('write_file', {'file_path': '/persona.json', 'content': json.dumps(value)})
            else:
                if 'write_todos' not in completed:
                    return call('write_todos', {'todos': [{'content': 'Research and write persona', 'status': 'in_progress'}]})
                tasks = sum(name == 'task' for name in completed)
                if tasks < 3:
                    return call('task', {'subagent_type': ['property_scout', 'spatial_scout', 'persona_writer'][tasks],
                                         'description': 'Research and write your assigned file.'})
            return ChatResult(generations=[ChatGeneration(message=AIMessage(content='Done.'))])
    return ScriptedChat()


@pytest.mark.parametrize('mode', ['kit', 'fixtures'])
def test_prep_deepagent_uses_three_subagents_and_is_idempotent(tmp_path, mode):
    from app.agent.prep_agent import prep_building
    from app.data.provider import provider_for_mode
    provider = provider_for_mode(mode)
    dossier = source_dossier()
    model = scripted_model(dossier)
    events = []
    kwargs = dict(provider=provider, model=model, cache=tmp_path / 'cache', personas=tmp_path / 'personas', emit=events.append)
    result = prep_building(PID, **kwargs)
    calls = model._calls
    assert result['persona']['building_id'] == PID
    assert result['intro_audio_url'] is None
    assert len(result['persona']['neighbor_lines']) == 3
    assert {'property_scout', 'spatial_scout', 'persona_writer'} <= {e['step'] for e in events}
    assert all(set(e) == {'step', 'tool', 'summary', 'duration_ms'} for e in events)
    assert prep_building(PID, **kwargs) == result
    assert model._calls == calls
    assert (tmp_path / f'personas/{PID}.json').is_file()
    assert prep_building(PID, force=True, **kwargs) == result
    assert model._calls > calls


def test_tts_silent_without_credentials(monkeypatch):
    from app.voice.tts import render_intro
    monkeypatch.delenv('ELEVENLABS_API_KEY', raising=False)
    assert render_intro({'intro_line': 'Fictional game invitation.'}) is None


def test_tts_error_is_silent_and_does_not_log_key(monkeypatch, caplog):
    import httpx
    from app.voice.tts import render_intro
    monkeypatch.setenv('ELEVENLABS_API_KEY', 'never-log-this-secret')
    monkeypatch.setenv('ELEVENLABS_VOICE_ID', 'testvoice')
    http = httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(503)))
    assert render_intro({'intro_line': 'Fictional game invitation.'}, client=http) is None
    assert 'never-log-this-secret' not in caplog.text


def test_persona_intro_keeps_analyst_and_fake_fallback():
    from app.agent import fake_agent
    from app.agent.persona import fake_persona
    dossier = source_dossier()
    fallback = fake_agent.intro(dossier)
    dossier['persona'] = fake_persona(dossier).model_dump()
    assert fake_agent.intro(dossier)['text'] == dossier['persona']['intro_line']
    assert fallback['text']


def test_prep_retries_once_then_fails_without_publishing(tmp_path, monkeypatch):
    from app.agent import prep_agent
    from app.data.provider import provider_for_mode
    class InvalidGraph:
        calls = 0
        def invoke(self, *args, **kwargs):
            self.calls += 1
    graph = InvalidGraph()
    monkeypatch.setattr(prep_agent, 'build_agent', lambda *args: graph)
    with pytest.raises(ValueError, match='after one retry'):
        prep_agent.prep_building(PID, provider=provider_for_mode('fixtures'),
            cache=tmp_path / 'cache', personas=tmp_path / 'personas')
    assert graph.calls == 2
    assert not (tmp_path / f'personas/{PID}.json').exists()


def test_prep_spend_fallback_leaves_published_persona_untouched(tmp_path, monkeypatch):
    from app.agent import prep_agent
    from app.data.provider import provider_for_mode
    path = tmp_path / f'personas/{PID}.json'
    path.parent.mkdir()
    path.write_text('old-persona')
    class UnavailableGraph:
        def invoke(self, *args, **kwargs):
            raise SpendUnavailable('budget')
    monkeypatch.setattr(prep_agent, 'build_agent', lambda *args: UnavailableGraph())
    result = prep_agent.prep_building(PID, force=True, provider=provider_for_mode('fixtures'),
        cache=tmp_path / 'cache', personas=tmp_path / 'personas')
    assert result['prep_status'] == 'unavailable'
    assert path.read_text() == 'old-persona'


def test_prep_http_routes_are_cached_and_unknown_ids_do_not_invoke(monkeypatch, tmp_path):
    from fastapi.testclient import TestClient
    from app.main import app
    from app.agent import prep_agent
    from app.agent.persona import fake_persona
    monkeypatch.setenv('STATE_DIR', str(tmp_path))
    monkeypatch.setenv('DATA_MODE', 'fixtures')
    monkeypatch.setenv('HOST_PIN', 'test-host')
    calls = []
    def prepare(pid, force, **kwargs):
        calls.append((pid, force))
        kwargs['emit'](dict(step='persona_writer', tool='write_file', summary='Persona prepared', duration_ms=1))
        dossier = source_dossier()
        return {**dossier, 'persona': fake_persona(dossier).model_dump(), 'prep_status': 'ready'}
    monkeypatch.setattr(prep_agent, 'prep_building', prepare)
    with TestClient(app) as client:
        assert client.post('/api/buildings/999999999/prep').status_code == 404
        assert calls == []
        room = client.post('/api/rooms').json()['room']
        with client.websocket_connect(f'/ws/{room}?role=screen') as ws:
            assert ws.receive_json()['type'] == 'room_state'
            assert client.post(f'/api/buildings/{PID}/prep?force=true', headers={'X-Host-Pin': 'test-host'}).status_code == 200
            event = ws.receive_json()
            assert event == dict(type='agent_step', step='persona_writer', tool='write_file',
                                 summary='Persona prepared', duration_ms=1)
        assert calls == [(PID, True)]


def test_metered_model_counts_tool_bound_and_async_calls(tmp_path):
    from app.agent.spend import CappedBedrockConverse
    class Client:
        calls = 0
        def converse(self, **kwargs):
            self.calls += 1
            return dict(output={'message': {'role': 'assistant', 'content': [{'text': 'Ready.'}]}},
                stopReason='end_turn', usage={'inputTokens': 10, 'outputTokens': 2, 'totalTokens': 12}, metrics={'latencyMs': 1})
    client = Client()
    model = CappedBedrockConverse(client=client, model_id=MODEL, region_name='us-east-1',
        max_tokens=32, disable_streaming=True, spend_path=tmp_path / 'spend.json')
    def evidence() -> str:
        """Return source evidence."""
        return 'available'
    model.bind_tools([evidence]).invoke('Research this building.')
    import asyncio
    asyncio.run(model.ainvoke('Research this building.'))
    assert client.calls == 2
    assert SpendLedger(tmp_path / 'spend.json').snapshot()['input_tokens'] == 20


@pytest.mark.parametrize('mode', ['kit', 'fixtures'])
def test_committed_hero_persona_is_valid_and_served(mode, monkeypatch):
    from fastapi.testclient import TestClient
    from app.main import app
    from app.data.provider import provider_for_mode
    from app.agent.persona import validate_persona
    monkeypatch.setenv('DATA_MODE', mode)
    dossier = provider_for_mode(mode).dossier(PID)
    if not (Path('fixtures/personas') / f'{PID}.json').is_file():
        pytest.skip('Real hero prep has not run yet')
    persona = validate_persona(dossier['persona'], dossier).model_dump()
    assert all(beat['fiction'] or beat['fact_ref'] in {f['id'] for f in dossier['facts']} for beat in persona['backstory'])
    with TestClient(app) as client:
        assert client.get(f'/api/buildings/{PID}/persona').json() == persona
        assert client.get('/api/buildings/999999999/persona').status_code == 404


def test_spend_symlink_shares_accounting_without_replacing_link(tmp_path):
    shared = tmp_path / 'shared.json'
    link = tmp_path / 'worktree.json'
    link.symlink_to(shared)
    ledger = SpendLedger(link, 3)
    ledger.call(MODEL, 10, 10, lambda: {'input_tokens': 10, 'output_tokens': 10}, lambda r: r)
    assert link.is_symlink()
    assert SpendLedger(shared).snapshot() == ledger.snapshot()


def test_concurrent_spend_requests_share_one_cap(tmp_path):
    from concurrent.futures import ThreadPoolExecutor
    path = tmp_path / 'spend.json'
    calls = []
    def request(_):
        def invoke():
            calls.append(True)
            return {'input_tokens': 10, 'output_tokens': 10}
        try:
            SpendLedger(path, 0.0003).call(MODEL, 10, 10, invoke, lambda r: r)
            return True
        except SpendUnavailable:
            return False
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(request, range(2))) == [False, True]
    assert len(calls) == 1
    assert SpendLedger(path).snapshot()['total_usd'] <= 0.0003


def test_failed_model_cannot_poison_trusted_cache(tmp_path, monkeypatch):
    from app.agent import prep_agent
    from app.data.provider import provider_for_mode
    from deepagents.backends import FilesystemBackend
    roots = []
    def graph(tools, directory, model):
        roots.append(directory)
        backend = FilesystemBackend(root_dir=directory, virtual_mode=True)
        class Failed:
            def invoke(self, *args, **kwargs):
                poisoned = {**tools.dossier, 'facts': tools.facts, 'stories': 999}
                from app.agent.persona import fake_persona
                poisoned['persona'] = fake_persona(poisoned).model_dump()
                backend.write('/dossier.json', json.dumps(poisoned))
                raise SpendUnavailable('failed run')
        return Failed()
    monkeypatch.setattr(prep_agent, 'build_agent', graph)
    kwargs = dict(provider=provider_for_mode('fixtures'), cache=tmp_path / 'cache', personas=tmp_path / 'personas')
    assert prep_agent.prep_building(PID, **kwargs)['prep_status'] == 'unavailable'
    assert prep_agent.prep_building(PID, **kwargs).get('prep_status') == 'unavailable'
    assert roots == [tmp_path / 'cache' / PID / 'work'] * 2
    assert not (tmp_path / 'cache' / PID / 'dossier.json').exists()


def test_cache_rejects_modified_source_facts(tmp_path):
    from app.agent.prep_agent import prep_building
    from app.data.provider import provider_for_mode
    provider = provider_for_mode('fixtures')
    kwargs = dict(provider=provider, cache=tmp_path / 'cache', personas=tmp_path / 'personas')
    first = prep_building(PID, model=scripted_model(source_dossier()), **kwargs)
    path = tmp_path / 'cache' / PID / 'dossier.json'
    first['facts'][0]['value'] = 'forged'
    path.write_text(json.dumps(first))
    result = prep_building(PID, model=scripted_model(source_dossier()), **kwargs)
    assert result['facts'] == source_dossier()['facts']


def test_physical_limits_reject_identity_require_two_and_challenge_oversize():
    from app.agent.persona import fake_persona, validate_persona
    from app.agent.fake_agent import challenge
    from app.models import Pitch
    from datetime import datetime, timezone
    dossier = source_dossier()
    persona = fake_persona(dossier).model_dump()
    assert len(persona['hard_limits']) >= 2
    assert all(limit['constraint'] in {'floor_plate', 'dark_area', 'height', 'parking'} for limit in persona['hard_limits'])
    bad = copy.deepcopy(persona)
    bad['hard_limits'][0]['fact_ref'] = next(f['id'] for f in dossier['facts'] if f['key'] == 'buildingName')
    with pytest.raises(ValueError):
        validate_persona(bad, dossier)
    bad = copy.deepcopy(persona)
    bad['hard_limits'] = []
    with pytest.raises(ValueError):
        validate_persona(bad, dossier)
    dossier['persona'] = persona
    area = next(f['value'] for f in dossier['facts'] if f['key'] == 'grossTypicalFloorSquareFeet')
    pitch = Pitch(player_id='p', text=f'A single floor arena needing {int(area) + 1} sq ft', origin='web', at=datetime.now(timezone.utc))
    reply = challenge(pitch, dossier)
    assert 'fit' in reply.line.lower()
    assert persona['hard_limits'][0]['fact_ref'] in reply.fact_ids
    unknown = {**dossier, 'facts': [f for f in dossier['facts'] if f['key'] == 'floor_1_size_sqft'], 'floors': []}
    empty = fake_persona(unknown).model_dump()
    assert empty['hard_limits'] == [] and empty['hard_limits_empty_reason']


def test_spend_prices_prompt_cache_reads_and_both_write_ttls(tmp_path):
    ledger = SpendLedger(tmp_path / 'spend.json', 3)
    usage = dict(input_tokens=100, output_tokens=2,
                 input_token_details=dict(cache_read=40, cache_creation=30,
                    ephemeral_5m_input_tokens=10, ephemeral_1h_input_tokens=20))
    ledger.call(MODEL, 100, 2, lambda: usage, lambda r: r)
    # 30 uncached + 40 reads + 10 five-minute writes + 20 hour writes.
    assert ledger.snapshot()['total_usd'] == pytest.approx((3.3 * (30 + 4 + 12.5 + 40) + 16.5 * 2) / 1e6)


@pytest.mark.parametrize('override', [dict(inference_config={'max_tokens': 4096}),
    dict(model_id='us.anthropic.claude-opus-4-6'), dict(additional_model_request_fields={'max_tokens': 4096}),
    dict(service_tier='priority')])
def test_spend_meters_or_refuses_final_request_overrides(tmp_path, monkeypatch, override):
    from app.agent.spend import CappedBedrockConverse
    monkeypatch.setenv('BEDROCK_SPEND_CAP_USD', '0.05')
    class Client:
        def converse(self, **kwargs):
            pytest.fail('Unreserved or unpriced override reached Bedrock')
    model = CappedBedrockConverse(client=Client(), model_id=MODEL, region_name='us-east-1',
        max_tokens=1, disable_streaming=True, spend_path=tmp_path / 'spend.json')
    with pytest.raises(SpendUnavailable):
        model.invoke('Pitch', **override)


def test_shared_ledger_environment_is_used(tmp_path, monkeypatch):
    monkeypatch.setenv('BEDROCK_SPEND_LEDGER', str(tmp_path / 'shared.json'))
    assert SpendLedger().path == (tmp_path / 'shared.json').resolve()


def test_sdk_boundary_records_actual_model_output_and_cache_usage(tmp_path):
    from app.agent.spend import CappedBedrockConverse
    sent = []
    class Client:
        def converse(self, **request):
            sent.append(request)
            return dict(output={'message': {'role': 'assistant', 'content': [{'text': 'Ready.'}]}},
                stopReason='end_turn', usage={'inputTokens': 10, 'outputTokens': 2,
                    'cacheReadInputTokens': 20, 'cacheWriteInputTokens': 30,
                    'cacheDetails': [{'ttl': '5m', 'inputTokens': 30}]}, metrics={'latencyMs': 1})
    path = tmp_path / 'spend.json'
    haiku = 'us.anthropic.claude-haiku-4-5-20251001-v1:0'
    model = CappedBedrockConverse(client=Client(), model_id=MODEL, region_name='us-east-1',
        max_tokens=1, disable_streaming=True, spend_path=path)
    model.bind(model_id=haiku, inference_config={'max_tokens': 32}).invoke('Research')
    row = SpendLedger(path).snapshot()['calls'][0]
    assert row['model'] == sent[0]['modelId'] == haiku
    assert sent[0]['inferenceConfig']['maxTokens'] == 32
    assert row['cache_read_tokens'] == 20 and row['cache_write_5m_tokens'] == 30
    assert row['cost_usd'] == pytest.approx((1.1 * (10 + 2 + 37.5) + 5.5 * 2) / 1e6)


def test_prep_force_requires_constant_time_host_pin_and_plain_post_never_spends(monkeypatch, tmp_path):
    from fastapi.testclient import TestClient
    from app.main import app
    from app.agent import prep_agent
    monkeypatch.setenv('DATA_MODE', 'fixtures')
    monkeypatch.setenv('STATE_DIR', str(tmp_path / 'state'))
    monkeypatch.setenv('HOST_PIN', 'host-secret')
    monkeypatch.setattr(prep_agent, 'CACHE', tmp_path / 'cache')
    calls = []
    monkeypatch.setattr(prep_agent, 'prep_building', lambda *a, **kw: calls.append(True) or {'prep_status': 'ready'})
    with TestClient(app) as client:
        for headers in ({}, {'X-Host-Pin': 'wrong'}):
            assert client.post(f'/api/buildings/{PID}/prep?force=true', headers=headers).status_code == 403
        assert calls == []
        assert client.post(f'/api/buildings/{PID}/prep').status_code == 404
        assert calls == []
        assert client.post(f'/api/buildings/{PID}/prep?force=true', headers={'X-Host-Pin': 'host-secret'}).status_code == 200
        assert calls == [True]
        monkeypatch.delenv('HOST_PIN')
        assert client.post(f'/api/buildings/{PID}/prep?force=true', headers={'X-Host-Pin': 'host-secret'}).status_code == 403


def test_plain_prep_returns_trusted_cache_without_model(tmp_path, monkeypatch):
    from app.agent import prep_agent
    from app.data.provider import provider_for_mode
    from fastapi.testclient import TestClient
    from app.main import app
    monkeypatch.setenv('DATA_MODE', 'fixtures')
    monkeypatch.setenv('STATE_DIR', str(tmp_path / 'state'))
    monkeypatch.setattr(prep_agent, 'CACHE', tmp_path / 'cache')
    expected = prep_agent.prep_building(PID, provider=provider_for_mode('fixtures'),
        model=scripted_model(source_dossier()), personas=tmp_path / 'personas')
    monkeypatch.setattr(prep_agent, 'build_agent', lambda *a: pytest.fail('Read-only route built a model'))
    monkeypatch.setattr(prep_agent, 'prep_building', lambda *a, **kw: pytest.fail('Read-only route prepared'))
    with TestClient(app) as client:
        assert client.post(f'/api/buildings/{PID}/prep').json() == expected


def test_desire_requires_relevant_researched_support():
    from app.agent.persona import fake_persona, validate_persona, DESIRES
    dossier = source_dossier()
    persona = fake_persona(dossier).model_dump()
    assert persona['desire_reason_fact_ids'] and persona['desire_reason']
    for refs in [[], ['missing'], [next(f['id'] for f in dossier['facts'] if f['key'] == 'buildingName')]]:
        bad = {**persona, 'desire_reason_fact_ids': refs}
        with pytest.raises(ValueError):
            validate_persona(bad, dossier)
    bad = {**persona, 'desire_key': 'be_famous_again', 'desire_text': DESIRES['be_famous_again']}
    with pytest.raises(ValueError):
        validate_persona(bad, dossier)


def test_era_voice_and_structured_beats_check_numbers_and_claims():
    from app.agent.persona import fake_persona, validate_persona
    dossier = source_dossier()
    persona = fake_persona(dossier).model_dump()
    assert persona['voice_style'].startswith('old-Houston art-deco pride')
    assert 'dossier' not in json.dumps(persona).casefold()
    year = next(f for f in dossier['facts'] if f['key'] == 'construction_ConstructionComplete')
    good = {**persona, 'backstory': [dict(text=f"Completed in {year['value']}. Darling, make your ambition worth my time.", fact_ref=year['id'], fiction=False)]}
    assert validate_persona(good, dossier)
    for line in [good['backstory'][0]['text'].replace(str(year['value']), str(year['value'] + 1)),
                 f"Completed in {year['value']}. I have 999 pools.",
                 f"My pool opened in {year['value']}.",
                 f"Completed in {year['value']}. My lobby has a pool.",
                 f"My dossier records construction completed in {year['value']}."]:
        bad = {**persona, 'backstory': [dict(text=line, fact_ref=year['id'], fiction=False)]}
        with pytest.raises(ValueError): validate_persona(bad, dossier)


def test_derived_facts_match_source_floors_and_tenancy_history():
    dossier = source_dossier()
    facts = {f['key']: f for f in dossier['facts']}
    dark = [floor for floor in dossier['floors'] if floor['source_status'] == 'dark']
    assert facts['dark_floor_count']['value'] == len(dark) == 8
    assert facts['dark_sqft']['value'] == sum(floor['available_sqft'] for floor in dark)
    assert facts['former_tenancy_records']['value'] == dossier['tenant_history']['records'] - dossier['tenant_history']['current']
    assert facts['top_former_industry_1']['value'] == dossier['tenant_history']['top_former_industries'][0]['label']
    assert all(next(f for f in dossier['floors'] if f['number'] == n)['available_sqft'] == 31503 for n in (6, 7, 8))


def test_explicit_floor_pitch_uses_that_floor_area_not_typical_plate():
    from app.agent.fake_agent import challenge
    from app.models import Pitch
    from datetime import datetime, timezone
    dossier = source_dossier()
    area = next(f['available_sqft'] for f in dossier['floors'] if f['number'] == 6)
    pitch = Pitch(player_id='p', text=f'An arena on floor 6 using {int(area)} sq ft', origin='web', at=datetime.now(timezone.utc))
    reply = challenge(pitch, dossier)
    assert not reply.line.startswith('For a typical')
    pitch.text = f'An arena on floor 6 needing {int(area) + 1} sq ft'
    reply = challenge(pitch, dossier)
    assert reply.fact_ids == ['F_233953_floor_6_available_sqft']
    assert reply.line.startswith('For floor 6, fit')


def test_hour_cache_override_without_optional_breakdown_prices_hour_writes(tmp_path):
    from app.agent.spend import CappedBedrockConverse
    class Client:
        def converse(self, **request):
            assert request['messages'][0]['content'][1]['cachePoint']['ttl'] == '1h'
            return dict(output={'message': {'role': 'assistant', 'content': [{'text': 'Ready.'}]}},
                stopReason='end_turn', usage={'inputTokens': 5, 'outputTokens': 2,
                    'cacheReadInputTokens': 0, 'cacheWriteInputTokens': 10}, metrics={'latencyMs': 1})
    path = tmp_path / 'spend.json'
    model = CappedBedrockConverse(client=Client(), model_id=MODEL, region_name='us-east-1',
        max_tokens=32, disable_streaming=True, spend_path=path,
        raw_blocks=[{'role': 'user', 'content': [{'text': 'Research'}, {'cachePoint': {'type': 'default', 'ttl': '1h'}}]}])
    model.invoke('Ignored by raw_blocks')
    row = SpendLedger(path).snapshot()['calls'][0]
    assert row['cache_write_1h_tokens'] == 10
    assert row['cost_usd'] == pytest.approx((3.3 * (5 + 20) + 16.5 * 2) / 1e6)


def test_voice_style_cannot_smuggle_physical_claims():
    from app.agent.persona import fake_persona, validate_persona
    dossier = source_dossier()
    persona = fake_persona(dossier).model_dump()
    for suffix in (' with 999 floors', ' with a rooftop pool'):
        with pytest.raises(ValueError):
            validate_persona({**persona, 'voice_style': 'old-Houston art-deco pride' + suffix}, dossier)
