# /screen audio latency measurements

## Demo path: Esperson, real demo timers, two phones (2026-11-15)

Real `DEMO_MODE=1` phase timers (no host skips), 1920x1080 headless Chromium, real OS speechSynthesis at volume 0, two phone contexts, live-agent code path with a 2.5 s modelled turn and the offline fallback dialogue (Bedrock spend cap 0: no Bedrock calls). Three consecutive rounds per run. Times in ms.

**Before** (commit 6e917c2, one round): the first live challenge arrived before the server armed the CHALLENGE timer, so it was spoken unbudgeted and the second player never got a turn.

| ms after CHALLENGE | event |
| ---: | --- |
| 2653 | start "Dollface, 150,365 square feet across my dark floors await your pitch." (7.1 s: the number alone is eight spoken words) |
| 9774 | start "What footprint would your shared space need?" |
| 12110 | start "Give your community space a reason to buzz after sunset." |
| 12680 | NEGOTIATE: `speechSynthesis.cancel()` cuts that sentence 0.57 s in (`interrupted`); player 2's challenge is never spoken |

**After** (3 rounds, 18 utterances):

| Measure | Target | Result |
| --- | ---: | ---: |
| Intro event -> first word (worst of 3) | <= 300 | 78.6 |
| Challenge ready -> first word (worst of 6) | <= 300 | 3.8 |
| Verdict event -> first word (worst of 3) | <= 300 | 76.7 |
| Max gap between sentences | <= 250 | 32.9 |
| Utterances started / ended | equal | 18 / 18 |
| `cancel()` while speaking, `interrupted` errors | 0 | 0 / 0 |
| Longest stall beyond the sentence's expected length | <= 2000 | 0 |
| Challenges spoken (2 players x 3 rounds) | 6 | 6 |
| Last challenge sentence ends before NEGOTIATE | >= 0 | 4031 |
| Longest main-thread task during speech | <= 100 | 0 (earlier runs before the merge: 63 and 66; SwiftShader) |

What changed: a sentence in progress is never cancelled by a phase or round change (only a room reset or unmount interrupts); the sentences and lines queued behind it are dropped. Each utterance is one sentence with a 5 s `resume()` keep-alive and a watchdog (expected length + 2 s, re-armed on `boundary`) that skips only the stalled sentence. Challenges are budgeted into the CHALLENGE window even when the timer is not armed yet, and numbers count as the words they are read as. Trade-off: with two players in a 10 s window the voice speaks each player's ask; the cited fact stays on the challenge card.

Reproduce: add `AUDIO_LAG_REALTIME=1 AUDIO_LAG_ROUNDS=3 AUDIO_LAG_AGENT=recorded AUDIO_LAG_AGENT_DELAY=2.5` to the command at the end of this file.

Measured 2026-11-14/15, macOS, Playwright Chromium, actual OS speechSynthesis (180 installed voices), real Tone/AudioContext, real local skyline/floor geometry, HTTP and WebSockets. Native speech start events approximate first-word onset; this is not a microphone/acoustic measurement. All times below are milliseconds, **before → after**.

The server's wake list contains Esperson, TC Energy Center, 3 Houston Center, 1415 Louisiana, One Allen Center and 717 Texas. Wells Fargo Plaza (233899) has no prepared persona and is excluded by the server; its test is explicitly skipped. Kit data remains local and ignored.

The coordinator clarified the target: first real line of each step <=300 ms, gaps between chunks/queued player lines <=250 ms, complete player lines retained, and stale pending lines discarded. Event-to-start includes the preceding player's speech; ready-to-start removes that legitimate queue wait. Only Esperson has recorded live dialogue available: the replay uses the exact challenge/verdict words from server/tests/test_persona_replies.py, injected into the real LiveAgent Bedrock adapter with deterministic score/alias shells and claim-check responses. Existing grounding, prepared-voice repair and actions.py validation still run. Other buildings use the fake agent as directed; no live coverage is claimed for them.

The provider delay is a **controlled 750 ms unavailable-TTS response**, returning audio_url=null through a Playwright route, not measured ElevenLabs latency. Real synthesis, voices, chunks, rendering and event timing are not mocked. Paid providers/prep are disabled/guarded; no paid requests are needed. Intro audio is absent in these datasets, so this measures the native fallback path. Separate regression tests exercise cached-clip startup and the voice-service fallback when native speech is absent.

