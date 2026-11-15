# Esperson demo dress rehearsal

**Result: all four full rounds completed; three judge-visible MUST-FIX items remain.** The live challenge exposed an internal fact ID, speech ran into later phases, and the pointer nickname covered the selected tower. No product code was changed.

## Run and evidence

- Date: 2026-11-15, approximately 04:39–04:49 EST. Tested commit `0563529` on `qa/dress-rehearsal`.
- Three fake-agent rounds, then exactly one `AGENT_MODE=live` round; all used `DATA_MODE=kit`, `DEMO_MODE=1`, Esperson, 1920×1080 headless Chromium, two independent phone contexts, and `/admin`.
- Natural timers: INTRO 8 s, PITCH 20 s, CHALLENGE 10 s after the live agent resolves, NEGOTIATE 15 s, VERDICT 10 s, REVIVED 8 s. No host skips, clock mocks, altered server events, fake tours, or forced outcomes.
- Required data, `.env`, and media symlinks point at the main checkout. `PREP_TRACE_DIR=/Users/momossss/Documents/GitHub/LightsOn/server/cache/prep`; API 22001, web 19074. State and temporary harnesses are under `/tmp/lights-dress/`.
- Every context uses `e2e/silence.ts`; Chromium also uses `--mute-audio`. Native speech remains real, at volume zero. `speak`, `start`, `boundary`, `end`, `error`, `cancel`, incoming server events, and visible DOM beats were timestamped; DOM sampling was every 50 ms. This measures browser events, not acoustic output.
- An additional zero-cost camera probe sampled the real tween through INTRO. Its first setup attempt shared phone storage and was stopped; the corrected probe used separate contexts and passed. It did not add another live round.
- All retained PNGs are 1920×1080. Times below are screenshot completion times relative to INTRO (encoding can finish after a brief beat has changed); negative times are the join/selection setup. PASS refers to the observed beat, not a claim that every acceptance check passed.

## Steps 1–7: beat table

