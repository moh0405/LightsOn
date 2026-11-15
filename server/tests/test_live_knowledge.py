"""Knowledgeable live replies: richer grounded context, dossier fact tools and a LangChain tool loop."""
import asyncio
import json
from datetime import datetime, timezone

import pytest
from langchain_core.messages import AIMessage, ToolMessage

from app.agent.grounding import check_line
from app.agent.knowledge import FactTools, knowledge_dossier
from app.agent.live_agent import LangChainBedrock, LiveAgent
from app.agent.prompts import build_prompt, challenge_prompt, persona_for, safe_facts
from app.city import City
from app.data.provider import provider_for_mode
from app.models import Pitch


@pytest.fixture
def dossier(game_mode):
    return provider_for_mode(game_mode).dossier('233953')


def pitch(text='A late-night jazz supper club', player='p1', revision=False):
    return Pitch(player_id=player, text=text, origin='web', revision=revision, at=datetime.now(timezone.utc))


def test_knowledge_adds_only_real_neighbor_and_tour_facts(dossier, game_mode):
    known = knowledge_dossier(dossier)
    provider = provider_for_mode(game_mode)
    neighbors = [f for f in known['facts'] if f['key'] == 'neighbor_dark_floor_count']
    assert neighbors, 'Esperson has prepared neighbors'
    for fact in neighbors:
        source = provider.dossier(fact['id'].split('_')[1])
        real = next(f for f in source['facts'] if f['key'] == 'dark_floor_count')
        assert fact['id'] == real['id'] and fact['value'] == real['value']
        assert source['name'] in fact['say_as']
    tours = next(f for f in known['facts'] if f['key'] == 'matterport_tour_count')
    assert tours['value'] == len(dossier['media']['matterport'])
    # The original dossier is never mutated; neighbor facts are citable and checked.
    assert not any(f['key'].startswith('neighbor_') for f in dossier['facts'])
    wells = next(f for f in neighbors if f['id'] == 'F_233899_dark_floor_count')
    assert check_line(f"Nearby Wells Fargo Plaza has {wells['value']} dark floors.", [wells['id']], known) is None
    assert check_line(f"Nearby Wells Fargo Plaza has {wells['value'] + 1} dark floors.", [wells['id']], known)
    assert 'contacts' not in json.dumps(known['facts']).casefold()


def test_prompts_carry_rich_grounded_knowledge(dossier):
    known = knowledge_dossier(dossier)
    persona = persona_for(known)
    city = City()
    memory = 'Earlier this round: Ava pitched a rooftop cinema; you challenged the floor plate.'
    for prompt in (challenge_prompt(known, 'proud', pitches=[pitch()], city=city, memory=memory),
                   build_prompt(known, 'proud', city, memory, pitches=[pitch()])):
        text = str(prompt)
        # Every non-null dossier fact is reachable by id; non-floor facts carry say_as.
        for fact in safe_facts(known):
            if fact['value'] is not None:
                assert fact['id'] in text or fact['key'].startswith('floor_'), fact['key']
        assert 'top_former_industry_1' in text and 'professional scientific and technical services' in text
        assert 'looks like' in text and 'Wells Fargo Plaza' in text
        assert 'Matterport' in text and 'dark floors' in text.casefold()
        assert persona['voice_style'] in text and persona['desire_text'] in text
        assert all(limit['fact_ref'] in text for limit in persona['hard_limits'])
        assert json.dumps(city.needs) in text and memory in text
        assert 'get_fact' in text and 'search_facts' in text
        assert len(text.encode()) < 24000


def test_fact_tools_look_up_and_search_the_dossier(dossier):
    tools = FactTools(knowledge_dossier(dossier))
    parking = tools.get_fact('F_233953_parkingRatio')
    assert parking['value'] == 0.89 and parking['say_as']
    assert tools.get_fact('F_missing') == {'id': 'F_missing', 'error': 'unknown fact id; do not cite it'}
    assert 'do not cite' in tools.get_fact('F_233953_occupied_sqft')['error']
    assert tools.search_facts('parking ratio')['facts'][0]['id'] == 'F_233953_parkingRatio'
    floor = [f['id'] for f in tools.search_facts('floor 7')['facts']]
    assert 'F_233953_floor_7_available_sqft' in floor
    assert any(f['key'] == 'neighbor_dark_floor_count' for f in tools.search_facts('neighbors dark')['facts'])
    assert tools.search_facts('')['facts'] == []


class FakeChat:
    """Scripted LangChain chat model: records bound tools, tool choice and message history."""
    def __init__(self, replies, delay=0):
        self.replies, self.delay, self.calls = list(replies), delay, []

    def bind_tools(self, tools, tool_choice=None):
        outer = self
        class Bound:
            async def ainvoke(self, messages):
                outer.calls.append(dict(tools=[t['function']['name'] for t in tools], tool_choice=tool_choice,
                                        messages=list(messages)))
                if outer.delay:
                    await asyncio.sleep(outer.delay)
                reply = outer.replies.pop(0)
                if isinstance(reply, Exception):
                    raise reply
                return reply
        return Bound()


def call(name, args, id):
    return {'name': name, 'args': args, 'id': id, 'type': 'tool_call'}


def answer(args, id='a'):
    return AIMessage(content='', tool_calls=[call('answer', args, id)])


def factory(chats):
    return lambda step, timeout: chats[step]


