# Phase 5 per-player latency check

Run: 2026-11-14T23:01:40.435974+00:00; DATA_MODE=kit; eight challenge cases and two verdict cases.

Challenge fallbacks: **0/8**; target ≤1/8: PASS.
Verdict fallbacks: **0/2**. Invalid schema attempts (including truncated tool JSON): 0.
Published local numeric/ID grounding: 9/10. Local checks plus model claim checks are not proof of perfect semantic accuracy; model lines require a manual audit.

| Cause | Challenge cases | Verdict cases |
| --- | --- | --- |
| timeout | 0 | 0 |
| invalid_schema | 0 | 0 |
| fact_id | 0 | 0 |
| number_match | 0 | 0 |
| claim_check | 0 | 0 |
| safety | 0 | 0 |
| budget | 0 | 0 |
| unavailable | 0 | 0 |

Run spend including retained reservations: **$0.078587** (limit $0.12).
Shared ledger: **$2.702873 → $2.781460**; run cap $3.662873, $0.30 below the configured cap.
Paid requests: 23, reconciled 23, unconfirmed 0.

## Per-player model latency

Model-only time to grounded line: **p50 2.385s / p90 4.080s** (8 players; nearest rank).
Each sample starts when that player generation task begins and ends after local grounding and any semantic claim check/regeneration, immediately before its publication callback. Fallback samples are excluded. Independent claim checks overlap other players’ generation and publication. These are direct LiveAgent measurements; WebSocket transport and browser render time are excluded. The room regression separately proves its callback emits the existing counteroffer event while another player is pending.

First grounded model callback per round: 2.387s, 2.255s.

| Building / case | Origin | Grounded model | Publication callback |
| --- | --- | --- | --- |
| 233953 / strong_fit | model | 4.080s | 4.080s |
| 233953 / impossible_area | model | 4.058s | 4.059s |
| 233953 / desire | model | 2.385s | 2.387s |
| 233953 / funny | model | 2.489s | 2.491s |
| 233899 / strong_fit | model | 2.255s | 2.255s |
| 233899 / impossible_area | model | 3.802s | 3.803s |
| 233899 / desire | model | 2.277s | 2.277s |
| 233899 / funny | model | 2.321s | 2.321s |

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
- 233899 / funny (model): My typical floor gives you 25,529 square feet—cats don't need that much to judge you. What's your footprint? Counteroffer: Show me a cozy cat interview lounge that lets neighbors drop in for games and coffee. Bring me the square feet. Cites: F_233899_grossTypicalFloorSquareFeet.
- Verdict 233953: A night-lit community gaming studio fits my dark floors and my deepest wish — candidate_1's single-floor ask blows past every wall I have, darling. (winner p1; model; 4.444s). Cites: F_233953_grossTypicalFloorSquareFeet, F_233953_dark_sqft, F_233953_dark_floor_count.
- Verdict 233899: A night-hours gaming studio with a careful area budget plays well within my floors and brings people together — that's the kind of energy I want humming in my walls. A 9,000,000-square-foot single-floor restaurant is, darling, physically impossible on a planet, let alone in me. (winner p1; model; 4.708s). Cites: F_233899_grossTypicalFloorSquareFeet, F_233899_dark_floor_count, F_233899_dark_sqft.

Private responses and request counts: `server/state/latency_result.json`; rejected candidates: `server/state/live_agent.jsonl`. The prior paid check remains in `evals/live-quality-check.md`.
