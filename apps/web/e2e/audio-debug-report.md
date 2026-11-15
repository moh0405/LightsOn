# Screen speech diagnosis — 2026-11-14

## Result

**Confirmed in native Chromium at normal demo speed:** the second player's challenge was interrupted when NEGOTIATE became VERDICT. The old hook aborted speech on every speech-phase boundary. The fixed hook finishes the active line, serializes the verdict behind it, and drops only pending lines that have become stale. Round/reset/room/data-mode changes still cancel immediately.

A second reproduced defect was reconnect replay: fresh objects containing the same intro/challenge were spoken again. Deduplication now uses round lifetime + line type + player + text, rather than object identity. Changed live-agent challenge text remains eligible.

## Setup and method

- Real `data/`, `.env`, and public media symlinked from the main checkout; cached prep at `/Users/momossss/Documents/GitHub/LightsOn/server/cache/prep`.
- `AGENT_MODE=fake`, `DATA_MODE=kit`, `DEMO_MODE=1`; no Bedrock calls or keyed ElevenLabs calls. Real `window.speechSynthesis` and OS voices, not a speech stub, for the timelines below.
- Chromium on macOS, API 21001 / web 18074. Both default autoplay policy and `--autoplay-policy=no-user-gesture-required` were exercised. Baseline implementation: `55f179c`; fixed implementation starts at `7bdd61e`.
- Native full rounds: click Start audio → two players join → wake Esperson → intro → both typed pitches → both challenges → revision → verdict → tap charge → revival. Timers at scale 1 for the primary comparison.
- Instrumentation wraps `speak/cancel/pause/resume`, records every utterance's text/voice/rate/pitch and start/end/error, records cancel stacks, phase transitions, `CityMusic.duck`, and the actual Tone context state. JSON is attached to the Playwright result and optionally copied using `AUDIO_TIMELINE_PATH`.
- Separate deterministic Vitest/Playwright tests control callback timing and replay messages. They are regression tests, not evidence of native audibility.

## Findings and limits

| Suspected problem | Evidence / action |
| --- | --- |
| Before-Start autoplay blocking | Not observed: first `speak` followed the click; native start events occurred under both policies. Added a Start-gating browser regression. |
| Empty initial voice list | Original code did not wait. Added bounded, abortable `voiceschanged` discovery and tested delayed/absent voices. |
| Phase cancellation | Confirmed at normal speed and under accelerated timers; cancel stack is `useGame subscription → sync → cancel → AbortController.abort → browserSpeech abort → speechSynthesis.cancel`. |
| Long speech | Old code imposed a 20-second cap on the entire line. Sentence/word chunks now cap normal chunks at 140 characters / 22 words, each with its own watchdog. A 27-second multi-sentence regression completes without cancellation. A native Chrome 15-second engine stall was not independently observed. |
| Duplicate replay | Failing regression spoke one intro twice after cloning the replay payload; now once. Two-player ordering and challenge replay also covered. |
| Voice/persona | Baseline selected Samantha in these runs. Old hash selection could select OS novelty voices; now prefer a natural English default or explicitly named natural voice after persona discovery. Rate/pitch are consistently 1/1 instead of mood-dependent values. No claim that extreme rates caused this particular interruption. |
| Ducking / overlap | No native overlapping starts. Ducking engages before each line and releases after it; stays engaged between its sentence chunks. First-round category music is silent until revival; unit tests also verify the 8 dB layer reduction. |
| Fact IDs / markup | None in native utterances. Sanitizer regression strips dossier-style citation IDs and formatting while preserving words and decimal numbers. |
| Stale queue / delayed TTS | Queued old-phase lines are skipped; late TTS responses are rechecked before playback. Active lines finish. New rounds abort and clear dedupe state. |

The two initial regressions failed before implementation: verdict-to-POWER_UP increased `cancel()` calls, and replay spoke the intro twice. A later failing test demonstrated stale speech after a delayed TTS response; the post-fetch phase check fixes that as well.

