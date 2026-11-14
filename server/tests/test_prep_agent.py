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


def test_merge_research_rejects_desire_cited_from_unresearched_facts(tmp_path):
    from app.agent.persona import fake_persona
    from app.agent.prep_agent import merge_research
    from app.data.provider import provider_for_mode
    tools = BuildingTools(PID, provider_for_mode('fixtures'))
    dossier = {**tools.dossier, 'facts': tools.facts}
    persona = fake_persona(dossier).model_dump()
    desire_refs = set(persona['desire_reason_fact_ids'])
    other = {ref for beat in persona['backstory'] if (ref := beat.get('fact_ref'))} | {l['fact_ref'] for l in persona['hard_limits']}
    assert desire_refs - other, 'desire must cite a fact the rest of the persona does not'
    researched = [f['id'] for f in tools.facts if f['id'] not in desire_refs - other]
    (tmp_path / 'facts_property.json').write_text(json.dumps({'fact_ids': researched}))
    (tmp_path / 'facts_spatial.json').write_text(json.dumps({'fact_ids': []}))
    (tmp_path / 'persona.json').write_text(json.dumps(persona))
    with pytest.raises(ValueError, match='Desire'):
        merge_research(tools, tmp_path)
    (tmp_path / 'facts_property.json').write_text(json.dumps({'fact_ids': [f['id'] for f in tools.facts]}))
    assert merge_research(tools, tmp_path)['persona']['desire_key'] == persona['desire_key']


def test_cache_with_forged_fingerprint_is_not_trusted(tmp_path):
    from app.agent.prep_agent import prep_building
    from app.data.provider import provider_for_mode
    kwargs = dict(provider=provider_for_mode('fixtures'), cache=tmp_path / 'cache', personas=tmp_path / 'personas')
    first = prep_building(PID, model=scripted_model(source_dossier()), **kwargs)
    path = tmp_path / 'cache' / PID / 'dossier.json'
    # Source snapshot is intact; only the fingerprint is wrong, so only that check can reject it.
    path.write_text(json.dumps({**first, 'source_fingerprint': 'forged'}))
    model = scripted_model(source_dossier())
    result = prep_building(PID, model=model, **kwargs)
    assert model._calls > 0
    assert result['source_fingerprint'] == first['source_fingerprint']


def test_meta_and_floor_status_words_are_denied_in_fact_remainders():
    from app.agent.persona import fake_persona, validate_persona
    dossier = source_dossier()
    persona = fake_persona(dossier).model_dump()
    year = next(f for f in dossier['facts'] if f['key'] == 'construction_ConstructionComplete')
    for remainder in ('The database agrees, darling.', 'Records show I am proud.', 'Never call me vacant, darling.'):
        bad = {**persona, 'backstory': [dict(text=f"Completed in {year['value']}. {remainder}", fact_ref=year['id'], fiction=False)]}
        with pytest.raises(ValueError):
            validate_persona(bad, dossier)


def pitch(text):
    from app.models import Pitch
    from datetime import datetime, timezone
    return Pitch(player_id='p', text=text, origin='web', at=datetime.now(timezone.utc))


@pytest.mark.parametrize('text,key', [
    ('A 400-foot observation deck on top', 'buildingHeightInFeet'),
    ('A vertical farm reaching 350 ft', 'buildingHeightInFeet'),
    ('A sky bar on floor 30 with a view', 'numStoriesAboveGrade'),
    ('A 35-story vertical farm', 'numStoriesAboveGrade'),
    ('A food hall with 3 parking spaces per 1,000 sq ft', 'parkingRatio'),
    ('An arena of 20,000 sq ft with 500 parking spaces', 'parkingRatio'),
    ('A 200,000 sq ft indoor mall', 'dark_sqft'),
    ('A single floor arena needing 25,000 sq ft', 'grossTypicalFloorSquareFeet'),
])
def test_each_hard_limit_triggers_numerically_and_challenge_cites_it(text, key):
    from app.agent.fake_agent import challenge
    from app.agent.persona import fake_persona, physical_limits
    dossier = source_dossier()
    dossier['persona'] = fake_persona(dossier).model_dump()
    fact = next(f for f in dossier['facts'] if f['key'] == key)
    limit = next(l for l in physical_limits(dossier) if l['fact_ref'] == fact['id'])
    assert limit['threshold'] == fact['value'] and limit['applies_to'] == []
    reply = challenge(pitch(text), dossier)
    assert reply.fact_ids == [fact['id']]
    assert reply.line == limit['text']


