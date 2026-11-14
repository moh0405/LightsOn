# Phase 5 per-player latency check

Run: 2026-11-14T22:00:28.835605+00:00; DATA_MODE=kit; eight challenge cases and two verdict cases.

Challenge fallbacks: **1/8**; target ≤1/8: PASS.
Verdict fallbacks: **2/2**. Invalid schema attempts (including truncated tool JSON): 0.
Published local numeric/ID grounding: 10/10. Local checks plus model claim checks are not proof of perfect semantic accuracy; model lines require a manual audit.

| Cause | Challenge cases | Verdict cases |
| --- | --- | --- |
| timeout | 0 | 0 |
| invalid_schema | 0 | 0 |
| fact_id | 0 | 0 |
| number_match | 0 | 1 |
| claim_check | 0 | 0 |
| safety | 0 | 0 |
| budget | 1 | 1 |
| unavailable | 0 | 0 |

Run spend including retained reservations: **$0.074042** (limit $0.12).
Shared ledger: **$2.628831 → $2.702873**; run cap $2.748831, $0.30 below the configured cap.
Paid requests: 20, reconciled 20, unconfirmed 0.

## Per-player model latency

Model-only time to grounded line: **p50 2.686s / p90 4.130s** (7 players; nearest rank).
Each sample starts when that player generation task begins and ends after local grounding and any semantic claim check/regeneration, immediately before its publication callback. Fallback samples are excluded. Independent claim checks overlap other players’ generation and publication. These are direct LiveAgent measurements; WebSocket transport and browser render time are excluded. The room regression separately proves its callback emits the existing counteroffer event while another player is pending.

First grounded model callback per round: 2.405s, 2.173s.

| Building / case | Origin | Grounded model | Publication callback |
| --- | --- | --- | --- |
| 233953 / strong_fit | model | 4.091s | 4.091s |
| 233953 / impossible_area | model | 4.130s | 4.131s |
| 233953 / desire | model | 2.404s | 2.405s |
| 233953 / funny | model | 2.686s | 2.687s |
| 233899 / strong_fit | model | 2.413s | 2.413s |
| 233899 / impossible_area | model | 3.665s | 3.666s |
| 233899 / desire | model | 2.173s | 2.173s |
| 233899 / funny | fallback | not observed | 0.014s |

## Prompt cache

Observed cache tokens: 0 reads; 0 five-minute writes; 0 one-hour writes.
Challenge requests put shared rules, persona, hard limits and the fact table before a cache checkpoint, then add only pitch-specific facts. A cache capability ValidationException retries once without checkpoints inside the same reservation. Other request errors retain the reservation and use fallback. [AWS documents a 4,096-token minimum for Haiku 4.5 checkpoints](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-haiku-4-5.html); these deliberately short contexts may remain below that minimum, so zero cache usage is expected and no caching speedup is claimed. No padding or extra paid cache probe is used.

## Verbatim model challenge lines

233953 / strong_fit:

> A public community gaming studio open at night—sounds alive. But what's your area budget, kid? My typical floor gives you 22,189 square feet.

233953 / impossible_area:

> My typical floor gives you 22,189 square feet—a restaurant needs breathing room, but that's too big, kid.

233953 / desire:

> 150,365 square feet across my dark floors await your pitch—but where's the night crowd? Show me the gathering.

## All dialogue for manual audit

- 233953 / strong_fit (model): A public community gaming studio open at night—sounds alive. But what's your area budget, kid? My typical floor gives you 22,189 square feet. Counteroffer: Tell me your square footage, and I'll light up those night hours with your vision. Cites: F_233953_grossTypicalFloorSquareFeet.
- 233953 / impossible_area (model): My typical floor gives you 22,189 square feet—a restaurant needs breathing room, but that's too big, kid. Counteroffer: Show me a single-floor footprint under 22,189 sqft, and I'll light up the kitchen at night. Cites: F_233953_grossTypicalFloorSquareFeet.
- 233953 / desire (model): 150,365 square feet across my dark floors await your pitch—but where's the night crowd? Show me the gathering. Counteroffer: Light up those dark floors with evening programming: studio hours, food service, events. Make them busy after sunset. Cites: F_233953_dark_sqft.
- 233953 / funny (model): Floor 7 has 31,503 listed available square feet—but a cat café? That's theater, not tenancy. Show me the lease. Counteroffer: Cats interview guests nightly, neighbors pack the games—now *that* lights me up. What's your draw? Cites: F_233953_floor_7_available_sqft.
- 233899 / strong_fit (model): My typical floor gives you 25,529 square feet—but a gaming studio needs power, cooling, sound isolation. What's your actual footprint? Counteroffer: Show me a layout where night hours draw neighbors in—maybe a café or lounge where people linger, build community ties. Cites: F_233899_grossTypicalFloorSquareFeet.
- 233899 / impossible_area (model): My typical floor gives you 25,529 square feet—a restaurant needs way more than that. Counteroffer: Show me a restaurant concept that fits one floor. Let's make a deal. Cites: F_233899_grossTypicalFloorSquareFeet.
- 233899 / desire (model): 415,496 square feet across my dark floors await your pitch—but who's living here, who's making, who's eating? Show me the mix. Counteroffer: Map out how many residents, makers, and diners share each zone—then we talk about which dark floor fits your vision. Cites: F_233899_dark_sqft.
- 233899 / funny (budget): All right, floor 29 has 25,174 listed available square feet. Show me an area budget for your market? Counteroffer: Make room for everyday company in your market; Bring me an idea. Let's make a deal. Cites: F_233899_floor_29_available_sqft.
- Verdict 233953: My typical floor gives you 22,189 square feet. (winner p1; number_match; 7.826s). Cites: F_233953_grossTypicalFloorSquareFeet, F_233953_dark_sqft.
- Verdict 233899: I'm in. Let's give this idea a home. (winner p1; budget; 0.011s). Cites: F_233899_floor_3_available_sqft.

Private responses and request counts: `server/state/latency_result.json`; rejected candidates: `server/state/live_agent.jsonl`. The prior paid check remains in `evals/live-quality-check.md`.