## Primary native timelines

Times below are milliseconds since navigation. Each row is an actual `speak` call; repeated sentence text in two different challenges is intentional, one per player. A line's chunks retain the same voice. Full sentences containing property facts are copied from the observed dossier-backed game output.

### Before — normal demo timing, autoplay-policy diagnostic flag

| # | Text | Voice; rate/pitch | Speak / start / end or error (ms) |
| --- | --- | --- | --- |
| 1 | I made my entrance in 1941. Pitch like you mean it, kid — I have been waiting long enough. | Samantha; 0.95/0.90 | speak 3384; start 3466; end 10991 |
| 2 | Darling, floor 18 has 15,364 listed available square feet. What footprint would your shared space need? Give your community space a reason to buzz after sunset. Show me how. | Samantha; 0.95/0.90 | speak 31373; start 31376; end 43744 |
| 3 | Dollface, floor 18 has 15,364 listed available square feet. What footprint would your shared space need? Give your community space a reason to buzz after sunset. What do you say? | Samantha; 0.95/0.90 | speak 43749; start 43749; error 56373 (interrupted) |
| 4 | I'm in. Let's give this idea a home. | Samantha; 0.95/0.90 | speak 56382; start 56383; end 58922 |

Phase, control, and music events (all):

| ms | Event | Detail |
| --- | --- | --- |
| 1443 | click |  |
| 1734 | AudioContext | running |
| 3228 | phase | EXPLORE |
| 3228 | duck | release |
| 3341 | duck | release |
| 3352 | phase | INTRO |
| 3352 | duck | release |
| 3354 | duck | engage |
| 10990 | duck | release |
| 11343 | phase | PITCH |
| 31357 | phase | CHALLENGE |
| 31357 | duck | release |
| 31360 | duck | engage |
| 41365 | phase | NEGOTIATE |
| 43744 | duck | release |
| 43744 | duck | engage |
| 56372 | phase | VERDICT |
| 56372 | cancel | phase-change abort; call chain above; active utterance interrupted |
| 56372 | duck | release |
| 56375 | duck | engage |
| 58922 | duck | release |
| 66376 | phase | POWER_UP |
| 66376 | duck | release |
| 76389 | phase | REVIVED |
| 76389 | duck | release |

Totals: 4 speak, 4 start, 3 end, 1 error, 1 cancel, 0 pause, 0 resume.

### After — normal demo timing, autoplay-policy diagnostic flag

| # | Text | Voice; rate/pitch | Speak / start / end or error (ms) |
| --- | --- | --- | --- |
| 1 | I made my entrance in 1941. | Samantha; 1.00/1.00 | speak 3474; start 3527; end 6997 |
| 2 | Pitch like you mean it, kid — I have been waiting long enough. | Samantha; 1.00/1.00 | speak 6997; start 6998; end 10752 |
| 3 | Dollface, floor 18 has 15,364 listed available square feet. | Samantha; 1.00/1.00 | speak 31465; start 31468; end 37440 |
| 4 | What footprint would your shared space need? | Samantha; 1.00/1.00 | speak 37440; start 37441; end 39776 |
| 5 | Give your community space a reason to buzz after sunset. | Samantha; 1.00/1.00 | speak 39776; start 39777; end 43061 |
| 6 | What do you say? | Samantha; 1.00/1.00 | speak 43061; start 43062; end 44289 |
| 7 | Sugar, floor 7 has 31,503 listed available square feet. | Samantha; 1.00/1.00 | speak 44309; start 44310; end 49494 |
| 8 | What footprint would your shared space need? | Samantha; 1.00/1.00 | speak 49494; start 49494; end 51808 |
| 9 | Give your community space a reason to buzz after sunset. | Samantha; 1.00/1.00 | speak 51808; start 51809; end 55094 |
| 10 | Make me believe it. | Samantha; 1.00/1.00 | speak 55093; start 55094; end 56310 |
| 11 | I'm in. | Samantha; 1.00/1.00 | speak 56483; start 56484; end 57195 |
| 12 | Let's give this idea a home. | Samantha; 1.00/1.00 | speak 57195; start 57196; end 58987 |

