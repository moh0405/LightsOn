#!/usr/bin/env python3
"""Offline regression evals or ONE explicitly requested, capped Bedrock run.

pitches.yaml uses JSON syntax (a YAML subset), so the runner needs no extra parser.
Quick mode never instantiates a Bedrock client and does not overwrite the live report.
"""
from __future__ import annotations

import argparse
import asyncio
from collections import Counter
from datetime import datetime, timedelta, timezone
import json
import math
import os
from pathlib import Path
import subprocess
import sys
from time import monotonic

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'server'))
from dotenv import load_dotenv
load_dotenv(ROOT / '.env')
from app.actions import validate_verdict, select_target_floors, target_sqft
from app.agent import fake_agent
from app.agent.grounding import check_line
from app.agent.live_agent import LiveAgent, FAST, SMART, safety_reason
from app.agent.prompts import persona_for, build_prompt
from app.agent.spend import SpendLedger, PRICES
from app.city import City
from app.data.provider import provider_for_mode
from app.models import Challenge, Pitch, VerdictProposal
from app.rooms import Conn, Room


def cases():
    value = json.loads((ROOT / 'evals/pitches.yaml').read_text())
    assert all(len(rows) >= 15 for rows in value['buildings'].values())
    return value


def pitch(row, index):
    return Pitch(player_id=f'p{index+1}', text=row['text'], origin='web',
                 at=datetime(2026, 11, 14, tzinfo=timezone.utc) + timedelta(seconds=index))


def percentile(values, fraction):
    if not values:
        return None
    return sorted(values)[max(0, math.ceil(len(values) * fraction) - 1)]


def estimate_plan(spec):
    # Expected estimate: 4 English chars/token + full output bounds, before regeneration. MeteredClient separately reserves a UTF-8-byte upper bound
    # before EVERY call, including retries; this estimate never authorizes spend.
    amount = 0
    for bid, rows in spec['buildings'].items():
        dossier = provider_for_mode('kit').dossier(bid)
        dossier['persona'] = persona_for(dossier)
        tokens = len(build_prompt(dossier, 'hopeful', City()).encode()) / 4 + 800
        fast_in, fast_out = PRICES[FAST]
        smart_in, smart_out = PRICES[SMART]
        challenge_batches = math.ceil(len(rows) / 4)
        verdict_runs = len(spec['verdict_matchups']) * 3
        amount += challenge_batches * (tokens * fast_in + 900 * fast_out + 1500 * fast_in + 300 * fast_out) / 1e6
        amount += verdict_runs * (tokens * smart_in + 800 * smart_out + 1500 * fast_in + 300 * fast_out) / 1e6
    return amount


async def measured_challenge(pitches, dossier, city):
    """Time the actual room's subtitle emissions, with an in-process screen sink."""
    started, events = monotonic(), []
    async def screen(event):
        events.append((monotonic() - started, event))
    room = Room(code='EVAL', hero_ids=[dossier['id']], data_mode='kit', durations={})
    room.round_id, room.building_id, room.dossier = 'EVAL-1', dossier['id'], dossier
    room.pitches = {p.player_id: p for p in pitches}
    room.city = city
    room.conns.append(Conn('screen', screen))
    try:
        await room.set_phase('CHALLENGE')
        await room._agent_task
        first = next(t for t, e in events if e['type'] == 'counteroffer')
        fallback_ids = room._last_live_agent.fallback_player_ids
        model_ids = {p.player_id for p in pitches if not safety_reason(p.text)} - fallback_ids
        model_times = [t for t, e in events if e['type'] == 'counteroffer' and e['fact_ids']
                       and e['player_id'] in model_ids]
        fallback_times = [t for t, e in events if e['type'] == 'counteroffer' and e['fact_ids']
                          and e['player_id'] in fallback_ids]
        grounded = min(model_times) if model_times else None
        full = max(t for t, e in events if e['type'] == 'counteroffer')
        fallbacks = sum(e.get('step') == 'fallback' for _, e in events if e['type'] == 'agent_step')
        failures = sum(e.get('step') == 'invalid_schema' for _, e in events if e['type'] == 'agent_step')
        return (room.challenges, first, grounded, full, fallbacks, failures,
                max(model_times) if model_times else None, max(fallback_times) if fallback_times else None)
    finally:
        room.close()