@pytest.mark.parametrize('text', ['A cozy cafe for the block', 'A 20-story vertical farm',
                                  'A 250-foot light show', 'A food hall with 0.5 parking spaces per 1,000 sq ft',
                                  'A 100,000 sq ft market across my dark floors'])
def test_hard_limits_do_not_trigger_within_the_facts(text):
    from app.agent.fake_agent import challenge
    from app.agent.persona import fake_persona, physical_limits
    dossier = source_dossier()
    dossier['persona'] = fake_persona(dossier).model_dump()
    reply = challenge(pitch(text), dossier)
    assert reply.line not in {l['text'] for l in physical_limits(dossier)}


def test_parking_limit_may_target_only_justified_categories():
    from app.agent.fake_agent import challenge
    from app.agent.persona import fake_persona, physical_limits, validate_persona
    dossier = source_dossier()
    persona = fake_persona(dossier).model_dump()
    parking = next(l for l in physical_limits(dossier) if l['constraint'] == 'parking')
    persona['hard_limits'] = persona['hard_limits'][:1] + [{**parking, 'applies_to': ['entertainment']}]
    validate_persona(persona, dossier)
    for bad in (['housing'], ['entertainment', 'work']):
        with pytest.raises(ValueError):
            validate_persona({**persona, 'hard_limits': persona['hard_limits'][:1] + [{**parking, 'applies_to': bad}]}, dossier)
    height = next(l for l in physical_limits(dossier) if l['constraint'] == 'height')
    with pytest.raises(ValueError):
        validate_persona({**persona, 'hard_limits': persona['hard_limits'][:1] + [{**height, 'applies_to': ['housing']}]}, dossier)
    from app.agent.persona import limit_applies
    narrowed = persona['hard_limits'][1]
    assert limit_applies(narrowed, 'A concert hall with 3 parking spaces per 1,000 sq ft', 'entertainment')
    assert not limit_applies(narrowed, 'Apartments with 3 parking spaces per 1,000 sq ft', 'housing')
    with pytest.raises(ValueError):
        validate_persona({**persona, 'hard_limits': persona['hard_limits'][:1] + [{**parking, 'threshold': 5.0}]}, dossier)


def test_challenge_keeps_narrowed_parking_limit_narrow():
    from app.agent.fake_agent import challenge
    from app.agent.persona import fake_persona, physical_limits
    dossier = source_dossier()
    persona = fake_persona(dossier).model_dump()
    parking = next(l for l in physical_limits(dossier) if l['constraint'] == 'parking')
    persona['hard_limits'] = [l for l in persona['hard_limits'] if l['constraint'] != 'parking'][:1] + [{**parking, 'applies_to': ['entertainment']}]
    dossier['persona'] = persona
    housing = challenge(pitch('Apartments with 3 parking spaces per 1,000 sq ft'), dossier)
    assert parking['fact_ref'] not in housing.fact_ids and housing.line != parking['text']
    hall = challenge(pitch('A concert hall with 3 parking spaces per 1,000 sq ft'), dossier)
    assert hall.fact_ids == [parking['fact_ref']] and hall.line == parking['text']


