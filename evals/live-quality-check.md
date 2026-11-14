# Small paid live-quality check

Run: 2026-11-14T20:22:42.313472+00:00; DATA_MODE=kit; eight challenge cases and two verdict cases.

Challenge fallbacks: **4/8**; target ≤1/8: MISS.
Verdict fallbacks: **0/2**. Invalid schema attempts (including truncated tool JSON): 0.
Published numeric/ID grounding: 10/10.

**Manual semantic audit found an unsupported history claim in one model challenge:**
Esperson's funny response said it had been dark “for years,” citing only the current
dark-floor count. The cheap claim checker accepted it. Numeric/ID validation is
not semantic grounding; this run does **not** establish 100% grounded model dialogue.
The final code rejects this retained candidate deterministically, with kit and
fixture regressions; that fix and the stronger prompt were made **after this paid
check and were not re-evaluated on Bedrock**. No second paid run was made.

| Cause | Challenge cases | Verdict cases |
| --- | --- | --- |
| timeout | 3 | 0 |
| invalid_schema | 0 | 0 |
| fact_id | 0 | 0 |
| number_match | 1 | 0 |
| claim_check | 0 | 0 |
| safety | 0 | 0 |
| budget | 0 | 0 |
| unavailable | 0 | 0 |

Final fallback causes above count published cases, not individual failed attempts.
The retained attempts explain why regeneration was needed:

| Published fallback | First rejection | Terminal cause |
| --- | --- | --- |
| Esperson / impossible_area | Repeated unsupported pitch quantity in dialogue | Same number-match failure on regeneration |
| Wells / impossible_area | Repeated unsupported pitch quantity in dialogue | Regeneration timed out |
| Wells / desire | “one floor” proposed as a plan was read as an existing count; a second floor-area value also lacked its citation | Regeneration timed out |
| Wells / funny | No cited constraint | Regeneration timed out |

Across challenge and verdict attempts there were six number-match rejections and
two missing-constraint-ID rejections. Both verdicts regenerated successfully.
The post-check offline fix treats a hypothetical “start on one floor” as a plan,
while retaining checks for asserted existing counts and uncited area values.

Run spend including retained reservations: **$0.116304** (limit $0.20).
Shared ledger: **$2.439931 → $2.556235**; run cap $2.639931, below $2.70.
Paid requests: 13, reconciled 12, unconfirmed 1.

## Latency by published origin

These are direct LiveAgent whole-step publication-ready times, including generation, validation and any regeneration. They exclude WebSocket delivery, cumulative-prefix animation and browser rendering; they are not a measurement of first visible subtitles. Fallback timings are never counted as model timings.

- Model challenge batches: 233899: 8.003s, 233953: 7.947s
- Fallback challenge batches: 233899: 8.003s, 233953: 7.947s

## Verbatim model challenge lines

233953 / strong_fit:

> A gaming studio at night—music to my ears, but show me you've counted the square feet. My typical floor gives you 22,189 square feet.

233953 / desire:

> Living, making, and gathering at night—now that's a plot twist I've been waiting for. But 150,365 square feet across my dark floors is all I have to give.

233899 / strong_fit:

> A gaming studio sounds sharp—but my typical floor gives you 25,529 square feet. What's your footprint, and how does night-time traffic fit the neighborhood?

These three quotes exclude the unsupported historical claim disclosed above; the
case counts and original private artifact still include it as model-origin dialogue.

## All cases

| Building / case | Origin | Cause |
| --- | --- | --- |
| 233953 / strong_fit | model | — |
| 233953 / impossible_area | fallback | number_match |
| 233953 / desire | model | — |
| 233953 / funny | model | — |
| 233899 / strong_fit | model | — |
| 233899 / impossible_area | fallback | timeout |
| 233899 / desire | fallback | timeout |
| 233899 / funny | fallback | timeout |

## Verdict lines

- 233953: A nighttime community gaming studio fits my dark hours and my soul — candidate_1's single-floor restaurant dream shattered against a wall of arithmetic I simply cannot ignore. (winner p1; model; 7.724s)
- 233899: candidate_0 brought a careful area budget and a community heartbeat after dark — that's the kind of pitch that lights me up. candidate_1 asked for a floor bigger than my entire building; my typical floor looks like 25,529 square feet, and that number doesn't survive the math. (winner p1; model; 8.352s)

Private full responses and request counts: `server/state/live_quality_result.json`; rejected candidates: `server/state/live_agent.jsonl`. The original larger paid run remains in `evals/report.md`; its fallback diagnosis is in `evals/live-quality.md`.
