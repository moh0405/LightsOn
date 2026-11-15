# Phase 5 per-player latency check

Run: 2026-11-15T09:03:13.570424+00:00; DATA_MODE=kit; eight challenge cases and two verdict cases.

Challenge fallbacks: **5/8**; target ≤1/8: MISS.
Verdict fallbacks: **2/2**. Invalid schema attempts (including truncated tool JSON): 0.
Published local numeric/ID grounding: 10/10. Local checks plus model claim checks are not proof of perfect semantic accuracy; model lines require a manual audit.

| Cause | Challenge cases | Verdict cases |
| --- | --- | --- |
| timeout | 0 | 0 |
| invalid_schema | 0 | 0 |
| fact_id | 0 | 0 |
| number_match | 0 | 0 |
| claim_check | 0 | 0 |
| safety | 0 | 0 |
| budget | 5 | 2 |
| unavailable | 0 | 0 |

Run spend including retained reservations: **$0.069433** (limit $0.12).
Shared ledger: **$3.069260 → $3.138692**; run cap $3.189260, $0.30 below the configured cap.
Paid requests: 10, reconciled 10, unconfirmed 0.

## Per-player model latency

Model-only time to grounded line: **p50 3.131s / p90 3.301s** (3 players; nearest rank).
Each sample starts when that player generation task begins and ends after local grounding and any semantic claim check/regeneration, immediately before its publication callback. Fallback samples are excluded. Independent claim checks overlap other players’ generation and publication. These are direct LiveAgent measurements; WebSocket transport and browser render time are excluded. The room regression separately proves its callback emits the existing counteroffer event while another player is pending.

First grounded model callback per round: 3.063s, 3.145s.

| Building / case | Origin | Grounded model | Publication callback |
| --- | --- | --- | --- |
| 233953 / strong_fit | fallback | not observed | 0.135s |
| 233953 / impossible_area | model | 3.053s | 3.063s |
| 233953 / desire | model | 3.301s | 3.310s |
| 233953 / funny | fallback | not observed | 1.052s |
| 233899 / strong_fit | fallback | not observed | 0.027s |
| 233899 / impossible_area | fallback | not observed | 0.027s |
| 233899 / desire | model | 3.131s | 3.145s |
| 233899 / funny | fallback | not observed | 0.028s |

## Prompt cache

Observed cache tokens: 0 reads; 38815 five-minute writes; 0 one-hour writes.
Challenge requests put shared rules, persona, hard limits and the fact table before a cache checkpoint, then add only pitch-specific facts. A cache capability ValidationException retries once without checkpoints inside the same reservation. Other request errors retain the reservation and use fallback. [AWS documents a 4,096-token minimum for Haiku 4.5 checkpoints](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-haiku-4-5.html); these deliberately short contexts may remain below that minimum, so zero cache usage is expected and no caching speedup is claimed. No padding or extra paid cache probe is used.

## Verbatim model challenge lines

233953 / impossible_area:

> My typical floor gives you 22,189 square feet—nine million is a fantasy, kid.

233953 / desire:

> Floor 6 has 31,503 listed available square feet—but live-make-gather needs parking. My ratio is 0.89 spaces per thousand. Show me the footprint.

233899 / desire:

> 17 dark floors, darling—but I've never hosted live-in makers. How many residents, studios, and kitchen sqft?

## All dialogue for manual audit

- 233953 / strong_fit (budget): Sugar, my typical floor gives you 22,189 square feet. What footprint would your shared space need? Counteroffer: Give your community space a reason to buzz after sunset. What do you say? Cites: F_233953_grossTypicalFloorSquareFeet.
- 233953 / impossible_area (model): My typical floor gives you 22,189 square feet—nine million is a fantasy, kid. Counteroffer: Show me a real footprint under 22,189 sqft and I'll light up a floor for your kitchen. Cites: F_233953_grossTypicalFloorSquareFeet.
- 233953 / desire (model): Floor 6 has 31,503 listed available square feet—but live-make-gather needs parking. My ratio is 0.89 spaces per thousand. Show me the footprint. Counteroffer: Sketch a mixed-use layout: how many residents, makers, and diners per night? That's when I want to glow. Cites: F_233953_floor_6_available_sqft, F_233953_parkingRatio.
- 233953 / funny (budget): Darling, floor 6 has 31,503 listed available square feet. Show me an area budget for your market? Counteroffer: Give your market a reason to buzz after sunset. What do you say? Cites: F_233953_floor_6_available_sqft.
- 233899 / strong_fit (budget): Hotshot, my typical floor gives you 25,529 square feet. What footprint would your shared space need? Counteroffer: Give people a reason to talk about your community space. What do you say? Cites: F_233899_grossTypicalFloorSquareFeet.
- 233899 / impossible_area (budget): For a typical single-floor pitch, fit within 25,529 square feet; show me your area budget. Counteroffer: Give people a reason to talk about your market. What do you say? Cites: F_233899_grossTypicalFloorSquareFeet.
- 233899 / desire (model): 17 dark floors, darling—but I've never hosted live-in makers. How many residents, studios, and kitchen sqft? Counteroffer: Show me a floor plan where residents dream of the night gathering—then we talk lease. Cites: F_233899_dark_floor_count.
- 233899 / funny (budget): All right, floor 17 has 25,129 listed available square feet. Show me an area budget for your market? Counteroffer: Give people a reason to talk about your market. What do you say? Cites: F_233899_floor_17_available_sqft.
- Verdict 233953: I'm in. Let's give this idea a home. (winner p1; budget; 0.017s). Cites: F_233953_floor_6_available_sqft.
- Verdict 233899: I'm in. Let's give this idea a home. (winner p1; budget; 0.011s). Cites: F_233899_floor_3_available_sqft.

Private responses and request counts: `server/state/latency_result.json`; rejected candidates: `server/state/live_agent.jsonl`. The prior paid check remains in `evals/live-quality-check.md`.