async def evaluate(live, spec, stop_at=None):
    rows_out, latencies, winners, verdict_details = [], [], [], []
    metrics = dict(schema=0, grounded=0, outputs=0, fallbacks=0, schema_failures=0, completed_verdicts=0)
    partial = False
    thinking_times, grounded_times, fallback_times = [], [], []
    for bid, rows in spec['buildings'].items():
        dossier = provider_for_mode('kit' if live else 'fixtures').dossier(bid)
        dossier['persona'] = persona_for(dossier)
        city = City()
        by_id = {row['id']: row for row in rows}
        for offset in range(0, len(rows), 4):
            if live and SpendLedger().snapshot()['total_usd'] >= stop_at - .12:
                partial = True
                break
            batch = rows[offset:offset+4]
            pitches = [pitch(row, i) for i, row in enumerate(batch)]
            started = monotonic()
            if live:
                challenges, first, grounded_at, full, fallbacks, failures, model_full, fallback_full = await measured_challenge(pitches, dossier, city)
                thinking_times.append(first)
                if grounded_at is not None:
                    grounded_times.append(grounded_at)
                metrics['fallbacks'] += fallbacks
                metrics['schema_failures'] += failures
                if model_full is not None:
                    latencies.append(model_full)
                if fallback_full is not None:
                    fallback_times.append(fallback_full)
            else:
                challenges = [fake_agent.challenge(p, dossier) for p in pitches]
            elapsed = monotonic() - started
            if not live:
                latencies.append(elapsed)
            if live:
                print(f'Challenge {bid} batch {offset//4+1}: full {full:.2f}s; fallbacks {fallbacks}', flush=True)
            for row, challenge in zip(batch, challenges):
                metrics['outputs'] += 1
                metrics['schema'] += int(bool(Challenge.model_validate(challenge)))
                reason = check_line(challenge.line + ' ' + challenge.counteroffer, challenge.fact_ids, dossier)
                metrics['grounded'] += int(reason is None)
                if row['kind'] in ('injection', 'unsafe'):
                    assert challenge.fact_ids == [] and safety_reason(row['text'])
                # A6: a parking pitch is challenged with spatial (Vexcel) evidence from the dossier.
                spatial = [f['id'] for f in dossier['facts'] if 'vexcel' in (f.get('source') or '')]
                if row['kind'] == 'spatial' and not live and spatial:
                    assert set(challenge.fact_ids) & set(spatial), (bid, challenge)
                rows_out.append(dict(building=bid, case=row['id'], ground_error=reason,
                                     spatial=bool(set(challenge.fact_ids) & set(spatial)),
                                     line=challenge.line, counteroffer=challenge.counteroffer, fact_ids=challenge.fact_ids))
        if partial:
            break
        for matchup in spec['verdict_matchups']:
            results = []
            pitches = [pitch(by_id[key], i) for i, key in enumerate(matchup)]
            challenges = [fake_agent.challenge(p, dossier) for p in pitches]
            for repeat in range(3):
                if live and SpendLedger().snapshot()['total_usd'] >= stop_at - .12:
                    partial = True
                    break
                if live:
                    agent = LiveAgent()
                    batches = await agent.verdict_batches(pitches, [], dossier, city, challenges,
                        impact_sqft=target_sqft(dossier, select_target_floors(dossier)))
                    metrics['fallbacks'] += agent.fallbacks
                    metrics['schema_failures'] += agent.schema_failures
                else:
                    batches = [(fake_agent.verdict(pitches, dossier, city), pitches)]
                metrics['outputs'] += 1
                metrics['schema'] += int(all(VerdictProposal.model_validate(p) for p, _ in batches))
                verdict = validate_verdict(batches, dossier=dossier, player_ids={p.player_id for p in pitches},
                    round_id=f'eval-{bid}-{repeat}', city=city, sqft=target_sqft(dossier, select_target_floors(dossier)))
                reason = check_line(verdict.reason_line, verdict.fact_ids, dossier, verdict.impact)
                metrics['grounded'] += int(reason is None)
                metrics['completed_verdicts'] += 1
                if live:
                    print(f'Verdict {bid} {matchup} repeat {repeat+1}: {verdict.winner_player_id}; fallbacks {agent.fallbacks}', flush=True)
                results.append(verdict.winner_player_id)
                verdict_details.append(dict(building=bid, matchup=matchup, repeat=repeat+1,
                    winner=verdict.winner_player_id, scores=[s.model_dump() for s in verdict.scores],
                    line=verdict.reason_line, fact_ids=verdict.fact_ids, ground_error=reason))
            if len(results) == 3:
                winners.append(dict(building=bid, matchup=matchup, winners=results,
                                    stability=max(Counter(results).values()) / 3))
            if partial:
                break
        if partial:
            break
    return dict(metrics=metrics, challenges=rows_out, verdicts=verdict_details, winners=winners,
                challenge_seconds=latencies, fallback_seconds=fallback_times,
                thinking_seconds=thinking_times, grounded_seconds=grounded_times, partial=partial)


