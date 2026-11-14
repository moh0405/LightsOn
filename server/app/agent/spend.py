"""Single, durable, fail-closed Bedrock spending boundary (no prompts in ledger)."""
from __future__ import annotations

import fcntl
import json
import logging
import math
import os
from pathlib import Path
from typing import Callable, TypeVar

from langchain_aws import ChatBedrockConverse
from langsmith import tracing_context

log = logging.getLogger(__name__)
ROOT = Path(__file__).resolve().parents[3]
# USD / million tokens, standard In-Region & Geo Cross Region, verified 2026-11-14.
# https://assets.claude.com/a04aca860a54b7323e33f449706e9b43680e1346.pdf (p9)
# Cache reads: 0.1x; five-minute writes: 1.25x; one-hour writes: 2x.
# https://docs.aws.amazon.com/bedrock/latest/userguide/prompt-caching.html
# Unrecognized models and pricing modes are refused.
PRICES = {
    'us.anthropic.claude-sonnet-4-6': (3.30, 16.50),
    'us.anthropic.claude-haiku-4-5-20251001-v1:0': (1.10, 5.50),
}
T = TypeVar('T')


class SpendUnavailable(RuntimeError):
    """Caller must return its ordinary offline fallback."""

    def __init__(self, message: str, *, cause: str = 'unavailable'):
        super().__init__(message)
        self.cause = cause