Phase, control, and music events (all):

| ms | Event | Detail |
| --- | --- | --- |
| 1634 | click |  |
| 2008 | AudioContext | running |
| 3369 | phase | EXPLORE |
| 3436 | duck | release |
| 3453 | phase | INTRO |
| 3454 | duck | engage |
| 10752 | duck | release |
| 11432 | phase | PITCH |
| 31443 | phase | CHALLENGE |
| 31447 | duck | engage |
| 41450 | phase | NEGOTIATE |
| 44288 | duck | release |
| 44289 | duck | engage |
| 56309 | duck | release |
| 56465 | phase | VERDICT |
| 56471 | duck | engage |
| 58987 | duck | release |
| 66487 | phase | POWER_UP |
| 76510 | phase | REVIVED |

Totals: 12 speak, 12 start, 12 end, 0 error, 0 cancel, 0 pause, 0 resume.

### Accelerated diagnosis (scale 0.1)

Both policies reproduced three `interrupted` errors and three phase-triggered cancellations. This stress run intentionally cannot fit natural speech into 0.8–3 second windows; it is not evidence that every normal-speed line failed. The second queued challenge never started in these runs. The fix intentionally skips stale queued lines when a host or accelerated clock advances too quickly rather than narrating a previous phase.

### Default autoplay

| # | Text | Voice; rate/pitch | Speak / start / end or error (ms) |
| --- | --- | --- | --- |
| 1 | I made my entrance in 1941. Pitch like you mean it, kid — I have been waiting long enough. | Samantha; 0.95/0.90 | speak 2625; start 2654; error 5426 (interrupted) |
| 2 | Darling, floor 18 has 15,364 listed available square feet. What footprint would your shared space need? Give your community space a reason to buzz after sunset. Show me how. | Samantha; 0.95/0.90 | speak 5432; start 5433; error 7952 (interrupted) |
| 3 | I'm in. Let's give this idea a home. | Samantha; 0.95/0.90 | speak 7966; start 7967; error 8967 (interrupted) |

Phase, control, and music events (all):

| ms | Event | Detail |
| --- | --- | --- |
| 1399 | click |  |
| 1645 | AudioContext | suspended |
| 1648 | AudioContext | running |
| 2570 | phase | EXPLORE |
| 2570 | duck | release |
| 2617 | duck | release |
| 2619 | phase | INTRO |
| 2619 | duck | release |
| 2621 | duck | engage |
| 3419 | phase | PITCH |
| 5425 | phase | CHALLENGE |
| 5425 | cancel | phase-change abort; call chain above; active utterance interrupted |
| 5425 | duck | release |
| 5427 | duck | engage |
| 6437 | phase | NEGOTIATE |
| 7949 | phase | VERDICT |
| 7950 | cancel | phase-change abort; call chain above; active utterance interrupted |
| 7950 | duck | release |
| 7955 | duck | engage |
| 8963 | phase | POWER_UP |
| 8963 | cancel | phase-change abort; call chain above; active utterance interrupted |
| 8963 | duck | release |
| 9970 | phase | REVIVED |
| 9970 | duck | release |
| 10776 | phase | EXPLORE |
| 10777 | duck | release |

Totals: 3 speak, 3 start, 0 end, 3 error, 3 cancel, 0 pause, 0 resume.

### Autoplay diagnostic flag

