# Final pre-freeze QA — 2026-11-14

**Not freeze-ready: the light-up is obscured by surrounding geometry, and raw identifiers remain on the projector.** No product code changed. Branch: `qa/final`.

Final production-timing demo retest: **`622d9a4d375fcd9686a18c7f8898e404dddf85e9`** (grounding fix PR #31), which merged during this sweep. Extended normal/demo matrix: `0162f735cd4045b7910adbd20737136e39b0b3bd`; first production-timing retest: `da1fbb2`; original full suite: `370f644`. After PR #31, both production-timing demo paths, unit tests and the offline quick eval were rerun; the full 38-test browser suite result is from before that merge. The report branch also includes `bbe62db`, whose later changes are documentation/eval evidence only.

## Ranked findings

### 1. P0 — the revived floors are hidden during the payoff

- **Where:** `/screen`, real skyline geometry and `City.tsx` dive/pullback framing.
- **Steps:** Join three phones, use the trackpad to hover Esperson, wake it, submit and revise two typed pitches, then charge to 100% with two phones. Observe the map during REVIVED.
- **Expected:** The target building and its changing floors are plainly visible after the dive, so the shared charge produces an observable light-up.
- **Actual:** Large foreground context buildings obscure Esperson. State, floor paint expressions, flash, score and city progression all update correctly. In the final production-timing runs on PR #31, render-callback canvas captures at **481 ms (kit) / 519 ms (fixtures)** after the revival event contain **zero winner-colored pixels**, before pullback starts. These capture the whole rendered canvas, without UI masks, and visibly contain the skyline; foreground geometry hides the target floors. Later demo samples show only **43 / 38 pixels** for the first two kit rounds and **0 / 4 pixels** for the first two fixture rounds. The tiny late sliver is not a visible floor-by-floor payoff.
- **Why existing checks missed it:** `queryRenderedFeatures` returns hero geometry even when foreground geometry hides it. Passing color-expression and flash-latency assertions does not prove visible floor lighting.
- **Evidence:** [rendered canvas before pullback](screenshots/qa-final/revival-before-pullback.png), [revival with foreground occlusion](screenshots/qa-final/revival-occluded.png); exact-frame evidence in `artifacts/qa-final-demo-latest/{kit,fixtures}-early-revival-1.png`.

### 2. P1 — property and fact identifiers are printed on the projector

- **Where:** screen header and `RoundOverlays.tsx` evidence rendering.
- **Steps:** Play the same round; inspect INTRO, CHALLENGE, VERDICT and REVIVED.
- **Expected:** Building names and readable sourced evidence, without internal property IDs or raw `F_...` IDs.
- **Actual:** The header displays “Waking building” followed by the numeric property identifier. Challenge and verdict evidence are prefixed by raw fact identifiers. This occurs in normal/demo mode and kit/fixtures, including the final production-timing retest.
- **Evidence:** [challenge evidence](screenshots/qa-final/raw-evidence.png), [verdict and footer](screenshots/qa-final/verdict-footer.png).

### 3. P2 — host error-toast coverage is incomplete

- **Where:** `/admin` broadcast-error handling.
- **Steps:** Wake a building and let PITCH expire without submitting; compare the server's `no_pitches` event with rendered alerts on the screen, phones and host.
- **Expected:** A visible explanation of why the round returned to EXPLORE.
- **Actual:** The final targeted audit identifies **only the admin page** as failing to display the `no_pitches` message, in both data modes; the projector and phones display it. `AdminApp` uses its own command-result message and does not render the shared `ErrorToast`. Evidence: [host without the error](screenshots/qa-final/admin-no-pitches.png), [phone with the error](screenshots/qa-final/phone-no-pitches.png).
- **Impact:** The empty round recovers correctly; this does not prevent typing, charging or host reset.

### 4. P2 — trace-panel text is below the projector readability target

- **Where:** `/screen`, T trace panel at 1920×1080.
- **Steps:** Press T and inspect recorded/live trace content.
- **Expected:** PRD projector body text at least 28 px.
- **Actual:** The sweep measures 14–16 px body/metadata text in the trace panel. Ordinary game overlays pass the measured text-size/layout checks; this finding is confined to the trace view.
- **Evidence:** [trace panel](screenshots/qa-final/trace.png).

## Acceptance matrix

| Area | Normal kit | Normal fixtures | Demo kit | Demo fixtures |
|---|---|---|---|---|
| QR URL join, 2–4 players; touch fallback without sensors | PASS | PASS | PASS | PASS |
| Trackpad hover uses dossier facts; tap wake | PASS | PASS | PASS | PASS |
| Intro approach, local Vexcel aerials and subtitles | PASS | PASS | PASS | PASS |
| Matterport explicit caption fallback continues the round | PASS, limited | PASS, limited | PASS, limited | PASS, limited |
| Typed pitch → fact-citing counteroffer → revision → verdict | PASS | PASS | PASS | PASS |
| Server score totals, score card, required footer | PASS | PASS | PASS | PASS |
| Two phones tap-charge to 100%; zero-tap fallback | PASS | PASS | PASS | PASS |
| Flash and floor-state/color update | PASS | PASS | PASS | PASS |
| Visible floor-lighting payoff after dive | **FAIL** | **FAIL** | **FAIL** | **FAIL** |
| Concept card disclosure, city/needs progression | PASS | PASS | PASS | PASS |
| Five consecutive rounds without restart/reset | PASS (5) | PASS (5) | 4, then exhausted | 4, then exhausted |
| Mid-round phone/screen reload and server SIGKILL/restart | PASS | PASS | PASS | PASS |
| Host skip, mid-phase round reset, room reset, provider switch | PASS | PASS | PASS | PASS |
| Mic/speech unavailable: typing and subtitles remain usable | PASS | PASS | PASS | PASS |
| T recorded trace and toggle | PASS | PASS | PASS | PASS |
| Zero unexpected console errors / uncaught exceptions | PASS | PASS | PASS | PASS |
| No forbidden vacancy wording or kit-contact leakage in app/API/events | PASS | PASS | PASS | PASS |
| No raw fact/property identifiers on projector | **FAIL** | **FAIL** | **FAIL** | **FAIL** |

The default demo preset contains only Esperson. Its verified dark-floor groups support four rounds: floors 6–8, 17–18, 20–21 and 24. A fifth consecutive demo round is unavailable; this is correct exhaustion behavior, not a crash or permission to invent more floors. **Use Reset room and rejoin for another demo cycle.** The five-round requirement is demonstrated in both normal data modes with four Esperson rounds followed by TC Energy Center.

The interior fallback has no sourced caption or interior still in the supplied dossier; it truthfully says “Interior tour caption unavailable.” [Fallback and subtitles](screenshots/qa-final/interior-fallback.png). This verifies recovery, not a successful interactive tour or a positive interior-image path. Privacy checks cover application DOM, API responses and received events; they do not inspect opaque cross-origin tour content.

## Setup and method

- Canonical `data`, `.env` and `apps/web/public/media` symlinked into the worktree; all remain ignored. No keys, kit records or media assets are committed.
- API **20601**, web **17674**; `PREP_TRACE_DIR=/Users/momossss/Documents/GitHub/LightsOn/server/cache/prep`.
- Chromium headless with SwiftShader; 1920×1080 desktop screen/admin and independent iPhone 13 / Pixel 7 touch contexts. Three initial players, two active pitchers, then a fourth joins. The existing suite additionally exercises four simultaneous pitchers.
- Real HTTP, WebSockets, source geometry and dossiers. `AGENT_MODE=fake`, zero Bedrock budget, isolated state/prep cache and a fail-fast prep-model sentinel. ElevenLabs and browser speech are disabled in the standalone sweep to force subtitle/typed recovery.
- Extended sweeps use scale 0.1, retaining an 8-second INTRO and 4-second REVIVED for media/animation evidence. Demo pitch/revision windows are widened to 6/4.5 seconds for screenshot capture. **The final demo retest removes these overrides and uses actual production durations:** complete kit round **71.735 s**, fixture round **71.731 s**, including return to EXPLORE; no phase skips.
- Every runner owns and closes its browser/server children. Commands run in the foreground; no detached test jobs remain.

Normal-run flash observations were **1.2–3.9 ms** from receipt of `building_revived` to the flash DOM mutation. Floor colors survive reload/restart, city impact is computed from targeted dossier floor areas, repeated charge nonces do not double-apply revival, and two phones reach full charge with four taps. These state/animation passes do not override finding 1.

The privacy reference scan compares against **1,428 contact names** without emitting those names. No match was found. Every exercised challenge/verdict citation resolves to a non-null fact in the active dossier, and the verdict displays its source text and “Game character. Not a feasibility assessment.”

All uninterrupted-round console audits pass. Deliberately killing the server produces expected WebSocket reconnect diagnostics (six console messages per normal data-mode run), which are recorded separately. Aborted navigation requests are also retained separately; they are not counted as product console errors.

## Validation and reproduction

| Command / run | Result |
|---|---|
| `pnpm install`; `cd server && uv sync` | PASS |
| Final `cd server && AGENT_MODE=fake BEDROCK_SPEND_CAP_USD=0 uv run pytest -q` | **624 passed, 1 skipped (45.73 s)**; opt-in live Vexcel test skipped |
| `cd server && AGENT_MODE=fake BEDROCK_SPEND_CAP_USD=0 uv run python ../evals/run.py --quick` | **34 challenges, 18 verdicts: grounding/schema/stability 100%; 354 regression tests passed**; offline only |
| Final `pnpm -r test` | **62 passed / 18 files**; messaging TypeScript check passed |
| Full existing `pnpm --filter @lights-on/web e2e` with the assigned ports/trace directory | **38 passed (5.1 min)** |
| Extended normal sweep | 5 completed rounds per mode; raw totals **31/35 kit, 30/35 fixtures** |
| Extended demo sweep | 4 completed rounds per mode; raw totals **27/34 kit, 25/34 fixtures** |
| First actual-duration demo retest on `da1fbb2` | **8/10 checks per mode**; visible-floor framing and raw identifiers fail |
| Actual-duration demo retest after PR #31 on `622d9a4` | **8/10 kit, 7/10 fixtures**; one additional late-pixel assertion fails in fixtures; both complete the full round |

Raw sweep totals include known harness/coverage effects and are not independent bug counts: the original no-audio case joined only one phone; it is corrected to join two. An early 5-second charge-phase wait was shorter than the demo evidence run's revision-plus-verdict duration; it is corrected to 15 seconds. A fixture INTRO receipt interval of 7,856 ms failed an overly narrow 7,900 ms assertion even though server timers remained fixed; the receipt-timing tolerance now permits ordinary scheduling delay. Demo exhaustion causes dependent “five revivals” assertions to fail. The targeted recovery results below supersede those harness failures.

Reproduce the matrix with the assigned environment and [qa-final-sweep.mjs](qa-final-sweep.mjs):

```sh
AGENT_MODE=fake DEMO_MODE=0 BEDROCK_SPEND_CAP_USD=0 \
PREP_TRACE_DIR=/Users/momossss/Documents/GitHub/LightsOn/server/cache/prep \
LO_E2E_API_PORT=20601 LO_E2E_WEB_PORT=17674 \
node apps/web/e2e/qa-final-sweep.mjs
```

Repeat with `DEMO_MODE=1`. `LO_QA_ONLY_CHECK` selects pipe-separated check names; `LO_QA_TAG` keeps reruns separate. `LO_QA_PRODUCTION=1` disables duration overrides. The first actual-duration retest predates the artifact-name cleanup and is retained in `artifacts/qa-final-followup/`; the post-#31 retest is in `artifacts/qa-final-demo-latest/`. Normal/demo matrices are in `artifacts/qa-final-normal/` and `artifacts/qa-final-demo/`. Each has results JSON, per-phase screen/phone screenshots, received events and diagnostics.

**Bedrock:** prep sentinels stayed absent, the worktree spend ledger stayed absent, and canonical before/after totals matched within every standalone run. The shared canonical ledger increased between some runs because other workers performed paid confirmations; those changes are not attributed to this QA worker. This QA worker made no Bedrock calls. Live-model quality, actual phone sensors and subjective audio remain outside this fake-agent QA task.

## Final targeted recovery results

- Normal-mode recovery rerun: **4/5 checks per data mode**. Two-phone no-audio typed rounds and empty-pitch recovery pass; the only failure is the **admin-only** missing `no_pitches` alert. Screen and phone error toasts pass. Artifacts: `artifacts/qa-final-normal-recovery/`.
- Demo charge rerun after PR #31: **5/6 checks per data mode**. Duplicate/rapid/late energy submissions, one-time revival, all induced charge-error toasts, no-model sentinels and console checks pass. The only failure is visible floor lighting: raw canvas captures at **488 ms / 496 ms** contain **zero** winner-colored pixels, with 104 / 102 distinct rendered colors confirming nonempty captures. Artifacts: `artifacts/qa-final-demo-charge-recheck/`.
- The first render-callback probe used an unnecessarily high 100-color capture-validity threshold; the real flat-color skyline had 78/72 colors and was visibly intact. The final probe uses a >10-color nonempty-image check and still fails the actual winner-pixel assertion. This is separate from the demonstrated occlusion.
- Latest main checked before commit: **`bbe62db53779e16b8f1825786eb9eb4e72163781`**. Its changes after the tested PR #31 are documentation/eval evidence only. Both assigned listening ports are released.

**Must fix before freeze:** findings 1 and 2. Findings 3 and 4 are lower-priority host/readability defects. The report does not claim five clean demo rounds or a successful interior tour when the available evidence does not support them.