Two phone contexts type pitches and a revision and charge through REVIVED using the actual game server; host commands hold each step until its speech finishes (test-only 600-second timers). Production phase durations, negotiation, validation and the floor light-up are unchanged. External Matterport networking is replaced with a local caption document; local aerials, camera movement, map and particles remain real. Before recordings use the original source at 90c5334. The fake agent varies its wording with generated player IDs, so utterance lengths/total queue waits are not identical between runs; ready-to-start is the isolated queue overhead metric.

**Event to first spoken word, first real line of each step**

| Building / agent | Intro | Counteroffer | Verdict |
| --- | ---: | ---: | ---: |
| TC Energy Center · fake | 1016.1 → 78.8 | 760.4 → 28.3 | 759.5 → 62.9 |
| 3 Houston Center · fake | 932.3 → 156.0 | 760.6 → 2.8 | 759.2 → 5.2 |
| 1415 Louisiana · fake | 1043.1 → 55.2 | 765.6 → 1.7 | 757.1 → 1.8 |
| One Allen Center · fake | 858.4 → 3.5 | 770.3 → 2.8 | 758.9 → 1.7 |
| Esperson · fake | 887.9 → 43.5 | 767.9 → 44.5 | 757.6 → 3.9 |
| 717 Texas · fake | 840.4 → 146.6 | 757.9 → 1.8 | 763.7 → 1.8 |
| Esperson · recorded | 871.4 → 96.4 | 9293.3 → 1.7 | 758.4 → 31.0 |

Every measured first real line after the change starts within 156 ms. Recorded Esperson's real counteroffer falls from 9,293.3 to 1.7 ms: two preliminary catchphrases previously occupied the voice queue; now they are subtitle-only. All complete player responses still finish. Recorded Esperson's after-run also activates all eight real Tone layers during speech.

**Second player's queue: legitimate waiting versus startup overhead**

| Building / agent | Event → first word | Earlier speech wait | Ready → first word |
| --- | ---: | ---: | ---: |
| TC Energy Center · fake | 12418.9 → 11281.6 | 11660.8 → 11281.0 | 758.1 → 0.6 |
| 3 Houston Center · fake | 13132.6 → 11439.9 | 12377.2 → 11439.2 | 755.4 → 0.7 |
| 1415 Louisiana · fake | 12628.1 → 10982.8 | 11874.3 → 10982.3 | 753.8 → 0.5 |
| One Allen Center · fake | 12839.9 → 11094.5 | 12078.9 → 11093.7 | 761.0 → 0.8 |
| Esperson · fake | 13487.7 → 11474.2 | 12730.7 → 11473.7 | 757.0 → 0.5 |
| 717 Texas · fake | 13736.1 → 11742.8 | 12980.2 → 11742.3 | 755.9 → 0.5 |
| Esperson · recorded | 21941.5 → 11867.9 | 21179.1 → 11866.7 | 762.4 → 1.2 |

Between-player startup falls from about 754–762 ms to 0.5–1.2 ms. Music duck ramps never awaited a fade; the repeated TTS request, optional persona await and one-second empty-voice discovery wait were removed from the native first-word path. OS voices were already present in these native runs (getVoices took at most 0.1 ms); an empty voice list is covered by the failing-first regression and now uses the browser default immediately.

**Subtitle, chunk and rendering measurements during native speech**

PerformanceObserver records long tasks (>=50 ms), requestAnimationFrame records frames, and real AudioContext state plus duck/revive/signature calls are logged. A zero in the last column means no observed task reached the 50 ms long-task threshold, not zero CPU work. Frame gaps and long tasks are different measurements.

| Building / agent | Max subtitle delay | Max chunk gap | Frame p95 | Max frame gap | Max long task |
| --- | ---: | ---: | ---: | ---: | ---: |
| TC Energy Center · fake | 1.9 → 1.1 | 1.0 → 35.2 | 16.8 → 16.8 | 200.0 → 66.7 | 0.0 → 0.0 |
| 3 Houston Center · fake | 1.2 → 1.2 | 30.6 → 66.1 | 16.8 → 16.8 | 99.9 → 216.6 | 0.0 → 225.0 |
| 1415 Louisiana · fake | 1.2 → 1.1 | 43.4 → 52.9 | 16.8 → 16.8 | 133.4 → 100.0 | 0.0 → 76.0 |
| One Allen Center · fake | 3.4 → 1.3 | 22.5 → 58.7 | 16.8 → 16.8 | 266.6 → 166.6 | 0.0 → 165.0 |
| Esperson · fake | 1.5 → 2.3 | 1.1 → 0.6 | 16.8 → 16.8 | 116.7 → 49.9 | 0.0 → 0.0 |
| 717 Texas · fake | 0.9 → 1.5 | 22.2 → 39.3 | 16.8 → 16.8 | 50.0 → 150.1 | 0.0 → 0.0 |
| Esperson · recorded | 1.0 → 2.4 | 0.9 → 1.1 | 16.8 → 16.8 | 250.0 → 100.0 | 0.0 → 0.0 |

