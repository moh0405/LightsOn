# Post-merge review: 5e433eb..7e79150 (PR #16 Phase 4 fix 3, PR #17 Phase 5 live agent)

Verdict: **pass-with-issues**. Read-only; no Bedrock calls. Kit + .env symlinked.
Ran: `uv run pytest` 356 passed / 1 skipped; `pnpm -r test` 37 passed; `evals/run.py --quick` green; git status clean.
Not run: Playwright e2e (data-mode --repeat-each=3).

## Findings (most severe first)

1. **P1 grounding false positives, number words** — grounding.py:281. Ordinary prose words are rewritten to digits
   ("no one", "one idea", "two of you" → 1 / 2) and then rejected as unsupported numbers. Reproduced offline:
   `check_line("Both of you pitched one idea for Floor 6.", [floor_6_available])` returns "Number 1 ... not supported".
   Rule: grounding must reject unsupported claims, not normal speech. Fix: only convert number words that sit next to a
   unit (sq ft / feet / stories / floors), or drop the "one" conversion.
2. **P1 grounding false positives, trailing comma** — grounding.py:252 with :301-302. `NUMBER` takes in the trailing comma
   (`"6,"`), so the floor-label check `floor_6,_` and the `say_as` findall both miss. Reproduced:
   "Floor 6, all 31,503 square feet, is yours." fails with "Number 6,". Fix: `\d+(?:,\d{3})*(?:\.\d+)?`, or strip
   `match[0]` before comparing.
3. **P2 round can stall in live mode** — rooms.py `_finish_live` only catches `CancelledError`. While live is pending,
   `ends_at` is None and no timer is armed. Any other exception (for example `ActionError` from the fallback
   `validate_verdict`, or a KeyError in `_score_mood`) kills the task silently and the room sits in CHALLENGE/VERDICT
   forever. The fake path handles the same case with an `invalid_verdict` toast and EXPLORE. Fix: add an
   `except Exception` that toasts and runs the same recovery. Rule: never stall a round; toast, don't crash.
4. **P2 schema failures misreported as spend failures, no retry** — spend.py:613. `json.loads` of the streamed tool input
   runs inside `ledger.call`'s invoke, so truncated or invalid tool JSON becomes `SpendUnavailable`. That skips
   live_agent.call's one schema retry (live_agent.py:103), is never counted in `schema_failures` (which is why the report
   shows 0), and keeps the full reservation even though usage arrived. Fix: return the raw string and let
   `schema.model_validate_json` validate it in `call`. Also check `stopReason == 'max_tokens'`.
5. **P2 the eval latency "PASS" mostly measures the fallback** — evals/report.md. The 3.9 s / 5.8 s "first grounded
   subtitle" values come from batches whose published lines are fake_agent templates ("... How does your idea fit?" is
   fake_agent.py:96), so the numbers are timeout plus fallback time, not model latency. The report should mark latency
   as not measured for those batches.
6. **P2 the cause of each fallback is never recorded** — live_agent.py:130-133, :168, :202. `fallback()` emits only
   step/tool. The grounding `reason` and the exception type are dropped, so the eval artifacts cannot show why 14 of 15
   steps fell back. Fix: add a reason code (timeout, spend, schema, number, null_fact, claim_check) to the agent_step
   summary. It must not contain model text.
7. **P3 the prompt offers null-valued facts that grounding rejects** — prompts.py:336 includes facts whose value is None
   (for example `F_233953_occupied_sqft`, `floor_22_occupied_sqft`). If the model cites them, grounding.py:273 fails with
   "Unknown or null fact ID". Fix: omit null facts from FACTS, or list them as "unknown, do not cite".
8. **P3 contract drift for `mood`** — `counteroffer.mood` and `room_state.mood` were added to protocol.ts as
   `mood?: string`, typed by hand. The PRD Contracts table (PRD:648 counteroffer) is not updated, and nothing in
   models.py / gen_types covers them. The values include `offended`/`flattered`, which are outside the
   `mood_baseline` Literal. The spec authorized carrying mood, so this is not a violation, but it should be a typed
   union of the 7 MOODS in models.py and the PRD row should be updated.
9. **P3 safety regex gaps and false positives** — live_agent.py:29-30. Real people are a list of about 10 names, so any
   other celebrity goes to the model (the claim-check prompt is the only backstop for output).
   `\bpick me\b|override` flags innocent pitches ("a pick me up coffee bar") as injection, which sets mood to offended
   and scores 0; `musk` blocks "musk candle shop". Acceptable for a demo; document it or tighten.
10. **P3 the ledger lock is held across the network request** — spend.py:443-489. After `asyncio.wait_for` times out,
    the `to_thread` worker keeps holding the flock until its read timeout, so concurrent rooms or steps serialize.
    The wait is bounded, but it adds latency to the next call.
11. **P3 a reverted main.py hangs PR #16's tests instead of failing them** — with 5e433eb main.py, the toast tests in
    test_prep_agent.py hung (stopped after more than 2 min). A hang still catches the revert, but a timeout marker
    would make it fail cleanly.

