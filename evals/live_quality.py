#!/usr/bin/env python3
"""Explicit paid latency check: eight challenges, two verdicts, <= $0.12 spent, ledger < configured cap minus $0.30."""
from __future__ import annotations

import argparse
import asyncio
from collections import Counter
from datetime import datetime, timezone
import json
import math
import os
from pathlib import Path
import sys
from time import monotonic

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'server'))

from app.actions import select_target_floors, target_sqft, validate_verdict
from app.agent.grounding import check_line
from app.agent.live_agent import Bedrock, FAST, SMART, LiveAgent
from app.agent.prompts import persona_for
from app.agent.spend import SpendLedger
from app.city import City
from app.data.provider import provider_for_mode
from app.models import Pitch


RUN_MARGIN_USD = .30  # the eval's ledger ceiling stays this far below the configured cap
RUN_SPEND_LIMIT_USD = .12  # hard ceiling, including outstanding reservations
# The shared ledger reserves before invoking Bedrock. Never add headroom beyond
# the authorized run spend: if parallel reservations do not fit, use fallback.


def budget_ceiling(total: float, cap: float | None = None) -> float:
    cap = SpendLedger().cap if cap is None else cap
    return min(total + RUN_SPEND_LIMIT_USD, cap - RUN_MARGIN_USD - .000001)


def percentile(samples, quantile):
    """Nearest rank; eight players' p90 is the slowest measured player."""
    return sorted(samples)[max(0, math.ceil(len(samples) * quantile) - 1)] if samples else None


def challenge_plan() -> dict:
    source = json.loads((ROOT / 'evals/pitches.yaml').read_text())['buildings']
    chosen = ('strong_fit', 'impossible_area', 'desire', 'funny')
    return {bid: [next(row for row in rows if row['id'] == key) for key in chosen]
            for bid, rows in source.items()}


async def evaluate(plan):
    output = dict(challenges=[], verdicts=[], rounds=[], requests=[], schema_failures=0)
    adapter = Bedrock()
    def model(step, system, content, schema, timeout):
        output['requests'].append(dict(step=step, timeout=timeout))
        return adapter(step, system, content, schema, timeout)
    # Each building is one round: four independent, parallel player generations.
    for bid, rows in plan.items():
        dossier = provider_for_mode('kit').dossier(bid)
        dossier['persona'] = persona_for(dossier)
        city = City()
        pitches = [Pitch(player_id=f'p{i+1}', text=row['text'], origin='web',
                         at=datetime.now(timezone.utc)) for i, row in enumerate(rows)]
        published = {}
        started = monotonic()
        def publish(c):
            published[c.player_id] = monotonic() - started
        agent = LiveAgent(model=model, on_challenge=publish)
        challenges = await agent.challenge(pitches, dossier, city)
        elapsed = monotonic() - started
        for row, c in zip(rows, challenges):
            cause = agent.fallback_player_causes.get(c.player_id)
            output['challenges'].append(dict(building=bid, case=row['id'],
                line=c.line, counteroffer=c.counteroffer, fact_ids=c.fact_ids,
                fallback_cause=cause, from_model=c.player_id in agent.challenge_latencies,
                seconds=agent.challenge_latencies.get(c.player_id),
                publication_seconds=published[c.player_id], round_seconds=elapsed,
                ground_error=check_line(c.line + ' ' + c.counteroffer, c.fact_ids, dossier, quoted=[row['text']])))
        ready = [published[pid] for pid in agent.challenge_latencies]
        output['rounds'].append(dict(building=bid, first_model_seconds=min(ready) if ready else None,
                                    full_seconds=elapsed))
        output['schema_failures'] += agent.schema_failures
        print(f'Challenge {bid}: {len(agent.fallback_player_ids)}/4 fallbacks; '
              f'{dict(agent.challenge_fallback_causes)}; {elapsed:.3f}s', flush=True)
        # Two verdict cases total, each scores a fit against an impossible requirement.
        judge = LiveAgent(model=model)
        started = monotonic()
        sqft = target_sqft(dossier, select_target_floors(dossier))
        batches = await judge.verdict_batches(pitches[:2], [], dossier, city, challenges[:2], impact_sqft=sqft)
        verdict = validate_verdict(batches, dossier=dossier, player_ids={p.player_id for p in pitches[:2]},
            round_id=f'quality-{bid}', city=city, sqft=sqft)
        output['verdicts'].append(dict(building=bid, line=verdict.reason_line, fact_ids=verdict.fact_ids,
            winner=verdict.winner_player_id, scores=[s.model_dump() for s in verdict.scores],
            fallback_cause=next(iter(judge.fallback_causes), None), seconds=monotonic() - started,
            ground_error=check_line(verdict.reason_line, verdict.fact_ids, dossier, verdict.impact)))
        output['schema_failures'] += judge.schema_failures
        print(f'Verdict {bid}: {dict(judge.fallback_causes)}', flush=True)
    return output


