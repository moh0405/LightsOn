Phase 4 QA on `faaf76ccf9d480271ac19967a678ba37ca160a3d` — **gameplay passes in kit and fixtures; one estimate-label finding remains open**.

Tested 2026-11-14 on `qa/phase4-sweep`. Product code, contracts, source fixtures, and credentials were not changed. This PR contains the report, a reusable real-server sweep, one narrowly expected-failure UI regression, and screenshots.

Setup followed `docs/agents/qa-sweep.md` first: ignored `data` and `.env` symlinks point to the canonical checkout, `pnpm install` and `cd server && uv sync` succeeded, and HEAD matched the requested main revision. Python is 3.11.15. Tests used the actual CoStar SQLite index and committed source dossiers.

| Validation | Result |
| --- | --- |
| `cd server && uv run pytest` | **205 passed, 1 skipped in 35.95s**; skip is the opt-in live Vexcel smoke test |
| `pnpm -r test` | **34 web tests passed in 7 files**; messaging TypeScript passed |
| Existing `pnpm --filter @lights-on/web e2e` | **18 passed (1.7m)** |
| All specs after adding the regression | Playwright reports **19 passed (1.6m)**: **18 ordinary passes plus 1 expected product failure**, not 19 clean product checks |
| Real-server Phase 4 sweep, kit | **22/22 checks passed**, five consecutive complete rounds |
| Real-server Phase 4 sweep, fixtures | **22/22 checks passed**, five consecutive complete rounds |

The existing and final Playwright suites used `LO_E2E_API_PORT=18301 LO_E2E_WEB_PORT=15474`. The independent sweep used free ports `18302` / `15475`; the isolated regression's initial run used `18303` / `15476`. Bedrock spending was capped at zero for all browser runs.

The reusable sweep is [qa-phase4-sweep.mjs](qa-phase4-sweep.mjs):

```sh
LO_E2E_API_PORT=18301 LO_E2E_WEB_PORT=15474 node apps/web/e2e/qa-phase4-sweep.mjs
```

Each mode starts a real FastAPI process and Vite app with its own temporary `STATE_DIR`, one desktop context at 1920×1080 containing `/screen` and `/admin`, and three isolated touch contexts (iPhone 13, Pixel 7, iPhone 13). All three join through the displayed QR join URL. Two players type pitches and revisions and physically tap charge controls; the third remains connected. `PHASE_DURATIONS_SCALE=0.1`; natural timers advance the five gate rounds, with no host skips or resets between them. Each player's charge taps are more than 600 ms apart. Chromium runs headless with SwiftShader. HTTP, WebSocket traffic, floor geometry, dossiers, and the deterministic gameplay agent are not mocked.

Prep safety and scope: the sweep seeds an isolated Esperson cache from its committed dossier and validated committed persona, then sends two concurrent real HTTP prep requests. It redirects prep output and generated fallback personas into temporary directories and replaces only the model-construction boundary with a guard that records and rejects any attempt. No guard was reached. The nonhero `233918` takes the real deterministic prep fallback and emits actual `agent_step` events. These checks establish cache reuse, file-lock behavior, idempotence, and event delivery without paid calls; they do not claim to verify a fresh live hero research run, intro audio synthesis, or LangSmith traces.

| Requested check | Kit | Fixtures | Evidence |
| --- | --- | --- | --- |
| Five complete rounds without restarting | PASS | PASS | Four Esperson target groups, then Wells Fargo; typed negotiation, verdict, shared tap charge, light-up, city updates |
| Esperson intro uses persona `intro_line` | PASS | PASS | Exact committed persona line appears in `/screen` subtitles during each Esperson round |
| Wells Fargo fake fallback works without errors | PASS | PASS | No prepared persona in HTTP dossier; fallback intro, challenge, revision, verdict and revival complete in round five |
| Trackpad aiming and dossier-grounded hover | PASS | PASS | Actual Esperson map footprint selected by touch trackpad; name, stories, dark-floor count, and available-area text checked against its HTTP dossier |
| ScoreCard and challenge facts come from dossier | PASS | PASS | Every cited ID resolves to a non-null fact; exact `say_as` text appears in rendered evidence; challenge line uses that source text |
| Vexcel estimate/date metadata | PARTIAL | PARTIAL | All aerial facts have `kind=estimate` and retain their flyover year; targeted UI check shows the estimate label is omitted |
| Vexcel footprint rendering for both heroes | PASS | PASS | All 27 Esperson and 71 Wells Fargo floor polygons match dossier footprint coordinates, have `footprint_source=vexcel`, and both heroes appear in MapLibre rendered features |
| `agent_step` reaches `/screen` | PASS | PASS | Real nonhero prep POST delivers `fake_agent` and `validate_persona` tool events to the screen socket |
| `GET /api/buildings/{id}/persona` | PASS | PASS | Esperson returns exact validated persona; unprepared Wells Fargo and unknown ID return JSON 404 responses |
| Cached prep POST is idempotent without Bedrock | PASS | PASS | Concurrent responses equal the seeded cached dossier plus current data mode; cached file bytes unchanged; model guard untouched; unknown ID returns 404 |
| Player and screen reloads | PASS | PASS | Negotiation submissions, identity and evidence restored; all five rounds' floor colors persist |
| Kill/restart server mid-round | PASS | PASS | SIGKILL, same state directory, automatic reconnect; pitches, players, city and floor states preserved |
| Host controls | PASS | PASS | Skip phase, reset mid-round, reset room, switch kit ↔ fixtures; HTTP provider and room mode agree |
| Charge validation and timer fallbacks | PASS | PASS | Duplicate nonce/rate-limit/post-revival bursts capped; one revival commit; zero taps auto-completes; no pitches returns to explore; exhausted building rejected |
| No prohibited terminology or contacts | PASS | PASS | Rendered pages, captured socket events, API list and dossiers scanned; 1,428 kit contact full names compared locally without saving names |
| Console, exceptions, network | PASS | PASS | No console errors, page exceptions, failed requests or HTTP errors outside intentional outage and navigation cancellations |
| Responsive physical feedback | PASS | PASS | Real touch aiming/charge never waits on an AI call; each round's first light-up paint starts within 300 ms |

