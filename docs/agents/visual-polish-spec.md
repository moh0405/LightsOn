# Task: start-screen 3D look + selection/dive animation (run AFTER camera-framing merges)
Human playtest: the 3D skyline on the start screen "looks very shit" and selecting a building/floor and the dive animation
don't feel as intended. Read docs/PRD.md Visuals and audio and apps/web/e2e/audit-report.md (if present). Setup: symlink /Users/momossss/Documents/GitHub/LightsOn/data, .env and apps/web/public/media into the worktree (gitignored; never commit/print); PREP_TRACE_DIR=/Users/momossss/Documents/GitHub/LightsOn/server/cache/prep. Spend ledger = the main checkout server/state/bedrock_spend.json (BEDROCK_SPEND_LEDGER). Small commits, failing test first, push after each. Run commands in the foreground; end with worker_done. Ports
LO_E2E_API_PORT=21801 LO_E2E_WEB_PORT=18874. Branch visual/polish. Make it cinematic and readable at 1080p: night sky gradient
and fog/horizon, ambient + directional light so buildings have shading and edges, context buildings dim blue-gray with subtle
roof/edge lines, hero buildings clearly distinct with per-floor window bands (dark/partial/occupied/unknown colors per PRD),
a soft glow for lit floors, gentle slow orbit on attract, ground plane/streets hint, no z-fighting/flicker. Selection: the
beam hover outlines the building smoothly (no flicker), the hovered building lifts/glows, the floor under the beam highlights,
a clear 'Wake' affordance; the wake dive is a smooth 2.5 s eased flight that ends with the whole building framed (uses the
camera-framing logic); light-up per PRD. Keep >= 50 fps at 1080p (measure frame times in Playwright) and no new console
errors. Before/after screenshots and a short frame-time table in the PR. Gates: pnpm -r test, full e2e, build. PR label
agent:codex, footer "🤖 Generated with Codex, coordinated by Claude Code".
