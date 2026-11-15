# Challenge grounding confirmation — missed

**This single paid confirmation did not pass.** It ran commit `448e27a` after the initial offline gates: 583 server tests passed (1 skipped), 62 web tests plus messaging passed, 313 quick-eval tests passed, 38 browser tests passed, and the production build passed. The run produced two challenge fallbacks and two verdict fallbacks. No second paid run was made.

**Spend overrun:** the exact delta was **$0.1247433**, exceeding the authorized **$0.12** by **$0.0047433**. The shared ledger moved **$2.8129552 → $2.9376985**. The old runner allowed $0.96 of reservation headroom and checked the $0.12 criterion only afterward; that did not enforce the requested limit. All 28 requests reconciled; no reservation remains unconfirmed. The overrun is not rounded down or treated as a passing result.

## Offline follow-up after this run

The offline follow-up addresses the observed failures without further paid calls:

- Normalize `9 million`, `nine million`, `9M`, `1.5 billion`, and `half a million` to their full values before grounding. The exact rejected “nine million on one floor” and “9 million on one floor” lines now pass numeric checks against the player's own pitch; building claims and wrong units still fail.
- Request claim results with explicit input indices. Missing, malformed, or duplicate results are unsupported claims and trigger one proposal regeneration; unrelated extra indices do not invalidate a correctly checked line. An unparsed claim result never authorizes publication or becomes a schema failure of the whole verdict.
- Limit the eval ledger ceiling to starting spend plus $0.12, including outstanding reservations, and the existing configured-cap margin. A fake-ledger test holds a reservation and proves the next over-budget request is refused before invocation or ledger insertion. Conservative reservations may therefore cause budget fallbacks.

These fixes are **offline-verified only**. They do not revise the paid outcome below or establish improved live quality. The initial smoke regressions also cover Atlas's exact bare `40,000` repetition, Pixel's missing floor-plate citation, ambiguous/no-match citation failures, and trace-only ordinary fallbacks while real errors retain toasts.

Final offline gates: 624 server tests passed (1 skipped) with the real root `.env`, cap `3.00`, and both kit/fixtures; 62 web tests plus messaging passed; 354 quick-eval tests passed; 38 full browser tests passed in 5.2 minutes on ports `20801`/`17874`; production build passed. The final suffix regression also rejects lowercase `9m` (potential meters) instead of interpreting it as nine million.

## Paid observations (before the follow-up)

Run: 2026-11-15T00:26:35.893582+00:00; DATA_MODE=kit; eight challenge cases and two verdict cases.

Challenge fallbacks: **2/8**; target ≤1/8: MISS.
Verdict fallbacks: **2/2**, both caused by claim-check count mismatches classified as `invalid_schema` by the old validator. Invalid JSON/tool-schema attempts: 0.
Published local numeric/ID grounding: 10/10. Local checks plus model claim checks are not proof of perfect semantic accuracy; model lines require a manual audit.

| Cause | Challenge cases | Verdict cases |
| --- | --- | --- |
| timeout | 0 | 0 |
| invalid_schema | 0 | 2 |
| fact_id | 0 | 0 |
| number_match | 2 | 0 |
| claim_check | 0 | 0 |
| safety | 0 | 0 |
| budget | 0 | 0 |
| unavailable | 0 | 0 |

Run spend including retained reservations: **$0.124743** (limit $0.12).
Shared ledger: **$2.812955 → $2.937699**; old run cap $3.772955 (configured cap $4.50; minimum margin $0.30).
Paid requests: 28, reconciled 28, unconfirmed 0.

## Per-player model latency

Model-only time to grounded line: **p50 2.583s / p90 4.702s** (6 players; nearest rank).
Each sample starts when that player generation task begins and ends after local grounding and any semantic claim check/regeneration, immediately before its publication callback. Fallback samples are excluded. Independent claim checks overlap other players’ generation and publication. These are direct LiveAgent measurements; WebSocket transport and browser render time are excluded. The room regression separately proves its callback emits the existing counteroffer event while another player is pending.

First grounded model callback per round: 2.584s, 2.342s.

| Building / case | Origin | Grounded model | Publication callback |
| --- | --- | --- | --- |
| 233953 / strong_fit | model | 4.251s | 4.252s |
| 233953 / impossible_area | fallback | not observed | 3.566s |
| 233953 / desire | model | 2.583s | 2.584s |
| 233953 / funny | model | 4.188s | 4.189s |
| 233899 / strong_fit | model | 2.342s | 2.342s |
| 233899 / impossible_area | fallback | not observed | 4.948s |
| 233899 / desire | model | 4.702s | 4.703s |
| 233899 / funny | model | 2.363s | 2.364s |