## Item 5: likely causes of the 14/15 fallbacks (hypotheses)
Evidence from the artifacts:
- Almost every published challenge line is the fake_agent template (fake_agent.py:96, "... How does your idea fit?").
  Those batches took the **exception** path (live_agent.py:171-173), not grounding.
- Only 233899/funny ("I rise 71 stories." with 3 model fact_ids) is the grounding-fallback template
  (live_agent.py:160-168).
- Of the 9 verdicts, 6 are `fallback_line` output with the model's own fact_id lists, so the model answered but its
  reason_line failed grounding twice (live_agent.py:199-202).
- 2 verdicts are fake_agent's "I'm in..." line, i.e. an exception or timeout.
- 25 requests for 15 steps means many steps never reached a claim check, which points to local check_line failures or
  timeouts.

Hypotheses, most likely first:
- H1 Timeouts (challenges). The paid run used a 3 s socket read_timeout; the report admits 4 retained reservations.
  Bedrock.__call__ (live_agent.py:57-58) also builds a new boto3 client per call, adding credential and connection cost.
  Even at 8 s, one step needs challenge (~4 s) + claim check + regeneration + claim check inside one deadline
  (live_agent.py:138, :150-170), so any regeneration effectively always times out into the fake path.
- H2 Number-word false positives, grounding.py:281 (finding 1). Verdict reason lines naturally say "one", "two of you",
  "no one"; this explains verdicts failing grounding twice even with good facts.
- H3 Trailing-comma floor labels, grounding.py:252 / :301 (finding 2).
- H4 Whole-batch coupling, live_agent.py:155-156 / grounded():112-128. One bad line out of 4 fails the batch, and
  `grounded` returns on the first failure, so the regeneration prompt (:170) names only that one reason. Line and
  counteroffer are concatenated (:156), so numbers or claims in the counteroffer ("two floors", "24/7", "after 10pm")
  also fail it.
- H5 The model repeats pitch numbers (impossible_area: "your 50,000 won't fit"). Prompt rule 10 forbids it, but
  check_line rejects them (reproduced). Natural behavior for "impossible" cases.
- H6 Truncated or invalid streamed tool JSON becomes SpendUnavailable with no retry (spend.py:613, finding 4).
  maxTokens is 900 for 4 challenges and 300 for the claim check (live_agent.py:63). A claim check over 4 lines with
  reasons can exceed 300 tokens; this would show as an exception fallback with 0 schema failures, as reported.
- H7 Strict ClaimCheck (grounding.py:261) with a required `reason: str`: `null` for supported lines fails validation.
  The report shows 0 schema attempts, so this is less likely unless it was hidden by H6.
- H8 Null facts in the prompt (prompts.py:336, finding 7).
- H9 Estimate rule, grounding.py:278. Citing `vexcel_detection_car` (an estimate) anywhere requires "looks like"
  anywhere in the line.

## Checked and fine
- (1) PR #16. Fiction lexicon and possession: reverting persona.py fails 21 uncited-claim tests plus 6
  horizontal-height tests. Height binding: `_vertical`, tested both ways. Equality boundaries: mutating each of the 4
  `> cap` to `>=` (persona.py:451/453/455/457) fails 1/8/1/3 tests. Prep toasts, scout ownership, HTTP floor rebuild:
  reverting prep_agent.py fails 5 tests. Shipped Esperson persona validates. data-mode.spec isolation fixture is present
  (not run).
- (2) Model proposes, server decides: live results go through validate_verdict (rooms.py `_finish_live`); the server
  recomputes the winner; floors come from the server. Pitches are `<pitch player=.. revision=..>` with html.escape
  (prompts.py:346). Grounding has fact-id existence, number/unit checks, a batched claim check, one regeneration and a
  say_as template fallback. Estimates get "looks like" (grounding.py:278, :319). Only fully grounded lines are streamed
  (as cumulative prefixes on the existing counteroffer event, no new event). Timeouts of 8 s / 12 s fall back to
  fake_agent; AGENT_MODE defaults to fake. PRD deviation: there are no real token deltas (tool JSON is buffered); this
  is acknowledged and safe.
- (3) Injection is screened locally, scored 0, mood set to offended, answered with a gentle roast line. Unsafe content
  gets the refusal line and is never sent to the model. Generated output is re-screened (live_agent.py:118). Verdict
  footer "Game character. Not a feasibility assessment." is in RoundOverlays ScoreCard. No contacts in safe_facts.
- (4) spend.py: a single boundary (MeteredClient). The stream is metered under the same reservation; reconciliation
  needs usage from the metadata event; a broken stream, timeout or exception keeps the reservation (conservative). Cap
  ≤ $3 is checked under flock before every call; unpriced models, service tiers and media are refused. The only boto3
  use is wrapped by it; CappedBedrockConverse._stream is refused. The eval lowers the cap via env and never resets the
  ledger.
- (6) Mood: mood_after steps ±1 at ≥7 / ≤3; injection → offended. Mood is carried in counteroffer, room_state and
  intro.mood after the verdict, persisted and restored; the store reducer is tested. See finding 8 for typing/PRD drift.
- Non-negotiables in the diff: no "vacant" in output (it is a grounding reject), no contacts, no `any` in the changed TS.
