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

log = logging.getLogger(__name__)
ROOT = Path(__file__).resolve().parents[3]
# USD / million tokens, standard In-Region & Geo Cross Region, verified 2026-11-14.
# https://assets.claude.com/a04aca860a54b7323e33f449706e9b43680e1346.pdf (p9)
# Prompt caching is disabled; unrecognized model IDs are refused, not guessed.
PRICES = {
    'us.anthropic.claude-sonnet-4-6': (3.30, 16.50),
    'us.anthropic.claude-haiku-4-5-20251001-v1:0': (1.10, 5.50),
}
T = TypeVar('T')


class SpendUnavailable(RuntimeError):
    """Caller must return its ordinary offline fallback."""


class SpendLedger:
    def __init__(self, path: Path | None = None, cap: float | None = None):
        self.path = path or ROOT / 'server/state/bedrock_spend.json'
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
             invoke: Callable[[], T], usage: Callable[[T], dict]) -> T:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        # Lock spans request + accounting: threads, processes and both heroes share the cap.
        with self.path.with_suffix('.lock').open('a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            if model not in PRICES or min(input_bound, max_output) < 0:
                raise SpendUnavailable('Unpriced Bedrock request')
            rates = PRICES[model]
            reservation = (input_bound * rates[0] + max_output * rates[1]) / 1e6
            state = self.snapshot()
            if state['total_usd'] >= self.cap or state['total_usd'] + reservation > self.cap:
                log.error('Bedrock spend cap reached; using offline fallback')
                raise SpendUnavailable('Bedrock spend cap reached')
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
                cost = (incoming * rates[0] + outgoing * rates[1]) / 1e6
                state['total_usd'] += cost - reservation
                state['input_tokens'] += incoming
                state['output_tokens'] += outgoing
                row.update(status='complete', input_tokens=incoming, output_tokens=outgoing, cost_usd=cost)
                self._save(state)
                return response
            except Exception as exc:
                # Never log exception bodies: SDK errors can contain request content.
                log.error('Bedrock call unavailable (%s); reservation retained', type(exc).__name__)
                raise SpendUnavailable('Bedrock unavailable; using offline fallback') from None


class CappedBedrockConverse(ChatBedrockConverse):
    """Every supervisor/subagent request, including tool-bound copies, is metered."""
    spend_path: Path = ROOT / 'server/state/bedrock_spend.json'

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        # UTF-8 byte length is a conservative token bound; include tool schemas and overhead.
        payload = json.dumps([m.model_dump() for m in messages], default=str) + json.dumps(kwargs, default=str)
        bound = len(payload.encode('utf-8')) + 8192
        return SpendLedger(self.spend_path).call(
            self.model_id, bound, self.max_tokens or 4096,
            lambda: super(CappedBedrockConverse, self)._generate(messages, stop, run_manager, **kwargs),
            lambda result: result.generations[0].message.usage_metadata or {},
        )

    def _stream(self, *args, **kwargs):
        raise SpendUnavailable('Use non-streaming metered Bedrock calls')
