# Task: Phase 2 fixes (from Codex review + QA sweep)

Read AGENTS.md, docs/agent-workflow.md, docs/PRD.md "Data layer" (Floor status rule, Dossier schema, Floor geometry),
apps/web/e2e/qa-phase2-report.md and the expected-failure specs apps/web/e2e/floor-status.spec.ts and data-mode.spec.ts.

Branch `phase2/fixes` off main. Small commits per fix (`phase2: ...`), tests first, push after each commit.

## Fixes
1. Floor colors. Baseline color comes from `source_status` (dark `#1a1d2b`, partial `#4a4636`, occupied `#f2c46d`, unknown `#3a3f52`).
   `game_status` only overrides when a building is revived in-game. Initial `game_status` in build_floors.py and
   build_dossier.py is `"dark"` for dark floors and `null` otherwise (no "lit" for floors that never changed).
   Update apps/web/src/lib/floor-colors.ts and its tests. Regenerate floors.geojson and dossiers.
2. Null occupied area. In build_dossier.py keep `occupied_sqft = null` when any current tenancy on the floor has a null
   `squareFeetOccupied` (do not coalesce to 0). Coordinator decision: a floor with ANY current tenancy record can never be
   `dark`; classify it `partial` if A > 0, else `occupied`. Add this to floor_status.py with a unit test and a kit test
   for One Allen Center (233935) floor 13 (floor id 611792) not being dark. Esperson floors 6-8 must stay dark, 31,503.
3. Floor height assumption. Dossier `building_height_ft` = kit value or null. Store the rendering spacing separately,
   e.g. `render: {floor_height_m: 3.8, floor_height_source: "assumption"}` (or "costar" when derived from the kit).
   No unlabelled 3.8 anywhere. Update the UI only if it reads the old field.
4. Instant hover facts. Prefetch all building dossiers when the skyline loads (City.tsx / lib/buildings.ts) so the first
   hover card renders from cache. Keep the network-free outline. Add a Playwright assertion that the first hover shows
   facts without a "Loading" state once the skyline is ready.
5. Data mode label. A room's `data_mode` defaults to the server's DATA_MODE env (not hard-coded "kit").
6. Host data-mode switch. `set_data_mode` must switch the provider used by /api/buildings for that room's game, or, if the
   provider is process-wide, switch it process-wide and say so in the room_state. Keep it simple and documented; it must
   not leave the label and the actual data source disagreeing. Add a pytest.

## Done means
- The two expected-failure specs are flipped to normal passing tests.
- `cd server && uv run pytest`, `pnpm -r test`, `pnpm --filter @lights-on/web e2e`, `pnpm --filter @lights-on/web build` pass.
- Re-run `apps/web/e2e/qa-phase2-sweep.mjs` unmocked in kit and fixtures modes: report the new pass counts (target 13/13 each).
- `gh pr create --base main --label agent:codex`, body lists each fix with its test. End with:
  🤖 Generated with Codex, coordinated by Claude Code
- worker_done with PR URL and summary lines. If a fix needs a contract change in models.py, events or commands, ask first.
