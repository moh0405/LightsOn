#!/usr/bin/env python3
"""Explicit small paid check: eight challenges, two verdicts, <= $0.20, ledger < $2.70."""
from __future__ import annotations

import argparse
import asyncio
from collections import Counter
from datetime import datetime, timezone
import json
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


def budget_ceiling(total: float) -> float:
    return min(total + .20, 2.70 - .000001)


def challenge_plan() -> dict:
    source = json.loads((ROOT / 'evals/pitches.yaml').read_text())['buildings']
    chosen = ('strong_fit', 'impossible_area', 'desire', 'funny')
    return {bid: [next(row for row in rows if row['id'] == key) for key in chosen]
            for bid, rows in source.items()}


async def evaluate(plan):
    output = dict(challenges=[], verdicts=[], requests=[], schema_failures=0)
    adapter = Bedrock()
    def model(step, system, content, schema, timeout):
        output['requests'].append(dict(step=step, timeout=timeout))
        return adapter(step, system, content, schema, timeout)
    # Each building is one round: all four players in one generation batch.
    for bid, rows in plan.items():
        dossier = provider_for_mode('kit').dossier(bid)
        dossier['persona'] = persona_for(dossier)
        city = City()
        pitches = [Pitch(player_id=f'p{i+1}', text=row['text'], origin='web',
                         at=datetime.now(timezone.utc)) for i, row in enumerate(rows)]
        agent = LiveAgent(model=model)
        started = monotonic()
        challenges = await agent.challenge(pitches, dossier, city)
        elapsed = monotonic() - started
        for row, c in zip(rows, challenges):
            cause = agent.fallback_player_causes.get(c.player_id)
            output['challenges'].append(dict(building=bid, case=row['id'],
                line=c.line, counteroffer=c.counteroffer, fact_ids=c.fact_ids,
                fallback_cause=cause, from_model=cause is None,
                # Same whole-step publication-ready time, classified by origin.
                seconds=elapsed, ground_error=check_line(c.line + ' ' + c.counteroffer, c.fact_ids, dossier)))
        output['schema_failures'] += agent.schema_failures
        print(f'Challenge {bid}: {len(agent.fallback_player_ids)}/4 fallbacks; '
              f'{dict(agent.challenge_fallback_causes)}; {elapsed:.3f}s', flush=True)
        # Two verdict cases total, each scores a fit against an impossible requirement.
        judge = LiveAgent(model=model)
        started = monotonic()
        batches = await judge.verdict_batches(pitches[:2], [], dossier, city, challenges[:2])
        verdict = validate_verdict(batches, dossier=dossier, player_ids={p.player_id for p in pitches[:2]},
            round_id=f'quality-{bid}', city=city, sqft=target_sqft(dossier, select_target_floors(dossier)))
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
    lines = ['# Small paid live-quality check', '',
        f"Run: {datetime.now(timezone.utc).isoformat()}; DATA_MODE=kit; eight challenge cases and two verdict cases.", '',
        f"Challenge fallbacks: **{sum(counts.values())}/{len(challenges)}**; target ≤1/8: "
        f"{'PASS' if sum(counts.values()) <= 1 and len(challenges) == 8 else 'MISS'}.",
        f"Verdict fallbacks: **{sum(verdict_counts.values())}/{len(verdicts)}**. "
        f"Invalid schema attempts (including truncated tool JSON): {result['schema_failures']}.",
        f"Published numeric/ID grounding: {sum(c['ground_error'] is None for c in challenges + verdicts)}/{len(challenges + verdicts)}.", '',
        '| Cause | Challenge cases | Verdict cases |', '| --- | --- | --- |']
    for cause in ('timeout', 'invalid_schema', 'fact_id', 'number_match', 'claim_check', 'safety', 'budget', 'unavailable'):
        lines.append(f'| {cause} | {counts[cause]} | {verdict_counts[cause]} |')
    lines += ['', f'Run spend including retained reservations: **${spend:.6f}** (limit $0.20).',
        f"Shared ledger: **${before['total_usd']:.6f} → ${after['total_usd']:.6f}**; run cap ${ceiling:.6f}, below $2.70.",
        f"Paid requests: {len(calls)}, reconciled {sum(c['status'] == 'complete' for c in calls)}, "
        f"unconfirmed {sum(c['status'] != 'complete' for c in calls)}.", '',
        '## Latency by published origin', '',
        'These are direct LiveAgent whole-step publication-ready times, including generation, validation and any regeneration. '
        'They exclude WebSocket delivery, cumulative-prefix animation and browser rendering; they are not a measurement of first visible subtitles. '
        'Fallback timings are never counted as model timings.', '']
    for origin in (True, False):
        # Four cases share each round's batched timing; do not count them as four independent samples.
        samples = sorted({(c['building'], c['seconds']) for c in challenges if c['from_model'] == origin})
        label = 'Model challenge batches' if origin else 'Fallback challenge batches'
        lines.append(f"- {label}: " + (', '.join(f'{bid}: {seconds:.3f}s' for bid, seconds in samples) or 'not observed'))
    lines += ['', '## Verbatim model challenge lines', '']
    for c in [c for c in challenges if c['from_model']][:3]:
        lines += [f"{c['building']} / {c['case']}:", '', '> ' + c['line'], '']
    lines += ['## All cases', '', '| Building / case | Origin | Cause |', '| --- | --- | --- |']
    for c in challenges:
        lines.append(f"| {c['building']} / {c['case']} | {'model' if c['from_model'] else 'fallback'} | {c['fallback_cause'] or '—'} |")
    lines += ['', '## Verdict lines', '']
    for v in verdicts:
        lines.append(f"- {v['building']}: {v['line']} (winner {v['winner']}; {v['fallback_cause'] or 'model'}; {v['seconds']:.3f}s)")
    lines += ['', 'Private full responses and request counts: `server/state/live_quality_result.json`; rejected candidates: `server/state/live_agent.jsonl`. '
        'The original larger paid run remains in `evals/report.md`; its fallback diagnosis is in `evals/live-quality.md`.']
    (ROOT / 'evals/live-quality-check.md').write_text('\n'.join(lines) + '\n')
    return spend <= .20 + 1e-9 and after['total_usd'] <= ceiling + 1e-9 and all(c['ground_error'] is None for c in challenges + verdicts)


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
    print(f"Ledger ${before['total_usd']:.6f}; cap ${ceiling:.6f}; at most eight challenges + two verdicts.", flush=True)
    result = asyncio.run(evaluate(challenge_plan()))
    after = SpendLedger().snapshot()  # waits for bounded synchronous SDK threads
    private = ROOT / 'server/state/live_quality_result.json'
    private.parent.mkdir(parents=True, exist_ok=True)
    with os.fdopen(os.open(private, os.O_CREAT | os.O_WRONLY | os.O_TRUNC, 0o600), 'w') as stream:
        json.dump(dict(result=result, before=before['total_usd'], after=after['total_usd'], ceiling=ceiling), stream, indent=2)
    okay = report(result, before, after, ceiling)
    print(f"Report evals/live-quality-check.md; spent ${after['total_usd']-before['total_usd']:.6f}; ledger ${after['total_usd']:.6f}", flush=True)
    return 0 if okay else 1


if __name__ == '__main__':
    raise SystemExit(main())