@pytest.mark.parametrize('failure', [SpendUnavailable('budget'), ValueError('bad persona')])
def test_failed_forced_prep_keeps_previous_trusted_cache(tmp_path, monkeypatch, failure):
    from app.agent import prep_agent
    from app.data.provider import provider_for_mode
    kwargs = dict(provider=provider_for_mode('fixtures'), cache=tmp_path / 'cache', personas=tmp_path / 'personas')
    first = prep_agent.prep_building(PID, model=scripted_model(source_dossier()), **kwargs)
    dossier_path = tmp_path / 'cache' / PID / 'dossier.json'
    persona_path = tmp_path / f'personas/{PID}.json'
    before = dossier_path.read_text(), persona_path.read_text()
    class Failing:
        def invoke(self, *args, **kwargs):
            raise failure
    monkeypatch.setattr(prep_agent, 'build_agent', lambda *args: Failing())
    try:
        prep_agent.prep_building(PID, force=True, **kwargs)
    except ValueError:
        pass
    assert (dossier_path.read_text(), persona_path.read_text()) == before
    monkeypatch.undo()
    assert prep_agent.read_cached_building(PID, provider=kwargs['provider'], cache=kwargs['cache']) == first


@pytest.mark.parametrize('text', ['A mural 300 ft wide', 'A 400 ft long indoor running track',
                                  'A 350-foot-long banquet table', 'A plaza 500 ft by 400 ft',
                                  'A 320 ft deep aquarium tunnel stretching across the block',
                                  'A 600-foot zipline across the street'])
def test_horizontal_feet_never_trigger_the_height_limit(text):
    from app.agent.fake_agent import challenge
    from app.agent.persona import fake_persona, limit_applies, physical_limits
    dossier = source_dossier()
    dossier['persona'] = fake_persona(dossier).model_dump()
    height = next(l for l in physical_limits(dossier) if l['constraint'] == 'height')
    assert not limit_applies(height, text, 'entertainment')
    assert challenge(pitch(text), dossier).line != height['text']


@pytest.mark.parametrize('text', ['A 350 ft tall spire', 'A sculpture rising 400 feet', 'A 300-foot-high light tower',
                                  'An antenna 310 feet in height'])
def test_vertical_feet_trigger_the_height_limit(text):
    from app.agent.persona import fake_persona, limit_applies, physical_limits
    dossier = source_dossier()
    height = next(l for l in physical_limits(dossier) if l['constraint'] == 'height')
    assert limit_applies(height, text, 'entertainment')


def _boundary_text(limit, value):
    n = f'{value:,.2f}'.rstrip('0').rstrip('.')
    return {
        'floor_plate': f'A single floor studio needing {n} sq ft',
        'dark_area': (f'A studio on floor {limit["floor"]} needing {n} sq ft' if limit.get('floor') is not None
                      else f'A {n} sq ft market across my dark floors'),
        'stories': f'A {n}-story vertical farm',
        'height': f'A spire {n} ft tall',
        'parking': f'A food hall with {n} parking spaces per 1,000 sq ft',
    }[limit['constraint']]


def _every_limit():
    from app.agent.persona import physical_limits
    return physical_limits(source_dossier())


@pytest.mark.parametrize('offset,fires', [(-1, False), (0, False), (1, True)])
@pytest.mark.parametrize('index', range(13))
def test_every_limit_is_strict_at_its_threshold(index, offset, fires):
    from app.agent.fake_agent import challenge
    from app.agent.persona import fake_persona, limit_applies
    limits = _every_limit()
    assert len(limits) == 13 and {l['constraint'] for l in limits} == {'floor_plate', 'dark_area', 'stories', 'height', 'parking'}
    limit = limits[index]
    step = 0.01 if limit['constraint'] == 'parking' else 1
    text = _boundary_text(limit, limit['threshold'] + offset * step)
    assert limit_applies(limit, text, 'food_retail') is fires, text
    dossier = source_dossier()
    dossier['persona'] = {**fake_persona(dossier).model_dump(), 'hard_limits': [limit]}
    reply = challenge(pitch(text), dossier)
    assert (reply.line == limit['text'] and reply.fact_ids == [limit['fact_ref']]) is fires, text