class SpendLedger:
    def __init__(self, path: Path | None = None, cap: float | None = None):
        self.path = Path(path or os.getenv('BEDROCK_SPEND_LEDGER') or ROOT / 'server/state/bedrock_spend.json').resolve()
        self.cap = float(os.getenv('BEDROCK_SPEND_CAP_USD', '3.00')) if cap is None else cap
        if not math.isfinite(self.cap) or not 0 <= self.cap <= 3:
            raise SpendUnavailable('Spend cap must be between zero and $3.')

    def snapshot(self) -> dict:
        try:
            if not self.path.exists():
                return dict(total_usd=0.0, input_tokens=0, output_tokens=0, calls=[])
            state = json.loads(self.path.read_text())
            if not math.isfinite(state['total_usd']) or state['total_usd'] < 0:
                raise ValueError('Invalid total')
            for key in ('input_tokens', 'output_tokens', 'calls'):
                state[key]
            return state
        except Exception:
            log.error('Bedrock spend ledger unreadable; refusing calls')
            raise SpendUnavailable('Spend accounting unavailable') from None

    def _save(self, state: dict) -> None:
        temp = self.path.with_suffix('.tmp')
        with temp.open('w') as stream:
            json.dump(state, stream, indent=2)
            stream.flush()
            os.fsync(stream.fileno())
        temp.replace(self.path)

    def call(self, model: str, input_bound: int, max_output: int,
             invoke: Callable[[], T], usage: Callable[[T], dict], *, input_multiplier: float = 1) -> T:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        # Lock spans request + accounting: threads, processes and both heroes share the cap.
        with self.path.with_suffix('.lock').open('a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            if model not in PRICES or min(input_bound, max_output) < 0:
                raise SpendUnavailable('Unpriced Bedrock request')
            rates = PRICES[model]
            reservation = (input_bound * rates[0] * input_multiplier + max_output * rates[1]) / 1e6
            state = self.snapshot()
            if state['total_usd'] >= self.cap or state['total_usd'] + reservation > self.cap:
                log.error('Bedrock spend cap reached; using offline fallback')
                raise SpendUnavailable('Bedrock spend cap reached', cause='budget')
            row = dict(model=model, reserved_usd=reservation, status='unconfirmed')
            state['calls'].append(row)
            state['total_usd'] += reservation
            self._save(state)  # A crash or timeout retains the reservation across restarts.
            try:
                response = invoke()
                tokens = usage(response)
                incoming, outgoing = tokens['input_tokens'], tokens['output_tokens']
                if not isinstance(incoming, int) or not isinstance(outgoing, int) or min(incoming, outgoing) < 0:
                    raise ValueError('Missing token usage')
                details = tokens.get('input_token_details') or {}
                read = details.get('cache_read', 0)
                five = details.get('ephemeral_5m_input_tokens', 0)
                hour = details.get('ephemeral_1h_input_tokens', 0)
                writes = details.get('cache_creation', 0)
                if five or hour:
                    if writes not in (0, five + hour):
                        raise ValueError('Inconsistent cache usage')
                    writes = five + hour
                else:
                    five = writes
                if any(type(n) is not int or n < 0 for n in (read, writes, five, hour)) or read + writes > incoming:
                    raise ValueError('Invalid cache usage')
                uncached = incoming - read - writes
                cost = (rates[0] * (uncached + .1 * read + 1.25 * five + 2 * hour)
                        + outgoing * rates[1]) / 1e6
                state['total_usd'] += cost - reservation
                state['input_tokens'] += incoming
                state['output_tokens'] += outgoing
                row.update(status='complete', input_tokens=incoming, output_tokens=outgoing,
                           cache_read_tokens=read, cache_write_5m_tokens=five, cache_write_1h_tokens=hour, cost_usd=cost)
                self._save(state)
                return response
            except Exception as exc:
                # Never log exception bodies: SDK errors can contain request content.
                log.error('Bedrock call unavailable (%s); reservation retained', type(exc).__name__)
                from botocore.exceptions import ConnectTimeoutError, ReadTimeoutError
                cause = ('timeout' if isinstance(exc, (TimeoutError, ConnectTimeoutError, ReadTimeoutError))
                         else exc.cause if isinstance(exc, SpendUnavailable) else 'unavailable')
                raise SpendUnavailable('Bedrock unavailable; using offline fallback', cause=cause) from None


class CappedBedrockConverse(ChatBedrockConverse):
    """Every supervisor/subagent request, including tool-bound copies, is metered."""
    spend_path: Path | None = None
    spend_cap: float | None = None

    def invoke(self, *args, **kwargs):
        with tracing_context(enabled=bool(os.getenv('LANGSMITH_API_KEY'))):
            return super().invoke(*args, **kwargs)

    async def ainvoke(self, *args, **kwargs):
        with tracing_context(enabled=bool(os.getenv('LANGSMITH_API_KEY'))):
            return await super().ainvoke(*args, **kwargs)

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        # SDK formatting resolves aliases, nested inference config, tools and cache points first.
        # A per-call copy avoids mutating clients shared by concurrent tool-bound invocations.
        metered = self.model_copy(update={'client': MeteredClient(self.client, self.spend_path, self.spend_cap)})
        return super(CappedBedrockConverse, metered)._generate(messages, stop, run_manager, **kwargs)

    def get_num_tokens_from_messages(self, messages, tools=None):
        # Local upper bound; never start an unmetered remote count_tokens request.
        return len(json.dumps([m.model_dump() for m in messages], default=str).encode()) + len(json.dumps(tools, default=str).encode()) + 8192

    def _stream(self, *args, **kwargs):
        raise SpendUnavailable('Use non-streaming metered Bedrock calls')


class MeteredClient:
    """The sole SDK request boundary: reserve the exact model and output bound sent."""
    def __init__(self, client, path, cap=None):
        self.client, self.path, self.cap = client, path, cap

    def converse(self, **request):
        model = request.get('modelId')
        output = request.get('inferenceConfig', {}).get('maxTokens')
        tier = request.get('serviceTier', {}).get('type', 'default')
        latency = request.get('performanceConfig', {}).get('latency', 'standard')
        if (model not in PRICES or type(output) is not int or output <= 0
                or request.get('additionalModelRequestFields') or tier != 'default' or latency != 'standard'):
            raise SpendUnavailable('Unpriced or unbounded Bedrock request')
        # Payloads are text/tools only. Encoded images/documents need a separate token bound.
        cache_ttls = set()
        def multiplier(value):
            if isinstance(value, dict):
                if any(k in value for k in ('image', 'video', 'document', 'bytes', 's3Location')):
                    raise SpendUnavailable('Unbounded media request')
                if 'cachePoint' in value:
                    ttl = value['cachePoint'].get('ttl', '5m')
                    if ttl not in ('5m', '1h'):
                        raise SpendUnavailable('Unpriced cache TTL')
                    cache_ttls.add(ttl)
                    return 2 if ttl == '1h' else 1.25
                return max([1] + [multiplier(v) for v in value.values()])
            if isinstance(value, list):
                return max([1] + [multiplier(v) for v in value])
            return 1
        cache_rate = multiplier(request)
        bound = len(json.dumps(request, ensure_ascii=False, default=str).encode('utf-8')) + 8192
        def usage(response):
            raw = response['usage']
            read, write = raw.get('cacheReadInputTokens', 0), raw.get('cacheWriteInputTokens', 0)
            details = raw.get('cacheDetails', [])
            if write and not details and cache_ttls == {'1h'}:
                details = [{'ttl': '1h', 'inputTokens': write}]
            elif write and not details and len(cache_ttls) > 1:
                raise ValueError('Mixed cache TTLs require a usage breakdown')
            if any(d.get('ttl') not in ('5m', '1h') for d in details):
                raise ValueError('Unknown cache TTL usage')
            return dict(input_tokens=raw['inputTokens'] + read + write, output_tokens=raw['outputTokens'],
                input_token_details=dict(cache_read=read, cache_creation=write,
                    ephemeral_5m_input_tokens=sum(d['inputTokens'] for d in details if d['ttl'] == '5m'),
                    ephemeral_1h_input_tokens=sum(d['inputTokens'] for d in details if d['ttl'] == '1h')))
        ledger = SpendLedger(self.path)
        if self.cap is not None:
            ledger.cap = min(ledger.cap, self.cap)
        return ledger.call(model, bound, output, lambda: self.client.converse(**request),
                           usage, input_multiplier=cache_rate)

    def converse_stream(self, *, timeout: float, on_delta=None, **request):
        """Consume a bounded stream inside the same durable reservation as converse.

        Deltas are private until the live agent validates the complete line. A broken
        stream retains its full reservation; usage is required to reconcile it.
        """
        import time
        client = self.client
        deadline = time.monotonic() + timeout

        class StreamRequest:
            def converse(self, **payload):
                if time.monotonic() >= deadline:
                    raise TimeoutError('Bedrock stream expired before request')
                result = client.converse_stream(**payload)
                stream = result['stream']
                blocks = {}
                usage = None
                try:
                    for event in stream:
                        if time.monotonic() >= deadline:
                            raise TimeoutError('Bedrock stream deadline')
                        if 'contentBlockStart' in event:
                            item = event['contentBlockStart']
                            blocks[item['contentBlockIndex']] = dict(item['start'])
                        if 'contentBlockDelta' in event:
                            item = event['contentBlockDelta']
                            block = blocks.setdefault(item['contentBlockIndex'], {})
                            delta = item['delta']
                            if 'text' in delta:
                                block['text'] = block.get('text', '') + delta['text']
                                if on_delta:
                                    on_delta(delta['text'])
                            if 'toolUse' in delta:
                                tool = block.setdefault('toolUse', {})
                                tool['input'] = tool.get('input', '') + delta['toolUse'].get('input', '')
                        if 'metadata' in event:
                            usage = event['metadata'].get('usage')
                        if any(key.endswith('Exception') for key in event):
                            raise SpendUnavailable('Bedrock stream unavailable')
                    content = []
                    for _, block in sorted(blocks.items()):
                        if 'toolUse' in block:
                            block['toolUse']['input'] = json.loads(block['toolUse'].get('input', '{}'))
                        if block:
                            content.append(block)
                    return {'output': {'message': {'role': 'assistant', 'content': content}}, 'usage': usage}
                finally:
                    stream.close()

        return MeteredClient(StreamRequest(), self.path, self.cap).converse(**request)