async def test_tool_loop_round_trips_publish_grounded_line_and_trace(dossier):
    known = knowledge_dossier(dossier)
    fact = next(f for f in known['facts'] if f['key'] == 'dark_floor_count')
    challenge = FakeChat([
        AIMessage(content='', tool_calls=[call('search_facts', {'query': 'dark floors'}, 't1'),
                                          call('get_fact', {'id': fact['id']}, 't2')]),
        answer({'challenges': [dict(player_id='p1', line=f"{fact['value']} dark floors, darling, and I want them swinging.",
                                    fact_ids=[fact['id']], counteroffer='Could your club start small and swing after sunset?',
                                    category_guess='entertainment')]}),
    ])
    check = FakeChat([answer({'checks': [{'index': 0, 'supported': True, 'reason': ''}]})])
    events = []
    agent = LiveAgent(model=LangChainBedrock(chat_factory=factory({'challenge': challenge, 'claim_check': check})),
                      emit=events.append)
    result = await agent.challenge([pitch()], dossier, City(), 'proud', names={'p1': 'Ava'})
    assert agent.fallbacks == 0 and result[0].fact_ids == [fact['id']]
    assert result[0].line.startswith(f"{fact['value']} dark floors")
    # Round 1 may look up facts or answer; the tool results return dossier rows.
    first, second = challenge.calls
    assert set(first['tools']) == {'get_fact', 'search_facts', 'answer'} and first['tool_choice'] == 'any'
    results = [m for m in second['messages'] if isinstance(m, ToolMessage)]
    assert [m.tool_call_id for m in results] == ['t1', 't2']
    assert fact['say_as'] in results[1].content
    # The claim check stays one forced structured answer.
    assert check.calls[0]['tools'] == ['answer'] and check.calls[0]['tool_choice'] == 'answer'
    tools = [(e['step'], e['tool']) for e in events]
    assert ('challenge', 'search_facts') in tools and ('challenge', 'get_fact') in tools
    assert ('challenge', 'bedrock_challenge') in tools and ('claim_check', 'bedrock_claim_check') in tools
    assert all(set(e) == {'step', 'tool', 'summary', 'duration_ms'} for e in events)


async def test_tool_loop_forces_an_answer_after_the_lookup_rounds(dossier):
    lookups = [AIMessage(content='', tool_calls=[call('search_facts', {'query': 'height'}, f't{i}')]) for i in range(5)]
    chat = FakeChat(lookups)
    model = LangChainBedrock(chat_factory=lambda step, timeout: chat, max_rounds=2)
    with pytest.raises(ValueError):
        await model('challenge', 'system', 'content', __import__('app.agent.live_agent', fromlist=['Challenges']).Challenges,
                    5, dossier=knowledge_dossier(dossier))
    assert [c['tool_choice'] for c in chat.calls] == ['any', 'any', 'answer']
    assert chat.calls[-1]['tools'] == ['answer']


async def test_tool_loop_answers_still_pass_grounding(dossier):
    known = knowledge_dossier(dossier)
    fact = next(f for f in known['facts'] if f['key'] == 'dark_floor_count')
    bad = dict(player_id='p1', line=f"{fact['value'] + 4} dark floors, darling.", fact_ids=[fact['id']],
               counteroffer='Could you start smaller?', category_guess='entertainment')
    chat = FakeChat([answer({'challenges': [bad]}), answer({'challenges': [bad]})])
    agent = LiveAgent(model=LangChainBedrock(chat_factory=lambda step, timeout: chat))
    result = await agent.challenge([pitch()], dossier, City())
    # Unsupported numbers never publish: the deterministic template does.
    assert agent.fallbacks == 1 and agent.challenge_fallback_causes['number_match'] == 1
    assert str(fact['value'] + 4) not in result[0].line


async def test_tool_loop_keeps_the_step_budget(dossier):
    chat = FakeChat([answer({'challenges': []})], delay=5)
    agent = LiveAgent(model=LangChainBedrock(chat_factory=lambda step, timeout: chat), challenge_timeout=.05)
    started = asyncio.get_running_loop().time()
    result = await agent.challenge([pitch()], dossier, City())
    assert asyncio.get_running_loop().time() - started < 1
    assert agent.challenge_fallback_causes['timeout'] == 1 and result[0].line


def test_default_chat_is_metered_non_streaming_bedrock(monkeypatch, tmp_path):
    from app.agent.spend import CappedBedrockConverse
    monkeypatch.setenv('BEDROCK_SPEND_LEDGER', str(tmp_path / 'spend.json'))
    chat = LangChainBedrock().chat('challenge', 7.5)
    assert isinstance(chat, CappedBedrockConverse) and chat.disable_streaming is True
    assert chat.model_id == 'us.anthropic.claude-haiku-4-5-20251001-v1:0' and chat.max_tokens == 300
    verdict = LangChainBedrock().chat('verdict', 11)
    assert verdict.model_id == 'us.anthropic.claude-sonnet-4-6' and verdict.max_tokens == 800

    class Client:
        def __init__(self): self.requests = []
        def converse(self, **request):
            self.requests.append(request)
            return {'output': {'message': {'role': 'assistant', 'content': [{'toolUse': {
                        'toolUseId': 'x', 'name': 'answer', 'input': {'checks': []}}}]}},
                    'usage': {'inputTokens': 100, 'outputTokens': 10, 'totalTokens': 110},
                    'stopReason': 'tool_use', 'metrics': {'latencyMs': 1}}
    client = Client()
    model = LangChainBedrock(client=client)
    from app.agent.grounding import ClaimChecks
    value = asyncio.run(model('claim_check', 'system', 'lines', ClaimChecks, 5))
    assert value == {'checks': []}
    ledger = json.loads((tmp_path / 'spend.json').read_text())
    assert ledger['calls'][-1]['status'] == 'complete' and ledger['input_tokens'] == 100
    assert client.requests[0]['toolConfig']['toolChoice'] == {'tool': {'name': 'answer'}}