def test_inner_scout_tool_events_carry_their_owner(tmp_path):
    from app.agent.prep_agent import prep_building
    from app.data.provider import provider_for_mode
    events = []
    prep_building(PID, provider=provider_for_mode('fixtures'), model=scripted_model(source_dossier()),
                  cache=tmp_path / 'cache', personas=tmp_path / 'personas', emit=events.append)
    owners = {}
    for event in events:
        owners.setdefault(event['tool'], set()).add(event['step'])
    for tool in ['kit_get_building', 'kit_get_floor_status', 'kit_get_tenant_history', 'kit_get_matterport_models']:
        assert owners[tool] == {'property_scout'}, tool
    for tool in ['vexcel_property', 'vexcel_imagery', 'vexcel_detect', 'matterport_get_model']:
        assert owners[tool] == {'spatial_scout'}, tool
    assert owners['read_file'] == {'persona_writer'}
    assert owners['task'] == {'property_scout', 'spatial_scout', 'persona_writer'}
    inner_writes = [e['step'] for e in events if e['tool'] == 'write_file']
    assert sorted(inner_writes) == ['persona_writer', 'property_scout', 'spatial_scout']


@pytest.mark.parametrize('failure,status,code', [(ValueError('secret grounding detail'), 422, 'prep_grounding_failed'),
                                                 (RuntimeError('secret upstream detail'), 503, 'prep_unavailable')])
def test_prep_failures_toast_without_leaking_exception_text(monkeypatch, tmp_path, failure, status, code):
    from fastapi.testclient import TestClient
    from app.main import app
    from app.agent import prep_agent
    monkeypatch.setenv('STATE_DIR', str(tmp_path))
    monkeypatch.setenv('DATA_MODE', 'fixtures')
    monkeypatch.setenv('HOST_PIN', 'test-host')
    def prepare(pid, force, **kwargs):
        raise failure
    floors = []
    monkeypatch.setattr(prep_agent, 'prep_building', prepare)
    monkeypatch.setattr(prep_agent, 'finalize_floors', lambda: floors.append(1))
    with TestClient(app) as client:
        room = client.post('/api/rooms').json()['room']
        with client.websocket_connect(f'/ws/{room}?role=screen') as ws:
            assert ws.receive_json()['type'] == 'room_state'
            response = client.post(f'/api/buildings/{PID}/prep?force=true', headers={'X-Host-Pin': 'test-host'})
            assert response.status_code == status
            event = ws.receive_json()
    assert event['type'] == 'error' and event['code'] == code and event['message']
    assert 'secret' not in json.dumps(event) + response.text
    assert floors == []


def test_http_forced_prep_rebuilds_floor_artifacts_only_when_ready(monkeypatch, tmp_path):
    from fastapi.testclient import TestClient
    from app.main import app
    from app.agent import prep_agent
    from app.agent.persona import fake_persona
    monkeypatch.setenv('STATE_DIR', str(tmp_path))
    monkeypatch.setenv('DATA_MODE', 'fixtures')
    monkeypatch.setenv('HOST_PIN', 'test-host')
    status = ['ready']
    def prepare(pid, force, **kwargs):
        dossier = source_dossier()
        return {**dossier, 'persona': fake_persona(dossier).model_dump(), 'prep_status': status[0]}
    floors = []
    monkeypatch.setattr(prep_agent, 'prep_building', prepare)
    monkeypatch.setattr(prep_agent, 'finalize_floors', lambda: floors.append(1))
    with TestClient(app) as client:
        headers = {'X-Host-Pin': 'test-host'}
        assert client.post(f'/api/buildings/{PID}/prep?force=true', headers=headers).status_code == 200
        assert floors == [1]
        status[0] = 'unavailable'
        assert client.post(f'/api/buildings/{PID}/prep?force=true', headers=headers).status_code == 200
        assert floors == [1]


def test_finalize_floors_matches_the_committed_floor_artifact(tmp_path):
    from app.agent import prep_agent
    out = tmp_path / 'floors.geojson'
    prep_agent.finalize_floors(output=out)
    committed = prep_agent.ROOT / 'apps/web/public/floors.geojson'
    assert json.loads(out.read_text()) == json.loads(committed.read_text())