| Scope | Beat | Fake 1 | Fake 2 | Fake 3 | Live | Representative evidence / finding |
|---|---|---|---|---|---|---|
| 1 | Dark skyline and QR | PASS -2.48s | PASS -2.27s | PASS -2.24s | PASS -2.16s | [image](screenshots/dress/live-1-skyline-qr.png) QR renders; its join URL opens the phone join flow. |
| 1 | Two players join | PASS -1.39s | PASS -1.35s | PASS -1.31s | PASS -1.29s | [image](screenshots/dress/live-1-joined.png) Maya and Leo join in separate storage contexts; EXPLORE begins. |
| 2 | Hover highlight and Wake | PASS -0.04s | PASS -0.05s | PASS -0.04s | PASS -0.03s | [image](screenshots/dress/live-1-hover-highlight.png) Tap-to-aim gives Esperson a floor highlight and Wake affordance; tapping Wake enters INTRO. |
| 2 | Pointer/nickname avoids tower | FAIL -0.04s | FAIL -0.05s | FAIL -0.04s | FAIL -0.03s | [image](screenshots/dress/live-1-hover-highlight.png) Nickname and glowing pointer cover the selected roof/facade; MUST-FIX 3. |
| 3 | Dive / whole tower | PASS +0.71s | PASS +0.65s | PASS +0.50s | PASS +0.59s | [image](screenshots/dress/live-1-dive-start.png) Camera bounds and actual tween verified separately; see camera evidence below. |
| 3 | Intro aerial | PASS +1.72s | PASS +1.48s | PASS +1.18s | PASS +1.33s | [image](screenshots/dress/live-1-intro-aerial.png) Real local aerial image loads before the lobby tour. |
| 3 | Lobby autoplay and persistence | PASS +7.47s | PASS +6.82s | PASS +6.81s | PASS +7.80s | [image](screenshots/dress/live-1-intro-tour-late.png) Live Matterport canvas appears with no Explore 3D Space poster; container persists >6 s. |
| 3 | Subtitles and prompt intro voice | FAIL +3.53s | PASS +3.00s | FAIL +2.98s | FAIL +3.98s | [image](screenshots/dress/live-1-intro-tour-early.png) Subtitles render; cold first-word boundary is 1.55 s in fake 1 / 1.06 s live. All started speech ends. |
| 4 | Two realistic typed pitches | PASS +8.62s | PASS +8.39s | PASS +8.44s | PASS +8.28s | [image](screenshots/dress/live-1-typed-pitches.png) Both typed pitches reach the projector without voice input. |
| 4 | Grounded specific challenge | PASS +38.68s | PASS +38.52s | PASS +38.58s | PASS +41.93s | [image](screenshots/dress/live-1-counteroffers.png) Numbers match dossier facts; live raw-ID leakage is separately failed below. |
| 4 | Challenge spoken promptly / phase-correct | FAIL +28.19s | FAIL +28.49s | FAIL +28.53s | FAIL +28.38s | [image](screenshots/dress/live-1-challenge.png) Second challenge queues behind the first; live verdict is delayed 5.10 s by old challenge speech. |
| 4 | Typed revision | PASS +38.87s | PASS +38.74s | PASS +38.79s | PASS +42.13s | [image](screenshots/dress/live-1-revision.png) Maya submits the smaller single-floor revision; round proceeds without a host skip. |
| 4 | Verdict, score card, footer | PASS +53.39s | PASS +53.28s | PASS +53.34s | PASS +56.65s | [image](screenshots/dress/live-1-verdict-score-footer.png) Both players scored; criterion note and Game character. Not a feasibility assessment. footer are visible. |
| 5 | Tap-to-charge power-up | PASS +63.38s | PASS +63.29s | PASS +63.37s | PASS +66.67s | [image](screenshots/dress/live-1-power-up.png) Four accepted taps across two phones reach 100%; no auto-completion required. |
| 5 | Visible light-up | PASS +65.20s | PASS +65.10s | PASS +65.27s | PASS +68.45s | [image](screenshots/dress/live-1-revived-immediate.png) Actual map-canvas lit-pixel counts exceed 8,900 in every run. |
| 5 | Concept card and city meter | PASS +65.71s | PASS +65.59s | PASS +65.84s | PASS +68.91s | [image](screenshots/dress/live-1-concept-city-meter.png) Both images load; concept follows the light-up after ~1 s; city advances to one building / one song layer. |
| 6 | M walk-in stays open | PASS +80.59s | PASS +80.28s | PASS +80.06s | PASS +83.60s | [image](screenshots/dress/live-1-m-walk-in.png) Walk-in is still open after 7 s and closes with Escape. |
| 6 | T trace panel | PASS +80.92s | PASS +80.64s | PASS +80.41s | PASS +83.99s | [image](screenshots/dress/live-1-t-trace.png) Recorded prep displays 36/36 calls and named subagents; no paid prep was invoked. |
| 7 | H host controls | PASS +81.32s | PASS +80.94s | PASS +80.73s | PASS +84.20s | [image](screenshots/dress/live-1-h-host-controls.png) Projector host panel opens; separate /admin performs Reset room. |
| 7 | Reset room | PASS +81.78s | PASS +81.37s | PASS +81.13s | PASS +84.64s | [image](screenshots/dress/live-1-reset-room.png) Server returns LOBBY; phone and projector remain usable. |
| 7 | No internal IDs in game copy | PASS +38.68s | PASS +38.52s | PASS +38.58s | FAIL +41.93s | [image](screenshots/dress/live-1-counteroffers.png) Fake runs pass; LIVE FAIL: model appends F_233953_floor_7_available_sqft to its challenge. |

All four `/screen` runs had **0 console errors and 0 uncaught page errors**; both phone pages also had 0 uncaught page errors. The main game text was sampled continuously for the forbidden occupancy term, fact/property IDs, contact email patterns, and phone patterns. The only hit was the one live fact ID, visible for ~25.00 s; no forbidden occupancy wording or contact text was found. The public dossier has no broker/owner/contact fields. This is an observed-path check, not a new exhaustive privacy audit.

## Speech timing per line

First start is the first native `start` event after the server supplies the line; first word is the first native `boundary` event. Both are shown because native start can precede its first word boundary substantially on a cold OS voice. For challenges, “end” includes the counteroffer sentences. Latencies are in milliseconds. For the promptness PASS/FAIL check, the first-word target is ≤300 ms, matching the audio PR’s stated target; cold native boundary delays are reported separately from start events.