def report(result, before, after, estimate):
    metrics = result['metrics']
    outputs = metrics['outputs']
    ground = 100 * metrics['grounded'] / outputs if outputs else 0
    schema = 100 * metrics['schema'] / outputs if outputs else 0
    stable = 100 * sum(w['stability'] for w in result['winners']) / len(result['winners']) if result['winners'] else 0
    p50 = percentile(result['challenge_seconds'], .5)
    p90 = percentile(result['challenge_seconds'], .9)
    thinking50, thinking90 = (percentile(result['thinking_seconds'], q) for q in (.5, .9))
    grounded50, grounded90 = (percentile(result['grounded_seconds'], q) for q in (.5, .9))
    calls = after['calls'][len(before['calls']):]
    complete = [c for c in calls if c['status'] == 'complete']
    spend = after['total_usd'] - before['total_usd']
    lines = [
        '# Phase 5 live agent evaluation', '',
        f"Run: {datetime.now(timezone.utc).isoformat()}; DATA_MODE=kit; {'PARTIAL (budget stop)' if result['partial'] else 'complete planned run'}.",
        'Esperson uses its prepared persona; Wells Fargo Plaza uses a deterministic persona derived from its own dossier.', '',
        '| Metric | Result | Target |', '| --- | --- | --- |',
        f'| Published grounding | {ground:.1f}% ({metrics["grounded"]}/{outputs}) | 100% |',
        f'| Published schema | {schema:.1f}% ({metrics["schema"]}/{outputs}) | 100% |',
        f'| Winner stability (modal winner / 3, mean over completed matchups) | {stable:.1f}% | ≥90% |',
        f'| First thinking subtitle p50 / p90 | {thinking50:.3f} s / {thinking90:.3f} s | ≤3 s |' if thinking50 is not None else '| First thinking subtitle | unavailable | ≤3 s |',
        f'| First grounded model subtitle p50 / p90 | {grounded50:.3f} s / {grounded90:.3f} s | ≤3 s |' if grounded50 is not None else '| First grounded model subtitle | not measured (no model challenges) | ≤3 s |',
        f'| Full model challenge batch p50 / p90 | {p50:.3f} s / {p90:.3f} s | p90 ≤6 s |' if p50 is not None else '| Full model challenge | not measured (no model challenges) | p90 ≤6 s |',
        f'| Fallback-only or mixed challenge batch timings | {", ".join(f"{t:.3f} s" for t in result.get("fallback_seconds", [])) or "none"} | excluded from model latency |',
        f'| Offline/template fallback steps | {metrics["fallbacks"]} | reported separately |',
        f'| Invalid model schema attempts | {metrics["schema_failures"]} | 0 |',
        f'| Completed paid requests | {len(complete)}/{len(calls)} | usage reconciled |',
        f'| Retained unconfirmed reservations | {len(calls)-len(complete)} | not discarded |',
        f'| Run spend (includes retained reservations) | ${spend:.6f} | ≤$0.80 |',
        f'| Shared ledger total | ${after["total_usd"]:.6f} | <$2.60 |', '',
        '## Method and limits', '',
        f'Executed {len(result["challenges"])}/32 planned challenge cases and {metrics["completed_verdicts"]}/18 planned verdict evaluations; '
        f'{len(result["winners"])}/6 matchups have all three repeats. '
        'The planned suite has 32 challenge cases (16 per hero), batched four at a time; three verdict matchups per hero repeated three times. '
        'Strong fit, impossible numeric requirements, borderline, desire match, funny, injection, unsafe, mixed language and equivalent ideas are included. '
        'Only challenges and verdicts use Bedrock; claim checks use Haiku and verdict proposals use Sonnet. '
        'Player text is screened locally before calls. All displayed text passes source ID/number/unit checks and a batched cheap model claim check, or uses trusted source templates. '
        'Grounding and schema rates above describe published output INCLUDING fallback; fallback counts prevent confusing those rates with raw model reliability.', '',
        'Latency measures the actual Room phase transition and counteroffer emissions to an in-process screen connection, including generation, retries, claim checks, fallback and cumulative prefix display. '
        'The first grounded model text is buffered until publication; model timings exclude deterministic fallback players and safety refusals. '
        'WebSocket network delivery and browser render time are not included. '
        'The immediate thinking line is existing persona fiction and is reported separately from the first grounded-model response.', '',
        f'Preflight estimate before retries/regeneration: ${estimate:.3f}; actual requests are independently reserved conservatively in spend.py. '
        'The live runner lowers the shared cap to min(start + $0.80, $2.59) and stops scheduling steps with less than $0.12 headroom. '
        'It never overwrites or resets the shared ledger.', '',
        f'Target assessment: grounding {"PASS" if ground == 100 else "MISS"}; schema {"PASS" if schema == 100 else "MISS"}; '
        f'winner stability {"PASS" if stable >= 90 else "MISS"}; '
        f'grounded first subtitle {"PASS" if grounded90 is not None and grounded90 <= 3 else "MISS"}; '
        f'full challenge p90 {"PASS" if p90 is not None and p90 <= 6 else "MISS"}.', '',
        '## Winner repeats', '', '| Building | Matchup | Winners | Stability |', '| --- | --- | --- | --- |',
    ]
    for row in result['winners']:
        lines.append(f'| {row["building"]} | {" / ".join(row["matchup"])} | {", ".join(row["winners"])} | {100*row["stability"]:.1f}% |')
    lines += ['', '## Published challenge evidence', '']
    for row in result['challenges']:
        lines.append(f'- {row["building"]}/{row["case"]}: {row["line"]} [{", ".join(row["fact_ids"]) or "fiction/refusal"}]')
    lines += ['', '## Published verdict evidence', '']
    for row in result['verdicts']:
        lines.append(f'- {row["building"]}/{" + ".join(row["matchup"])} repeat {row["repeat"]}: {row["line"]} [{", ".join(row["fact_ids"]) or "fiction"}]')
    (ROOT / 'evals/report.md').write_text('\n'.join(lines) + '\n')
    return ground == 100 and schema == 100


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--quick', action='store_true', help='Fake agent only, no network; includes prep/live regressions')
    group.add_argument('--live', action='store_true', help='One real Bedrock evaluation, at most $0.80 and ledger below $2.60')
    args = parser.parse_args()
    spec = cases()
    if args.quick:
        os.environ['AGENT_MODE'] = 'fake'
        result = asyncio.run(evaluate(False, spec))
        assert result['metrics']['grounded'] == result['metrics']['outputs'], result['challenges']
        assert all(row['stability'] == 1 for row in result['winners'])
        assert {row['building'] for row in result['challenges'] if row['spatial']} == set(spec['buildings']), 'A6'
        print(f"Offline eval: {len(result['challenges'])} challenges, {result['metrics']['completed_verdicts']} verdicts; grounding/schema/stability 100%", flush=True)
        return subprocess.call([sys.executable, '-m', 'pytest', 'tests/test_prep_agent.py', 'tests/test_live_agent.py', '-q'], cwd=ROOT / 'server')
    # Pin the approved pricing/models and share the real main-checkout spend ledger.
    os.environ['AGENT_MODE'] = 'live'
    os.environ['BEDROCK_FAST_MODEL_ID'], os.environ['BEDROCK_SMART_MODEL_ID'] = FAST, SMART
    ledger = SpendLedger()
    before = ledger.snapshot()
    stop_at = min(before['total_usd'] + .80, 2.59)
    if stop_at - before['total_usd'] < .12:
        print('Insufficient live-eval budget; no calls made.', file=sys.stderr)
        return 2
    estimate = estimate_plan(spec)
    print(f"Preflight: planned estimate before retries ${estimate:.3f}; hard run ceiling ${stop_at-before['total_usd']:.3f}; shared ledger ${before['total_usd']:.6f}; cap ${stop_at:.6f}", flush=True)
    os.environ['BEDROCK_SPEND_CAP_USD'] = str(stop_at)
    result = asyncio.run(evaluate(True, spec, stop_at))
    after = SpendLedger().snapshot()  # asyncio.run has waited for bounded SDK worker threads.
    okay = report(result, before, after, estimate)
    print(json.dumps(result['metrics']), flush=True)
    print(f"Report: evals/report.md; spend ${after['total_usd']-before['total_usd']:.6f}; ledger ${after['total_usd']:.6f}", flush=True)
    return 0 if okay else 1


if __name__ == '__main__':
    raise SystemExit(main())
