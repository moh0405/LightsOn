Phase 2 fix verification: PASS — all six fixes are implemented.

Verified `bcf07f86ca5349b4ee7410cb85499a42411acd3f` on 2026-11-13 using Python 3.11.15 and the real local CoStar kit. Each fix was committed and pushed separately on `phase2/fixes`.

| Check | Result |
| --- | --- |
| `cd server && uv run pytest` | 49 passed; real kit present, no skips |
| `pnpm -r test` | 22 web tests passed; messaging TypeScript passed |
| `pnpm --filter @lights-on/web e2e` | 6 passed (51.0s); both former expected failures are normal passing tests |
| `pnpm --filter @lights-on/web build` | Passed; existing bundle-size warning |
| Unmocked `node apps/web/e2e/qa-phase2-sweep.mjs`, kit | **13/13 passed** |
| Same unmocked sweep, fixtures | **13/13 passed** |
| Browser errors in either sweep | 0, including backend restart checks |
| Contact-name privacy comparison | 1,428 names checked locally; none leaked |

The sweep uses actual HTTP APIs and committed geometry with no route interception. It verifies three phones, hover facts, source colors, a complete timer cycle, wake dive, host controls, reload, backend restart and provider switching in each mode. It captured 60 screenshots per mode in the ignored `artifacts/qa-phase2/` directory; machine-readable evidence remains in `artifacts/qa-phase2/results.json`.

Floor color regression coverage evaluates the actual map expression on real partial and unknown floors. The first-hover regression blocks dossier requests after prefetching and watches DOM insertions to ensure no Loading state appears. The provider regression switches both ways and checks all seven skyline dossiers are refetched in the selected mode. Python regressions preserve null tenancy area, prevent dark classification for recorded current tenancies, check One Allen Center floor 13 (611792), and keep Esperson floors 6–8 dark at 31,503 sq ft each. Height tests distinguish kit measurement from labelled rendering assumptions.

Non-blocking Python deprecation warnings remain. Phase 3 gameplay and real device sensors remain outside this Phase 2 verification.

---

Initial QA result (before fixes): FAIL — three product findings remained.

Tested main `0dbf8b0f08ecf9facfde14c737b216ecfdbb6cc0` on 2026-11-13. Product code was not changed. The worktree initially lacked ignored kit files; a local ignored `data` symlink to the main checkout supplied the existing real CoStar index. Python was explicitly switched to 3.11.15 before final validation.

| Area | Result | Evidence |
| --- | --- | --- |
| Fresh main and dependency installation | PASS | HEAD matched origin/main; pnpm install and server uv sync succeeded |
| Python unit/integration tests with real kit | PASS | `37 passed, 1 warning in 5.68s` |
| Workspace unit tests | PASS | Web: `Test Files 4 passed (4)`, `Tests 19 passed (19)`; messaging TypeScript check passed |
| Existing Playwright suite | PASS | All original 4 specs passed; first run `4 passed (51.3s)` |
| All specs including new regression coverage | PASS with known failures | `6 passed (50.1s)` means 4 normal passes plus 2 explicitly expected failures, not six clean product checks |
| Production build | PASS | TypeScript and Vite succeeded; bundle-size warning |
| Unmocked headless sweep, kit | FAIL | 11/13 area checks passed; floor colors and host data-provider switch failed |
| Unmocked headless sweep, fixtures | FAIL | 10/13 area checks passed; initial room mode, floor colors and host data-provider switch failed |
| Three-phone joining and physical input | PASS both modes | One 1920×1080 desktop context with screen/admin; two iPhone 13 contexts and one Pixel 7 context; real QR join URL, touch, no sensor events, drags relayed for all three |
| Actual skyline, hover and wake dive | PASS both modes | Committed geometry and real HTTP dossiers, no request interception; Esperson card matched 27 stories, 8 dark floors and dossier text `280,852.0 sqft`; camera reached zoom >17.4 |
| Full timer cycle | PASS both modes | INTRO → PITCH → CHALLENGE → NEGOTIATE → VERDICT → POWER_UP → REVIVED → EXPLORE at scale 0.1 |
| Host controls | PARTIAL | Skip, mid-phase reset, room reset and three-phone rejoin passed; mode switch failed below |
| Phone reload and backend restart | PASS both modes | Player identity survived reload; backend was SIGKILLed in PITCH and restarted with same STATE_DIR; screen restored PITCH/building and all three identities |
| Browser errors | PASS outside intentional outage | No console errors, uncaught exceptions, failed requests or HTTP errors on any page outside deliberate backend restart; reconnect handshake errors during the outage are recorded separately |
| Privacy and grounding | PASS | Seven actual dossiers per mode matched committed dossiers except correct process mode; 1,428 full kit contact names compared locally in memory against responses/rendered text, none found; no prohibited word or contact fields; hover facts grounded |

Phase 3 gameplay is not implemented at this revision: pitch/revision entry, challenges, verdicts, energy input, subtitles and the light-up payoff are out of scope for this Phase 2 sweep. Timers visit those phase names, while phones show the existing watch-screen placeholder. Real motion sensors and native mobile Safari were not exercised by Chromium emulation.

Finding 1 — high severity: source floor colors are overridden by initial game status.