| Run | Line | First start | First word boundary | Final end after line arrived | Started / ended chunks |
|---|---|---:|---:|---:|---:|
| fake 1 | Intro | 264 | 1551 | 7501 | 2 / 2 |
| fake 1 | Maya challenge | 11 | 176 | 13291 | 4 / 4 |
| fake 1 | Leo challenge | 13294 | 13331 | 24926 | 4 / 4 |
| fake 1 | Verdict | 10 | 49 | 2374 | 2 / 2 |
| fake 2 | Intro | 224 | 252 | 6308 | 2 / 2 |
| fake 2 | Maya challenge | 8 | 72 | 10857 | 4 / 4 |
| fake 2 | Leo challenge | 10859 | 10896 | 25586 | 4 / 4 |
| fake 2 | Verdict | 574 | 610 | 2947 | 2 / 2 |
| fake 3 | Intro | 168 | 445 | 6536 | 2 / 2 |
| fake 3 | Maya challenge | 5 | 63 | 10944 | 4 / 4 |
| fake 3 | Leo challenge | 10946 | 10985 | 23060 | 4 / 4 |
| fake 3 | Verdict | 4 | 45 | 2371 | 2 / 2 |
| live 1 | Intro | 194 | 1065 | 7123 | 2 / 2 |
| live 1 | Leo challenge | 5035 | 5119 | 18060 | 4 / 4 |
| live 1 | Maya challenge | 17011 | 17087 | 30134 | 2 / 2 |
| live 1 | Verdict | 5101 | 5144 | 7492 | 2 / 2 |

**Continuity PASS:** 48 utterances started and 48 ended; no speech errors, cancellation cuts, or unfinished started utterances were observed. **Phase discipline FAIL:** fake 2 challenge speech ended 0.56 s after VERDICT began; live challenge speech ended 5.11 s after VERDICT began. In live, the same thinking/catchphrase placeholder was spoken twice (~3.6 s each) before the useful challenges. The useful fallback challenge started 5.04 s after arriving, and Maya’s live challenge started 17.01 s after arriving. Keeping a sentence intact did not prevent stale speech from delaying the verdict.

Live placeholder detail: first placeholder arrived at page t=31.578 s, started at 31.690 s, ended at 35.330 s; the duplicate started at 35.339 s and ended at 38.957 s. First word boundaries were 31.777 s and 35.403 s respectively. These are additional to the substantive lines in the table.

## Live grounding, fallbacks, and spend

The two original pitches were:

> A late-night board-game cafe for downtown office workers, using one dark floor with paid tables and free community nights.

> A shared training and coworking hub for local small businesses, with evening workshops and flexible desks on one dark floor.

Maya revised to:

> Start with one listed available floor only, with a small member-supported board-game cafe, scheduled evening sessions, and free community nights; avoid major structural changes.

The accepted live challenge was:

> Floor 7 has 31,503 listed available square feet—plenty for tables, but will your crowd stay past midnight? F_233953_floor_7_available_sqft

> Show me your table count and seating plan; then light up those late hours with a soft opening.

The source fact is floor 7 listed available area = 31,503 sq ft. This is a grounded and pitch-specific challenge, but its fact ID leaked into the visible line. Browser speech strips this ID; the challenge card does not. [image](screenshots/dress/live-1-counteroffers.png)

Leo received the grounded offline fallback:

> Dollface, 150,365 square feet across my dark floors await your pitch. How would you lay out your studio within that area?

> Give your studio a reason to buzz after sunset. Show me how.

The 150,365 sq ft value matches the dossier’s derived dark-floor-area fact. It is shown as “Source” in the UI rather than labelled CoStar, so the floor 7 challenge is the stronger demonstration of source grounding.

**Two fallback decisions:** one challenge and the verdict, both `budget`. One attempted challenge was rejected by grounding because “past 6 PM” introduced an uncited numeric 6; the retry reached the configured budget boundary and became the offline challenge. Public trace events identify `fallback: challenge (budget)` at 2,329 ms and `fallback: verdict (budget)` at 12 ms. These are bounded fallback paths, not browser crashes. The verdict therefore used the offline judge; this run is not evidence of a successful live-model verdict.

Ledger: `/Users/momossss/Documents/GitHub/LightsOn/server/state/bedrock_spend.json`. Before **$3.138692425**, after **$3.177311225**, increment **$0.038618800**. Five metered Haiku calls completed; no retained/unconfirmed reservations. Server cap was **$3.238692425** (starting balance + $0.10), below the abort threshold of $3.35. The ledger reserves a conservative upper bound before a call, so it can refuse a Sonnet verdict although its expected final token cost would fit the remaining actual-cost allowance. The cap was not raised.

