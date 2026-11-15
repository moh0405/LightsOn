# Visible live demo — 15 November 2026

**Replacement round completed; demo-quality checks have failures below.** Existing localhost:5173 → :8000 stack, kit/live/demo mode, natural timers, Esperson, Maya + Leo. No product changes, server starts, host skips, clock mocks, or speech silencing. Branch starts from main `f8c8f2f`.

The first headed Chromium attempt began at 05:26:48 EST, within ten minutes of task start. The user reported severe animation lag; recording plus three browser processes were plausible contributors, not proven causes. That harness stopped at its inadequate five-second score-card wait. The same room was subsequently reconnected and reset; no extra round was started during recovery.

The coordinator explicitly authorized **one replacement live round**, which ran 05:31:50–05:34:12 EST in installed Google Chrome, **one browser process / three independent contexts**, with no video, screencast or tracing. Projector viewport 1920×1080; phones 390×844. `navigator.webdriver=false`; every actual utterance had volume **1**, using Samantha. All opened browsers closed after Reset plus 20 seconds.

| Beat | Result | Evidence / timing from Wake |
|---|---|---|
| Fresh room, QR joins | PASS | Maya and Leo used the actual QR URL; separate storage |
| All three windows fully visible beside each other | FAIL | Available desktop is only 1920×1080; full-size windows overlap |
| Aim, highlight, Wake | PASS | Independent floor-volume projection: nickname rectangle outside tower |
| Dive, aerial, lobby tour, intro | PASS | Aerial sampled for ~1 s; tour visible ~7 s; PITCH at +8.0 s |
| Two typed pitches, challenge, typed revision | PASS | Visible 45 ms/key typing; CHALLENGE +28.0 s, NEGOTIATE +41.4 s |
| Verdict and score card | PASS | VERDICT +56.4 s; validated score card +63.0 s |
| Manual charge, light-up, concept, city meter | PASS | POWER_UP +73.1 s; REVIVED +76.5 s; 100%, one revived building, one song layer |
| M / Escape, T, H, Reset | PASS | Walk-in held seven seconds; reset +97.9 s; LOBBY retained 20 s |
| Zero console/page errors | FAIL | Two favicon.ico 404 console errors; zero page errors |
| Speech finished before next distinct phase | FAIL | Verdict continues into POWER_UP and REVIVED |

**Graphics:** `ANGLE (Apple, ANGLE Metal Renderer: Apple M4, Unspecified Version)`. Five-second requestAnimationFrame windows, starting at skyline measurement / INTRO / REVIVED:

| Window | Average FPS | Longest frame | Frames >50 ms |
|---|---:|---:|---:|
| Skyline | 144.0 | 7.9 ms | 0 |
| Dive | 114.8 | 201.4 ms | 7 |
| Light-up | 143.8 | 14.0 ms | 0 |

No window averaged below 30 FPS. Skyline/light-up show no sampled long-frame stutter; the dive has a measurable 201 ms hitch, so this is **not a stutter-free pass**. These are renderer callbacks, not a compositor or human-perception measurement. Playwright injected its default `--enable-unsafe-swiftshader` permission flag despite no explicit GPU flags; the actual renderer remained Apple Metal. The final harness also excludes that default flag; that flag-only adjustment was not replayed.

**Model and speech:** both replacement challenges and the verdict were live Bedrock, each followed by a successful claim check; zero fallback events. Challenge readiness was 2.973 s (Maya) / 3.360 s (Leo) after CHALLENGE began; verdict readiness was 6.632 s after VERDICT began. First attempt: Maya live, Leo fallback caused by `number_match`; its verdict was not observed before the harness exited.

| Published line | Arrival → first word | Speak call → first word | Playing at next distinct phase? |
|---|---:|---:|---|
| Intro | 998 ms | 996 ms | No |
| Maya challenge | 358 ms | 356 ms | No |
| Leo challenge | 3,854 ms | 50 ms | No; waited behind Maya |
| Verdict | 385 ms | 381 ms | **Yes** |

First-word means the first native `boundary` callback, measured from the earliest event carrying the line (including verdict in `room_state`). Seven native chunks all ended; chunk speak→first-word latencies were **996, 117, 356, 50, 381, 42, 32 ms**. Two preliminary challenge placeholders stayed subtitle-only. Verdict speech ended **7.825 s into POWER_UP / 4.408 s into REVIVED**. Duplicate CHALLENGE/VERDICT timer announcements are not counted as phase changes. No acoustic recording was made.

**Spend:** shared ledger $3.259816835 → $3.370914855 for attempt one (**$0.111098020**); then → $3.445305875 for the separately authorized replacement (**$0.074391020**). Both rounds individually stayed under $0.12; final ledger stayed below $4.20. Twelve and nine completed ledger calls respectively; no outstanding reservation at final accounting. The first harness's immediate $0.19518 delta included an in-flight reservation and was not final billed usage.

**Ranked issues:**

1. **P1 product:** verdict speech overlaps charging and light-up by the durations above; intro first word also misses the prior 300 ms target. Challenge queue latency reaches 3.85 s. Preserve negotiation and the light-up moment when correcting speech timing.
2. **P1 product/performance investigation:** seven dive frames exceed 50 ms, three exceed 100 ms, on hardware Chrome without recording. Average FPS alone hides the hitch.
3. **P1 presentation setup:** native-sized projector and two adjacent phones do not fit this desktop; arrange another display or agree on a scaled presentation.
4. **P2 product:** favicon 404 prevents the literal zero-console-error acceptance check.
5. **Harness fixed, no additional live replay:** score-card timeout increased to 45 s; final accounting waits for reservations; reusable harness emits FPS summaries and excludes the default SwiftShader permission flag.

No raw fact/property IDs or forbidden occupancy wording appeared in sampled projector DOM in either attempt. No contact names were observed; this does not claim exhaustive OCR inspection of third-party tour imagery. No phone page errors. The validated verdict selected Leo, 31–30; no result was predetermined.

**Artifacts:** original requested projector video: `/tmp/lights-visible-run/page@018d53db220076420f3b5a40a91c5e8d.webm` (partial first attempt, no audio track). Original evidence: `/tmp/lights-visible-run/evidence.json`; same-room recovery: `/tmp/lights-visible-run/recovery.json`; complete replacement evidence: `/tmp/lights-visible-run/rerun/evidence.json`. No replacement video, per coordinator instruction.

**Validation:** replacement Playwright run PASS (one test, 2.4 min); `pnpm -r test` PASS (105 web tests + messaging typecheck). Initial pytest lacked this worktree's kit/cache and failed; rerunning `uv run pytest -q` from `server` with `COSTAR_DATA_DIR` and `PREP_TRACE_DIR` pointing to the running checkout passed **726 tests, 10 skipped**. Harness discovery passes after final harness-only edits; no third live round was run.

Run only when another paid round is explicitly authorized:

```sh
VISIBLE_DEMO_ROOT=/path/to/running/checkout pnpm --dir apps/web exec playwright test --config e2e/visible-demo-run.config.ts
```