The ten consecutive gate rounds produced these measured outcomes. Floor groups and area totals come from each HTTP dossier; every revival was tap-completed (`auto_completed=false`).

| Round | Building | Floors | Cumulative sq ft | Kit first paint | Fixtures first paint |
| --- | --- | --- | --- | --- | --- |
| 1 | 233953 | 6, 7, 8 | 94,509 | 1.0 ms | 0.8 ms |
| 2 | 233953 | 17, 18 | 127,569 | 1.0 ms | 0.5 ms |
| 3 | 233953 | 20, 21 | 145,694 | 0.7 ms | 0.6 ms |
| 4 | 233953 | 24 | 150,365 | 0.8 ms | 0.5 ms |
| 5 | 233899 | 3 | 174,935 | 0.6 ms | 0.6 ms |

Finding QA4-01 — medium: Vexcel evidence drops the estimate label.

- **Where:** `/screen` → ScoreCard → cited evidence; `Evidence` in `apps/web/src/screen/overlays/RoundOverlays.tsx` renders `say_as` without displaying `Fact.kind`.
- **Steps:** run `pnpm --filter @lights-on/web e2e qa-phase4-evidence.spec.ts` with the safe environment below. The isolated UI harness supplies the actual committed fact `F_233953_vexcel_detection_car` as the cited evidence ID in a schema-valid verdict. It does not call a model or change server state.
- **Expected:** the cited Vexcel fact visibly carries an estimate qualification alongside its source flyover date/year.
- **Actual:** the evidence reads `on the 2023 flyover, 31 cars detected within about 30 m of the parcel`; its source fact has `kind=estimate`, but no estimate qualification appears. The flyover year is preserved. The source Vexcel cache has an exact ortho capture timestamp of `2023-08-02T00:00:00`; the current dossier `say_as` only supplies the year. Wells Fargo likewise supplies 2022 in its fact wording (cached ortho date `2022-02-19T00:00:00`).
- **Screenshot:** [Vexcel cited evidence missing its estimate label](screenshots/qa-phase4/vexcel-estimate-label.png).
- **Regression:** [qa-phase4-evidence.spec.ts](qa-phase4-evidence.spec.ts). Source text and flyover-year assertions must pass before the test marks only the missing-label assertion as expected failure. Remove that marker when the product fix lands.
- **Reachability:** current deterministic gameplay selects verified floor/story facts, so natural rounds do not exercise this estimate citation path. The targeted UI harness exposes a supported evidence-rendering path using a real dossier fact; it is separate from the real-server round sweep.
- **Left:** product follow-up to expose the estimate qualification, and clarify whether the UI should show the full cached capture date rather than the year. QA did not change product code.

```sh
BEDROCK_SPEND_CAP_USD=0 AWS_EC2_METADATA_DISABLED=true LANGSMITH_TRACING=false \
  LO_E2E_API_PORT=18301 LO_E2E_WEB_PORT=15474 \
  pnpm --filter @lights-on/web e2e
```

Screenshots of `/screen` at INTRO, PITCH, CHALLENGE, VERDICT, POWER_UP, REVIVED, plus the phone and admin screens, reloads, restart, and charge edge cases are in ignored `apps/web/e2e/artifacts/qa-phase4/`. Detailed socket events, checks, errors and per-round measurements are in ignored `results.json` there. Selected natural-round screenshots are attached below; the regression screenshot above uses an isolated UI harness.

- [Real kit verdict](screenshots/qa-phase4/kit-verdict.png)
- [Real fixtures revival](screenshots/qa-phase4/fixtures-revived.png)

No real Bedrock calls were made. The worktree's `server/state/bedrock_spend.json` was absent before and remained absent after the runs (effective total $0 → $0). The canonical checkout's existing ledger total was also checked: **$1.6183695000000005 before → $1.6183695000000005 after**, unchanged. No keys, contacts, raw kit files, media files or state/cache files are committed. Real motion/orientation sensors remain a human-device check; this sweep uses typed input and touch controls without sensors.

QA4-01 resolution in the Phase 4 fixes follow-up: ScoreCard evidence and the hover card now visibly prefix aerial facts with “Estimate”. Capture wording comes from the detection's own metadata or its matching response image, and includes the full date when available. The compact recorded fixtures do not retain that association, so regenerated dossiers correctly say “unknown capture date”; the separate property-extract dates are no longer borrowed. The regression is now an ordinary passing test, and its screenshot has been refreshed.