| # | Text | Voice; rate/pitch | Speak / start / end or error (ms) |
| --- | --- | --- | --- |
| 1 | I made my entrance in 1941. Pitch like you mean it, kid — I have been waiting long enough. | Samantha; 0.95/0.90 | speak 2212; start 2224; error 5008 (interrupted) |
| 2 | Darling, floor 6 has 31,503 listed available square feet. What footprint would your shared space need? Give your community space a reason to buzz after sunset. Show me how. | Samantha; 0.95/0.90 | speak 5017; start 5018; error 7517 (interrupted) |
| 3 | I'm in. Let's give this idea a home. | Samantha; 0.95/0.90 | speak 7524; start 7524; error 8522 (interrupted) |

Phase, control, and music events (all):

| ms | Event | Detail |
| --- | --- | --- |
| 801 | click |  |
| 1063 | AudioContext | suspended |
| 1070 | AudioContext | running |
| 2152 | phase | EXPLORE |
| 2152 | duck | release |
| 2197 | duck | release |
| 2201 | phase | INTRO |
| 2201 | duck | release |
| 2204 | duck | engage |
| 3001 | phase | PITCH |
| 5007 | phase | CHALLENGE |
| 5007 | cancel | phase-change abort; call chain above; active utterance interrupted |
| 5007 | duck | release |
| 5008 | duck | engage |
| 6011 | phase | NEGOTIATE |
| 7517 | phase | VERDICT |
| 7517 | cancel | phase-change abort; call chain above; active utterance interrupted |
| 7517 | duck | release |
| 7518 | duck | engage |
| 8521 | phase | POWER_UP |
| 8521 | cancel | phase-change abort; call chain above; active utterance interrupted |
| 8521 | duck | release |
| 9529 | phase | REVIVED |
| 9529 | duck | release |
| 10333 | phase | EXPLORE |
| 10333 | duck | release |

Totals: 3 speak, 3 start, 0 end, 3 error, 3 cancel, 0 pause, 0 resume.

## Reproduce

```sh
PREP_TRACE_DIR=/Users/momossss/Documents/GitHub/LightsOn/server/cache/prep \
DEMO_MODE=1 PHASE_DURATIONS_SCALE=1 \
LO_E2E_API_PORT=21001 LO_E2E_WEB_PORT=18074 \
AUDIO_ASSERT_NATIVE=1 AUDIO_TIMELINE_PATH=/tmp/audio-timeline.json \
pnpm --dir apps/web e2e audio-debug.spec.ts -g 'native speech'
```

Add `AUDIO_AUTOPLAY_DIAG=1` to use the autoplay diagnostic flag. Omit `AUDIO_ASSERT_NATIVE` on machines without installed OS speech voices; the timeline still records native errors rather than silently claiming speech succeeded. The default suite retains its fast timer scale; the config override is for audible diagnosis.

## Gates

- `pnpm -r test`: 79 web tests passed (including 11 new speech regressions); messaging workspace passed.
- `uv run pytest` from `server`: 626 passed, 1 skipped.
- `pnpm --dir apps/web build`: passed; existing bundle-size advisory remains.
- Standard full Playwright suite: all 46 checks passed across the full run and a targeted retry (45 initially passed; the fixture trace test timed out waiting for the admin data-mode switch before Start was clicked, then passed unchanged on retry).
- Extra media suite outside the default `e2e` command: 3 failures in the combined run (two hidden Matterport iframe assertions and one timeout-duration assertion). Re-running those 3 with the **original** audio module produced 2 failures and 1 pass; these tests never click Start audio. Their timing failures are pre-existing and remain outside this speech fix.
- Normal-speed native kit rounds under both default and diagnostic autoplay policies: 12 chunks completed per round, no errors, cancellations, overlap, or browser console errors. The final diagnostic run records the actual CityMusic Tone context (not a second imported context).
- Deterministic Playwright Start/replay/POWER_UP regression: passed.

The full existing suite intentionally runs with `DEMO_MODE=0`: its preset test asserts “Demo preset off” and its media fallback test wakes a non-demo building. Audio diagnosis itself runs with the requested `DEMO_MODE=1`. No game contracts, phase durations, server state validation, or negotiation rules changed.
