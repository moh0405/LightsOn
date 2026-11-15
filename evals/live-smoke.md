# Live browser smoke — 2026-11-14

**Complete real-stack round passed, with two challenge fallbacks and a live verdict.** This run proves the live integration and graceful recovery end to end; it does **not** prove reliable model-generated challenges. No application code was changed, and no second paid round was run.

Tested main commit `370f6441754c340bba95d11e7f00ccf0b7852002`, using Chromium Playwright, a 1920×1080 `/screen`, and two isolated iPhone 13 emulations. All HTTP and WebSocket traffic used the real stack: no intercepted routes, fake agent, injected events, or fixture data mode. Room `6596`, Esperson `233953`, round `6596-1`.

Configuration: `AGENT_MODE=live DEMO_MODE=1 DATA_MODE=kit`, normal phase duration scale, API port `20701`, web port `17774`. Data, root environment, and public media were gitignored symlinks to the primary checkout; `PREP_TRACE_DIR` used its prepared traces. The single foreground Playwright invocation managed both server lifetimes and shut them down afterward. Audio was not enabled; subtitles and typed/tap controls were exercised.

## Inputs and result

- Atlas: “A 40,000 sq ft single-floor restaurant with room for a giant indoor picnic.”
- Pixel: “A public community gaming studio open at night, with cozy cooperative games and a neighborhood leaderboard.”
- Pixel's one revision: “Start with a modest footprint within the floor area, free community game nights, quiet hours, and shared setup with neighbors.”

Both players joined, tapped to wake Esperson, submitted typed pitches, received challenges, and reached negotiation. Pixel submitted one revision. The live verdict gave Atlas **16/40** (data fit **2/10**) and Pixel **36/40** (data fit **9/10**). Both phones tapped to charge; energy reached **100%**, and `building_revived` reported floors `[6,7,8]`, `94,509` square feet, winner color `#4cc9f0`, and **`auto_completed=false`**. The screen reached REVIVED and displayed the concept card and updated city progress.

**Browser console errors: 0; uncaught page errors: 0**, collected on all three pages throughout the round. The development-server log separately contained one WebSocket proxy `EPIPE` during phone connection setup and a disconnect during teardown; neither interrupted gameplay or appeared as a browser error.

## Time to grounded challenge subtitles

Times start at receipt of the screen's `phase_changed: CHALLENGE`. A DOM MutationObserver recorded the first complete matching challenge line in the rendered card; these are browser DOM observations, not optical display measurements. The immediate uncited persona catchphrase is excluded.

| Player | First grounded subtitle in DOM | Grounded WebSocket delivery | Published origin |
| --- | ---: | ---: | --- |
| Atlas | 3.691 s | 3.692 s | Deterministic fallback |
| Pixel | 4.131 s | 4.131 s | Deterministic fallback |

The 1 ms ordering difference comes from independent browser and Playwright callback clocks. No model-origin challenge subtitle was published. The live verdict arrived 5.239 s after VERDICT began, including generation and claim checking.

## Exact challenge lines shown

Atlas, citing `F_233953_grossTypicalFloorSquareFeet`:

> For a typical single-floor pitch, fit within 22,189 square feet; show me your area budget.

> Give your market a reason to buzz after sunset; Pitch like you mean it, kid — I have been waiting long enough.

Pixel, citing `F_233953_dark_sqft`:

> Dollface, 150,365 square feet across my dark floors await your pitch. How would your venue work within that evidence?

> Give your venue a reason to buzz after sunset; Pitch like you mean it, kid — I have been waiting long enough.

The screen displayed the fallback toast: “The building is using its offline judge for this step.”

## Exact live verdict shown

> Pixel's revised pitch fits the floor, lights me up after dark, and brings the neighborhood in — that's the plot twist I've been waiting for.

Desire reveal: “To be lit up and busy at night.” The server returned `desire_met=false`; the report preserves that result without interpreting the narrative as a satisfied desire.

Citations: `F_233953_grossTypicalFloorSquareFeet`, `F_233953_dark_sqft`, `F_233953_dark_floor_count`.

## Fallback diagnosis

The private `live_agent.jsonl` and browser `agent_step` messages agree:

- **Atlas:** both challenge attempts repeated the player's `40,000` quantity in generated dialogue. The number-grounding validator rejected it because the cited building fact supports `22,189`, not `40,000`. Terminal cause: `number_match`; fallback at 3.638 s server elapsed.
- **Pixel:** the first attempt mentioned `22,189` without citing its supporting fact. Regeneration supplied no fact IDs, so it failed the required researched-constraint citation. Terminal cause: `fact_id`; fallback at 4.126 s server elapsed.
- **Verdict:** Sonnet generation completed in 4.528 s, followed by a successful Haiku claim check in 0.693 s. No verdict fallback, timeout, budget rejection, or invalid state transition occurred.

These are model quality failures handled by the existing validation/fallback path, not a justification to weaken validation. A future change needs offline regression evidence and a separately authorized paid confirmation run. This smoke report makes no claim that the two failed model challenges were fixed.

## Spend

Shared `server/state/bedrock_spend.json`: **$2.7814600 → $2.8129552**, delta **$0.0314952**. Calls **129 → 135**: four Haiku challenge attempts, one Sonnet verdict, and one Haiku claim check; all six reconciled successfully. There were no retained unconfirmed reservations from this run.

The server enforced a run cap of **$3.0314600** (starting total + $0.25), below the requested **$3.30** ceiling. The ledger was shared with the primary checkout, not reset or copied.

## Evidence and checks

- [CHALLENGE, 1920×1080](../apps/web/e2e/screenshots/live-smoke/CHALLENGE.png)
- [VERDICT, 1920×1080](../apps/web/e2e/screenshots/live-smoke/VERDICT.png)
- [REVIVED, 1920×1080](../apps/web/e2e/screenshots/live-smoke/REVIVED.png)
- Live Playwright: **1 passed**, one full round, about 1.4 minutes including startup.
- Local private capture: `/tmp/lights-live-smoke/` holds the harness, event/DOM observations, logs, and isolated game state; it contains no copied environment file and is not committed.
- Required pre-commit checks: `cd server && uv run pytest` — **549 passed, 1 skipped**; `pnpm -r test` — **62 web tests passed**, messaging tests passed.