def report(result, before, after, ceiling):
    challenges, verdicts = result['challenges'], result['verdicts']
    counts = Counter(c['fallback_cause'] for c in challenges if c['fallback_cause'])
    verdict_counts = Counter(v['fallback_cause'] for v in verdicts if v['fallback_cause'])
    calls = after['calls'][len(before['calls']):]
    spend = after['total_usd'] - before['total_usd']
    model_times = [c['seconds'] for c in challenges if c['from_model'] and c['seconds'] is not None]
    p50, p90 = percentile(model_times, .5), percentile(model_times, .9)
    first = [r['first_model_seconds'] for r in result['rounds'] if r['first_model_seconds'] is not None]
    def timing(value):
        return f'{value:.3f}s' if value is not None else 'not observed'
    lines = ['# Phase 5 per-player latency check', '',
        f"Run: {datetime.now(timezone.utc).isoformat()}; DATA_MODE=kit; eight challenge cases and two verdict cases.", '',
        f"Challenge fallbacks: **{sum(counts.values())}/{len(challenges)}**; target ≤1/8: "
        f"{'PASS' if sum(counts.values()) <= 1 and len(challenges) == 8 else 'MISS'}.",
        f"Verdict fallbacks: **{sum(verdict_counts.values())}/{len(verdicts)}**. "
        f"Invalid schema attempts (including truncated tool JSON): {result['schema_failures']}.",
        f"Published local numeric/ID grounding: {sum(c['ground_error'] is None for c in challenges + verdicts)}/{len(challenges + verdicts)}. "
        'Local checks plus model claim checks are not proof of perfect semantic accuracy; model lines require a manual audit.', '',
        '| Cause | Challenge cases | Verdict cases |', '| --- | --- | --- |']
    for cause in ('timeout', 'invalid_schema', 'fact_id', 'number_match', 'claim_check', 'safety', 'budget', 'unavailable'):
        lines.append(f'| {cause} | {counts[cause]} | {verdict_counts[cause]} |')
    lines += ['', f'Run spend including retained reservations: **${spend:.6f}** (limit ${RUN_SPEND_LIMIT_USD:.2f}).',
        f"Shared ledger: **${before['total_usd']:.6f} → ${after['total_usd']:.6f}**; run cap ${ceiling:.6f}, ${RUN_MARGIN_USD:.2f} below the configured cap.",
        f"Paid requests: {len(calls)}, reconciled {sum(c['status'] == 'complete' for c in calls)}, "
        f"unconfirmed {sum(c['status'] != 'complete' for c in calls)}.", '',
        '## Per-player model latency', '',
        f'Model-only time to grounded line: **p50 {timing(p50)} / p90 {timing(p90)}** ({len(model_times)} players; nearest rank).',
        'Each sample starts when that player generation task begins and ends after local grounding and any semantic '
        'claim check/regeneration, immediately before its publication callback. Fallback samples are excluded. '
        'Independent claim checks overlap other players’ generation and publication. These are direct LiveAgent '
        'measurements; WebSocket transport and browser render time are excluded. The room regression separately '
        'proves its callback emits the existing counteroffer event while another player is pending.', '',
        f'First grounded model callback per round: {", ".join(timing(x) for x in first) or "not observed"}.', '',
        '| Building / case | Origin | Grounded model | Publication callback |',
        '| --- | --- | --- | --- |']
    for c in challenges:
        lines.append(f"| {c['building']} / {c['case']} | {'model' if c['from_model'] else 'fallback'} | "
                     f"{timing(c['seconds'])} | {c['publication_seconds']:.3f}s |")
    lines += ['', '## Prompt cache', '',
        f"Observed cache tokens: {sum(c.get('cache_read_tokens', 0) for c in calls)} reads; "
        f"{sum(c.get('cache_write_5m_tokens', 0) for c in calls)} five-minute writes; "
        f"{sum(c.get('cache_write_1h_tokens', 0) for c in calls)} one-hour writes.",
        'Challenge requests put shared rules, persona, hard limits and the fact table before a cache checkpoint, '
        'then add only pitch-specific facts. A cache capability ValidationException retries once without '
        'checkpoints inside the same reservation. Other request errors retain the reservation and use fallback. '
        '[AWS documents a 4,096-token minimum for Haiku 4.5 checkpoints]'
        '(https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-haiku-4-5.html); '
        'these deliberately short contexts may remain below that minimum, so zero cache usage is expected and '
        'no caching speedup is claimed. No padding or extra paid cache probe is used.', '',
        '## Verbatim model challenge lines', '']
    for c in [c for c in challenges if c['from_model']][:3]:
        lines += [f"{c['building']} / {c['case']}:", '', '> ' + c['line'], '']
    lines += ['## All dialogue for manual audit', '']
    for c in challenges:
        lines.append(f"- {c['building']} / {c['case']} ({c['fallback_cause'] or 'model'}): {c['line']} "
                     f"Counteroffer: {c['counteroffer']} Cites: {', '.join(c['fact_ids'])}.")
    for v in verdicts:
        lines.append(f"- Verdict {v['building']}: {v['line']} (winner {v['winner']}; {v['fallback_cause'] or 'model'}; {v['seconds']:.3f}s). "
                     f"Cites: {', '.join(v['fact_ids'])}.")
    lines += ['', 'Private responses and request counts: `server/state/latency_result.json`; '
        'rejected candidates: `server/state/live_agent.jsonl`. The prior paid check remains in `evals/live-quality-check.md`.']
    (ROOT / 'evals/latency-check.md').write_text('\n'.join(lines) + '\n')
    return (sum(counts.values()) <= 1 and len(challenges) == 8 and len(verdicts) == 2
            and p90 is not None and p90 <= 6 and len(first) == 2 and max(first) <= 3
            and spend <= RUN_SPEND_LIMIT_USD + 1e-9 and after['total_usd'] <= ceiling + 1e-9
            and all(c['ground_error'] is None for c in challenges + verdicts))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--live', action='store_true', required=True)
    parser.add_argument('--ledger', type=Path, required=True)
    args = parser.parse_args()
    from dotenv import load_dotenv
    load_dotenv(ROOT / '.env')
    os.environ['BEDROCK_SPEND_LEDGER'] = str(args.ledger.resolve())
    os.environ['BEDROCK_FAST_MODEL_ID'], os.environ['BEDROCK_SMART_MODEL_ID'] = FAST, SMART
    before = SpendLedger().snapshot()
    ceiling = budget_ceiling(before['total_usd'])
    if ceiling <= before['total_usd']:
        print('No authorized headroom; no calls made.', file=sys.stderr)
        return 2
    os.environ['BEDROCK_SPEND_CAP_USD'] = str(ceiling)
    print(f"Ledger ${before['total_usd']:.6f}; cap ${ceiling:.6f}; eight challenges + two verdict cases (bounded retries).", flush=True)
    # asyncio.run waits for bounded synchronous SDK threads, including timed-out ones,
    # before the ledger snapshot. The ledger lock itself no longer waits on network I/O.
    result = asyncio.run(evaluate(challenge_plan()))
    after = SpendLedger().snapshot()
    private = ROOT / 'server/state/latency_result.json'
    private.parent.mkdir(parents=True, exist_ok=True)
    with os.fdopen(os.open(private, os.O_CREAT | os.O_WRONLY | os.O_TRUNC, 0o600), 'w') as stream:
        json.dump(dict(result=result, before=before['total_usd'], after=after['total_usd'], ceiling=ceiling), stream, indent=2)
    okay = report(result, before, after, ceiling)
    print(f"Report evals/latency-check.md; spent ${after['total_usd']-before['total_usd']:.6f}; ledger ${after['total_usd']:.6f}", flush=True)
    return 0 if okay else 1


if __name__ == '__main__':
    raise SystemExit(main())