## Visual timings and camera

| Run | Tour container visible | Concept after building_revived | Lit map pixels | Automatic charge completion |
|---|---:|---:|---:|---|
| fake 1 | 6.841 s | 1021 ms | 9,013 | no |
| fake 2 | 6.843 s | 1052 ms | 9,011 | no |
| fake 3 | 6.845 s | 1109 ms | 8,915 | no |
| live 1 | 6.910 s | 1039 ms | 9,015 | no |

Lit pixels were read from the actual WebGL map canvas, excluding DOM charge bars and labels, using red >170, red−green >70, red−blue >50. All winners used the first player’s red. This is a visibility count, not a full image-quality score.

**Charge-only screenshot explained:** the immediate REVIVED screenshot precedes the concept-card timer. With the three selected floors, the code waits 200 ms flash + 600 ms fade + 2×60 ms stagger = 920 ms; the observed first card frame was 1,021–1,109 ms after `building_revived`. All four concept cards appeared, both images loaded, and the card fit the 1080p layout. No missing-card fix is indicated. Compare [image](screenshots/dress/live-1-revived-immediate.png) with [image](screenshots/dress/live-1-concept-city-meter.png).

**Dive framing PASS:** live projected floor vertices fit the map with >20 px margins; vertical extent was y=141.25–571.66 inside the map canvas. The extra camera probe independently passed the same whole-volume bounds assertion and captured [the full tower after INTRO](screenshots/dress/probe-whole-tower-framed.png). Its real camera tween had 58 moving INTRO samples spanning 2274 ms; maximum consecutive sampled zoom change was 0.1820. Media covers the camera during much of INTRO; the post-INTRO framing is directly visible. This headless trace establishes continuous camera progression and bounds, not subjective smoothness on the projector GPU.

The tour duration above measures the visible tour container, not six seconds of fully decoded 3D textures. The early screenshot still has the player’s loading/texture transition; the late screenshot has a real canvas with no start poster. The real iframe stayed mounted until INTRO ended. A cold remote player can spend part of its six-second window loading; no six-second fully textured claim is made.

## Ranked MUST-FIX list

1. **P0 — Strip/reject internal fact IDs before displaying generated dialogue.** Reproducible in the single live round: `F_233953_floor_7_available_sqft` stayed in Maya’s challenge throughout negotiation. Suggested fix: normalize generated display text at the existing server validation/grounding boundary, retaining citations only in `fact_ids`, and defensively apply the existing speech ID-removal rule to display copy. Cover the accepted live response above with one regression. Do not remove the readable source evidence. Files to inspect: `server/app/agent/live_agent.py` (`prepared_voice`, challenge acceptance) and `apps/web/src/screen/overlays/RoundOverlays.tsx` (`ChallengeCards`).