The initial after sweep caught two >100 ms rendering outliers during the early camera move: 225 ms for 3 Houston Center and 165 ms for One Allen Center. These failures are retained above. A traced 3 Houston Center rerun passed unchanged with 60.3/4.8/70.2 ms first-line starts, 91.3 ms max chunk gap and no >=50 ms speech-time task; a One Allen Center rerun with all eight music layers passed with 44.1/3.3/3.4 ms starts, 1.4 ms chunk gap and no >=50 ms speech-time task. The trace's larger startup tasks were Chromium rendering commits rather than >50 ms JavaScript calls; it does not prove the cause of the original outliers. Chromium used ANGLE SwiftShader in both forced and default-GL diagnostic launches. Passing reruns do not establish a universal bound under shared-host/software-renderer load.

**Pointer workload**

A separate synthetic 60-update/four-pointer probe measures React commits on the real map, without altering the server's rule that pointer commands belong to EXPLORE. ScreenApp commits fall from 60 to 0; the corrected after-probe also records 0 IntroMedia/Subtitles/ChallengeCards/ScoreCard commits. Its longest task falls from 133 to 57–60 ms. Only beams and changing hover content update. Hover filters persist across pointer updates, the map no longer clones its complete style on each rendered frame, and symbol fadeDuration is zero. The camera dive, floor stagger/fade, sparks and signature remain intact. The probe's Fiber observer skips reused subtrees so stale PerformedWork flags are not counted as new renders.

**Regression evidence and gates**

- Eight relevant speech regressions failed against the original implementation before the fix (provider/persona waits, silent preliminary line, stale pending replacement, empty voice discovery, cached audio startup); the final speech suite has 17 passing cases.
- pnpm -r test: 85 web tests passed; messaging typecheck passed.
- uv run pytest -q (server): 654 passed, 1 opt-in live-provider check skipped.
- pnpm --dir apps/web build: passed; existing bundle-size advisory remains.
- Full standard Playwright suite: running; native measurement cases are opt-in and run separately.
- Native kit baseline: six complete fake rounds plus recorded Esperson, no speech errors/cancellations or console errors.
- Native after: first-word/chunk/queue targets pass for all six buildings and recorded Esperson; initial two rendering outliers and their successful reruns are documented above.
- Native fixture-mode verification: pending.

**Reproduce**

From the repository root, with the ignored data/.env/public-media symlinks configured:

```sh
PREP_TRACE_DIR=/Users/momossss/Documents/GitHub/LightsOn/server/cache/prep \
BEDROCK_SPEND_LEDGER=/Users/momossss/Documents/GitHub/LightsOn/server/state/bedrock_spend.json \
LO_E2E_API_PORT=21501 LO_E2E_WEB_PORT=18574 \
AUDIO_LAG_MEASURE=1 AUDIO_LAG_ASSERT=1 AUDIO_LAG_TTS_DELAY=750 \
AUDIO_LAG_OUTPUT=/tmp/lights-on-audio-lag-after \
pnpm --dir apps/web e2e --config audio-lag.playwright.config.ts
```

Use AUDIO_LAG_AGENT=recorded for Esperson's recorded live dialogue, AUDIO_LAG_DATA=fixtures for fixture mode, AUDIO_LAG_MUSIC_STRESS=1 for all eight Tone layers, and AUDIO_LAG_TRACE=1 for a Chromium CPU trace. Omit AUDIO_LAG_ASSERT to retain measurements when diagnosing a failing threshold. JSON timelines/CPU traces are attached to Playwright results and optionally written to AUDIO_LAG_OUTPUT, outside version control. This run's raw artifacts are under /tmp/lights-on-audio-lag-{before,after,trace,hardware,after-recorded}; the directory named hardware was a default-GL diagnostic and still reported SwiftShader.
