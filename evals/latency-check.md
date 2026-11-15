# Phase 5 per-player latency check

Run: 2026-11-15T00:38:30.160947+00:00; DATA_MODE=kit; eight challenge cases and two verdict cases.

Challenge fallbacks: **1/8**; target ≤1/8: PASS.
Verdict fallbacks: **1/2**. Invalid schema attempts (including truncated tool JSON): 0.
Published local numeric/ID grounding: 9/10. Local checks plus model claim checks are not proof of perfect semantic accuracy; model lines require a manual audit.

| Cause | Challenge cases | Verdict cases |
| --- | --- | --- |
| timeout | 0 | 0 |
| invalid_schema | 0 | 0 |
| fact_id | 0 | 0 |
| number_match | 0 | 0 |
| claim_check | 0 | 0 |
| safety | 0 | 0 |
| budget | 1 | 1 |
| unavailable | 0 | 0 |

Run spend including retained reservations: **$0.077174** (limit $0.12).
Shared ledger: **$2.937699 → $3.014872**; run cap $3.057699, $0.30 below the configured cap.
Paid requests: 20, reconciled 20, unconfirmed 0.

## Per-player model latency

Model-only time to grounded line: **p50 2.378s / p90 4.059s** (7 players; nearest rank).
Each sample starts when that player generation task begins and ends after local grounding and any semantic claim check/regeneration, immediately before its publication callback. Fallback samples are excluded. Independent claim checks overlap other players’ generation and publication. These are direct LiveAgent measurements; WebSocket transport and browser render time are excluded. The room regression separately proves its callback emits the existing counteroffer event while another player is pending.

First grounded model callback per round: 2.330s, 1.973s.

| Building / case | Origin | Grounded model | Publication callback |
| --- | --- | --- | --- |
| 233953 / strong_fit | model | 4.059s | 4.059s |
| 233953 / impossible_area | model | 2.477s | 2.477s |
| 233953 / desire | model | 2.329s | 2.330s |
| 233953 / funny | model | 3.884s | 3.885s |
| 233899 / strong_fit | model | 2.257s | 2.257s |
| 233899 / impossible_area | model | 2.378s | 2.378s |
| 233899 / desire | model | 1.972s | 1.973s |
| 233899 / funny | fallback | not observed | 0.091s |

## Prompt cache

Observed cache tokens: 0 reads; 0 five-minute writes; 0 one-hour writes.
Challenge requests put shared rules, persona, hard limits and the fact table before a cache checkpoint, then add only pitch-specific facts. A cache capability ValidationException retries once without checkpoints inside the same reservation. Other request errors retain the reservation and use fallback. [AWS documents a 4,096-token minimum for Haiku 4.5 checkpoints](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-haiku-4-5.html); these deliberately short contexts may remain below that minimum, so zero cache usage is expected and no caching speedup is claimed. No padding or extra paid cache probe is used.

## Verbatim model challenge lines

233953 / strong_fit:

> A public community gaming studio open at night—I love the vision, kid. But where's your footprint? My typical floor gives you 22,189 square feet. [F_233953_grossTypicalFloorSquareFeet]

233953 / impossible_area:

> My typical floor gives you 22,189 square feet—nine million on one floor? Kid, that's a kitchen dream, not a pitch.

233953 / desire:

> 150,365 square feet across my dark floors await your pitch—but where's the night-time draw? Studios alone won't light me up.

## All dialogue for manual audit

- 233953 / strong_fit (model): A public community gaming studio open at night—I love the vision, kid. But where's your footprint? My typical floor gives you 22,189 square feet. [F_233953_grossTypicalFloorSquareFeet] Counteroffer: Show me which dark floor you'd light up for this studio, and I'll talk lease terms. Cites: F_233953_grossTypicalFloorSquareFeet.
- 233953 / impossible_area (model): My typical floor gives you 22,189 square feet—nine million on one floor? Kid, that's a kitchen dream, not a pitch. Counteroffer: Show me a restaurant that fits inside one of my actual floors, and we'll talk about lighting it up proper. Cites: F_233953_grossTypicalFloorSquareFeet.
- 233953 / desire (model): 150,365 square feet across my dark floors await your pitch—but where's the night-time draw? Studios alone won't light me up. Counteroffer: Show me how your gathering space anchors evening activity—food service, events, or programming that keeps people here after dark. Cites: F_233953_dark_sqft.
- 233953 / funny (model): A cat café where the cats interview the humans? Darling, that's entertainment—but where's the footprint? Show me sqft. Counteroffer: Light up one of my dark floors with your café nights; I'll host the whiskers and the crowds. Cites: F_233953_grossTypicalFloorSquareFeet.
- 233899 / strong_fit (model): 415,496 square feet across my dark floors await your pitch—but gaming needs power, cooling, sound isolation. What's your footprint? Counteroffer: Show me your area budget, and let's carve out a night-lit studio where neighbors feel at home in the building. Cites: F_233899_dark_sqft.
- 233899 / impossible_area (model): My typical floor gives you 25,529 square feet—but you're asking for 9 million. That's not a floor, that's a fantasy. Counteroffer: Bring me a restaurant idea that fits within one floor's footprint, and let's make a deal. Cites: F_233899_grossTypicalFloorSquareFeet.
- 233899 / desire (model): 415,496 square feet across my dark floors await your pitch—but who lives where makers work and eat? Counteroffer: Show me how your studio residents, makers, and night-gathering kitchen share one floor without stepping on each other. Cites: F_233899_dark_sqft.
- 233899 / funny (budget): All right, floor 29 has 25,174 listed available square feet. Show me an area budget for your market? Counteroffer: Make room for everyday company in your market; Bring me an idea. Let's make a deal. Cites: F_233899_floor_29_available_sqft.
- Verdict 233953: A community gaming studio open at night fits my bones and my mood — careful area budget, lights blazing after dark. The restaurant dreamed nine million square feet on a single floor; my typical floor gives you 22,189 square feet, darling, not a continent. (winner p1; model; 9.557s). Cites: F_233953_grossTypicalFloorSquareFeet, F_233953_dark_floor_count, F_233953_dark_sqft.
- Verdict 233899: I'm in. Let's give this idea a home. (winner p1; budget; 0.010s). Cites: F_233899_floor_3_available_sqft.

Private responses and request counts: `server/state/latency_result.json`; rejected candidates: `server/state/live_agent.jsonl`. The prior paid check remains in `evals/live-quality-check.md`.