2. **P0 — Budget speech for both players and drop stale queued sentences.** The live verdict card appears while the previous challenge is still speaking; verdict voice starts 5.10 s late. Placeholder dialogue repeats twice, and the useful live challenge waits 17.01 s. Suggested fix: use the audio work in [PR #44](https://github.com/moh0405/LightsOn/pull/44), including subtitle-only thinking lines and short challenge asks that fit the shared timer; verify cold first-word boundaries and both players on natural timers after merge. Preserve sentence completion and negotiation duration. All four original runs here are before that PR; its improvements are not claimed as verified.

3. **P1 — Move the pointer nickname off the selected tower.** The aim dot and “Maya” text visibly cover Esperson’s selected roof/facade. [image](screenshots/dress/fake-1-hover-highlight.png) Suggested fix: place the nickname outside the projected building bounds with a short leader line and use a smaller hollow aim marker; keep immediate local pointer/highlight feedback. Inspect `apps/web/src/screen/City.tsx` around the `data-testid="dot"` rendering.

## Console decision and verification

No embedded-player `ApolloError: Failed to fetch` occurred in these four rounds. The previously reported message comes from the cross-origin Matterport player, not a Lights On request handler. **Do not blanket-silence browser console errors or replace global console/error handlers.** Keep reporting vendor errors separately from first-party exceptions; retain the bounded cover fallback if loading actually fails. Parent iframe `onLoad` is not proof of a healthy 3D session, so a reproducible blank-tour failure needs a real readiness/failure guard rather than log suppression. This known intermittent vendor diagnostic is not promoted to a MUST-FIX without a reproduced user-visible failure.

- `uv run pytest` in `server` using the existing Python environment: **715 passed, 1 skipped**.
- `pnpm -r test`: **89 web tests passed**, messaging TypeScript check passed.
- Natural-timer fake rehearsal: **3/3 full rounds completed**; natural-timer live rehearsal: **1/1 full round completed**, with the explicit two budget fallbacks above.
- Corrected additional camera probe: **passed**. No agent source changed, so the agent-eval commit gate does not apply.
- Temporary configs and full raw instrumentation are at `/tmp/lights-dress/{dress.config.ts,dress.spec.ts,fake-results.json,live-results.json,probe.json}` on this worker machine; they are not required game assets and are not committed.
- Main was checked again before publication. The audio PR status at the last check is recorded below; if it merges later, the audio beats need another natural-timer check.

Audio main check: **PR #44 remained open and unmerged; origin/main was still `0563529` at 04:52 EST.** No incoming main change was available to pull during the measured runs.

🤖 Generated with Codex, coordinated by Claude Code

## Fix round — pointer and speech (2026-11-15, 05:04–05:12 EST)

**Pointer PASS. Speech phase discipline PASS on current main (`85859ce`, including audio PR #44).** The pointer is now a 12 px hollow ring; its nickname sits 16 px outside the selected building's projected bounds with a thin leader line. Projection and feedback use local map geometry. The new `pointer-label.spec.ts` independently projects Esperson's complete exported floor volume and asserts that its nickname box does not intersect that volume; it passes with both kit and fixtures at 1920×1080. Evidence: [before](screenshots/dress/fix-pointer-before.png), [after](screenshots/dress/fix-pointer-after.png).

Two complete fake rounds, then exactly one live-mode round used Esperson, `DEMO_MODE=1`, `DATA_MODE=kit`, a 1920×1080 projector, two independent phone contexts, typed pitches/revision, natural timers, and manual tap charging. No host skips or clock mocks. All contexts used `silence.ts` and Chromium `--mute-audio`; native speech ran at volume zero. The original rehearsal instrumentation recorded incoming events plus `speak/start/boundary/end/error/cancel`. API/web ports were 22012/19082; data, environment, media and prep traces used the requested main-checkout paths. Raw logs and harness remain in `/tmp/lights-pointer-speech/`. One preliminary attempt stopped at an unrelated INTRO screenshot assertion; the second fake round was rerun with that media-only assertion removed.

| Completed run | Verdict native start / first word after line arrival | Last challenge ended before VERDICT | Utterances started / ended | Placeholder utterances | Phase discipline |
|---|---:|---:|---:|---:|---|
| Fake 1 | 5 / 399 ms | 18,056 ms | 7 / 7 | 0 | PASS |
| Fake 2 | 6 / 73 ms | 18,411 ms | 7 / 7 | 0 | PASS |
| Live mode, budget fallbacks | 4 / 72 ms | 18,312 ms | 7 / 7 | 0 (two preliminary lines received) | PASS |

Line arrival means the earliest server event carrying the line, including `room_state` before the dedicated verdict event. **The strict ≤300 ms first-word check has one FAIL observation (399 ms); the other two pass.** Its native `start` was 5 ms, followed by 394 ms inside the OS voice; the application queue did not delay it. Per coordinator direction, retain this outlier explicitly and leave the already-fixed speech queue unchanged. Thinking updates remained subtitle-only, were never repeated in speech, and no challenge was playing at VERDICT. All 21 started utterances ended; no cancellation or speech error occurred, so no sentence was cut by phase retirement. Every completed projector round had zero console/uncaught errors, and both phones had zero uncaught errors. These are browser callback measurements, not acoustic measurements.

**Live-model challenge/verdict timing remains unverified by this run.** Both challenges and the verdict used the existing `budget` fallback. This worker held its cap at $3.277311225 (the initially observed $3.177311225 + $0.10), below the $3.40 abort ceiling. At round setup the shared ledger temporarily held $3.344597135 in total charges/reservations and later reconciled to $3.259816835; the coordinator confirmed concurrent user play-testing on the main server. Consequently that shared-ledger delta is not this worker's spend. No second live attempt was made, preserving the user's remaining budget.

Validation: `pnpm -r test` PASS (104 web tests plus messaging typecheck); `pnpm --dir apps/web build` PASS; pointer Playwright regression PASS in kit and fixtures. No server, phase-duration, model, event, command, or fact-display code changed.