## Prompt cache

Observed cache tokens: 0 reads; 0 five-minute writes; 0 one-hour writes.
Challenge requests put shared rules, persona, hard limits and the fact table before a cache checkpoint, then add only pitch-specific facts. A cache capability ValidationException retries once without checkpoints inside the same reservation. Other request errors retain the reservation and use fallback. [AWS documents a 4,096-token minimum for Haiku 4.5 checkpoints](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-haiku-4-5.html); these deliberately short contexts may remain below that minimum, so zero cache usage is expected and no caching speedup is claimed. No padding or extra paid cache probe is used.

## Verbatim model challenge lines

233953 / strong_fit:

> A public community gaming studio open at night—I love the vision, kid. But where's your footprint? My typical floor gives you 22,189 square feet. [F_233953_grossTypicalFloorSquareFeet]

233953 / desire:

> 150,365 square feet across my dark floors await your pitch—but where's the night-time draw? Studios alone won't light me up.

233953 / funny:

> A cat café where the cats interview the humans? Darling, that's entertainment—but where's the footprint? Show me sqft.

## All dialogue for manual audit

- 233953 / strong_fit (model): A public community gaming studio open at night—I love the vision, kid. But where's your footprint? My typical floor gives you 22,189 square feet. [F_233953_grossTypicalFloorSquareFeet] Counteroffer: Show me which dark floor you'd light up for this studio, and I'll talk lease terms. Cites: F_233953_grossTypicalFloorSquareFeet.
- 233953 / impossible_area (number_match): For a typical single-floor pitch, fit within 22,189 square feet; show me your area budget. Counteroffer: Give your market a reason to buzz after sunset; Pitch like you mean it, kid — I have been waiting long enough. Cites: F_233953_grossTypicalFloorSquareFeet.
- 233953 / desire (model): 150,365 square feet across my dark floors await your pitch—but where's the night-time draw? Studios alone won't light me up. Counteroffer: Show me how your gathering space anchors evening activity—food service, events, or programming that keeps people here after dark. Cites: F_233953_dark_sqft.
- 233953 / funny (model): A cat café where the cats interview the humans? Darling, that's entertainment—but where's the footprint? Show me sqft. Counteroffer: Light up one of my dark floors with your café nights; I'll host the whiskers and the crowds. Cites: F_233953_grossTypicalFloorSquareFeet.
- 233899 / strong_fit (model): 415,496 square feet across my dark floors await your pitch—but gaming needs power, cooling, sound isolation. What's your footprint? Counteroffer: Show me your area budget, and let's carve out a night-lit studio where neighbors feel at home in the building. Cites: F_233899_dark_sqft.
- 233899 / impossible_area (number_match): For a typical single-floor pitch, fit within 25,529 square feet; show me your area budget. Counteroffer: Make room for everyday company in your market; Bring me an idea. Let's make a deal. Cites: F_233899_grossTypicalFloorSquareFeet.
- 233899 / desire (model): 415,496 square feet across my dark floors await your pitch—but how long do they stay dark? Show me the timeline. Counteroffer: Map out which dark floors could host live-work studios and shared dining. What's your floor mix? Cites: F_233899_dark_sqft.
- 233899 / funny (model): Floor 5 has 23,446 listed available square feet—but cats interviewing humans? Show me the lease terms. Counteroffer: Bring me a cat café that doubles as a neighborhood gathering spot where people actually build community over coffee. Cites: F_233899_floor_5_available_sqft.
- Verdict 233953: My typical floor gives you 22,189 square feet. (winner p1; invalid_schema; 8.714s). Cites: F_233953_grossTypicalFloorSquareFeet, F_233953_dark_floor_count, F_233953_dark_sqft.
- Verdict 233899: My typical floor gives you 25,529 square feet. (winner p1; invalid_schema; 9.762s). Cites: F_233899_grossTypicalFloorSquareFeet, F_233899_dark_floor_count, F_233899_dark_sqft.

Private responses and request counts: `server/state/latency_result.json`; rejected candidates: `server/state/live_agent.jsonl`. The prior paid check remains in `evals/live-quality-check.md`.