- Where: `/screen`, committed `floors.geojson` integrated with the map paint expression.
- Steps: launch either mode; load `/screen` with actual assets; inspect any real `partial` or `unknown` floor. Evaluate its active fill-extrusion expression with MapLibre's expression engine.
- Expected: partial floors are dim `#4a4636`; unknown floors are neutral gray `#3a3f52`, per the PRD floor-status table and Phase 2 exit gate.
- Actual: both evaluate to occupied/warm gold `#f2c46d`. All 66 partial floors and 51 unknown floors in the 315-feature artifact have `game_status: lit`, and that branch wins before source status. Dark and occupied colors are correct.
- Screenshot path: `apps/web/e2e/artifacts/qa-phase2/kit-floor-colors-screen.png` (also `fixtures-floor-colors-screen.png`).
- Regression: `floor-status.spec.ts` uses actual geometry, actual map paint and MapLibre's own evaluator; explicitly marked expected failure pending a product fix.

![Actual skyline with incorrect warm colors for partial and unknown floors](artifacts/qa-phase2/kit-floor-colors-screen.png)

Finding 2 — medium severity: fixture processes create rooms labeled kit.

- Where: new room state and `/admin` under `DATA_MODE=fixtures`.
- Steps: start a clean backend with `DATA_MODE=fixtures` and a new STATE_DIR; open `/screen`; open `/admin` in the same context before changing any host setting.
- Expected: room and admin report fixture mode, matching `/api/health` and building dossiers.
- Actual: admin reports `data mode: kit`; room creation uses the dataclass default while health/dossiers correctly report fixtures.
- Screenshot path: `apps/web/e2e/artifacts/qa-phase2/fixtures-failure-room-mode-matches-process-mode-admin.png`.
- Regression: standalone sweep's `room mode matches process mode` check.

![Fixture backend initially reports kit on admin](artifacts/qa-phase2/fixtures-failure-room-mode-matches-process-mode-admin.png)

Finding 3 — medium severity: host data-mode switch changes only room metadata.

- Where: `/admin` mode buttons and `/api/buildings/{id}`.
- Steps: in a kit backend click `Data: fixtures`, then read the Esperson dossier; repeat fixtures → kit. The optional room query in the standalone sweep produces the same result as the normal no-query endpoint used by the regression spec.
- Expected: the selected mode controls building data and the displayed mode consistently.
- Actual: the admin label changes, while HTTP dossiers remain in the startup DATA_MODE. Kit → fixtures returns `kit`, and fixtures → kit returns `fixtures`; get_provider reads the process environment rather than the host choice. UI data is also loaded/cached without a mode-change key.
- Screenshot path: `apps/web/e2e/artifacts/qa-phase2/kit-failure-host-data-mode-changes-API-provider-admin.png`.
- Regression: `data-mode.spec.ts`, explicitly marked expected failure pending a product fix.

![Host reports fixtures while APIs still use kit](artifacts/qa-phase2/kit-failure-host-data-mode-changes-API-provider-admin.png)

Reproduction commands from repository root:

```sh
pnpm install
cd server
uv sync --python 3.11
uv run pytest
cd ..
pnpm -r test
pnpm --filter @lights-on/web e2e
# If another workspace owns the default e2e ports:
pnpm --filter @lights-on/web exec playwright test --config e2e/qa-phase2.config.ts
node apps/web/e2e/qa-phase2-sweep.mjs
```

The standalone sweep intentionally exits 1 while these findings remain; unlike the standard suite, its product checks are not marked expected failures. It owns temporary state and isolated servers on ports 18002/15175, and cleans up those servers after both modes. The optional suite config uses ports 18003/15176; the main suite retains its original configuration. Ensure the ignored local kit is installed for the unmocked kit and provider regression checks.

Machine-readable results: `apps/web/e2e/artifacts/qa-phase2/results.json`. Final sweep captured 145 screenshots across both modes, with screen/admin/all three phones per phase and important failures. Images remain local and gitignored; they are embedded above for local review. Example successful artifacts: `kit-hover-screen.png`, `kit-restarted-screen.png`, `fixtures-restarted-screen.png`, and `{kit,fixtures}-{INTRO,PITCH,CHALLENGE,NEGOTIATE,VERDICT,POWER_UP,REVIVED,EXPLORE}-{screen,phone-1,phone-2,phone-3}.png` in the same artifact directory.

Remaining work: coordinator assigns product fixes for the three findings, removes the two expected-failure annotations after they pass, and reruns the unmocked sweep. No contracts or product files were modified by QA.

## Phase 2 fixes: provider behavior

The host data-mode switch applies to the entire server process and every room, including new and restored rooms. `room_state` now includes `data_mode_scope: "process"`; the admin displays “all rooms.” `/api/health`, `/api/buildings` and dossier responses use the same selection. A switch validates the provider before changing state; an unavailable kit leaves the previous mode active and returns an error for the UI toast.

Run one server process for this mode switch. The choice lasts until process exit; on restart, `DATA_MODE` is authoritative, including for restored room snapshots. No `.env` file is modified. Clients invalidate pending and resolved dossiers when the reported mode changes, refetch building lists and prefetch all dossiers; late responses from the previous mode cannot repopulate the cache. Floor geometry remains the deterministic export of the same seven buildings in either mode.

Dossiers now keep `building_height_ft` as the kit value or null. Rendering uses `render.floor_height_m` with `render.floor_height_source` (`costar` or `assumption`); the 3.8 m fallback is labelled as an assumption and never presented as a building fact.
