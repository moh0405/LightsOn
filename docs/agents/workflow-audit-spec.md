# Task: full headless workflow audit (read-mostly)
Act as a meticulous QA tester of the WHOLE product on current main, headless, and report every defect, however small.
Setup: symlink /Users/momossss/Documents/GitHub/LightsOn/data, .env and apps/web/public/media into the worktree (gitignored; never commit/print); PREP_TRACE_DIR=/Users/momossss/Documents/GitHub/LightsOn/server/cache/prep. Spend ledger = the main checkout server/state/bedrock_spend.json (BEDROCK_SPEND_LEDGER). Small commits, failing test first, push after each. Run commands in the foreground; end with worker_done. Ports LO_E2E_API_PORT=21701 LO_E2E_WEB_PORT=18774. NO Bedrock calls except reading recorded logs. Branch qa/audit.
1) External APIs: call the real CoStar index/provider for all 7 buildings (facts, floors, dark floors vs the floor rule),
   Vexcel (adapter health with the real key, cached files present, one live property/extract call for Esperson), Matterport
   (public player API for every model id; showcase URL loads in a real iframe in Chromium and stays visible; measure how long
   the INTRO shows it and why it disappears after ~1 s), /api/health, /api/buildings, /api/buildings/{id}, /persona, /trace,
   /tours if present. 2) Every screen (/screen, /play, /admin) at 1920x1080, 1440x900, 1280x720 and phone sizes; every phase of
   a 2-player round for EVERY wakeable building; hover/aim/select a building and a floor; the dive, intro media, subtitles,
   audio timeline (speak timings), challenge cards, score card, power-up, light-up, concept card, city meter, trace panel,
   walk-in; host controls; reload/restart. Screenshot each beat into apps/web/e2e/artifacts/audit/ (gitignored) and commit a
   curated set to apps/web/e2e/screenshots/audit/. 3) Rate visual quality honestly (start-screen 3D look, selection and dive
   animation smoothness: measure frame times). Output apps/web/e2e/audit-report.md: a ranked defect list {severity, where,
   steps, expected, actual, screenshot, suggested fix, owner area: camera/visual/audio/persona/matterport/api/ui}. Do not fix
   product code. PR label agent:codex, footer "🤖 Generated with Codex, coordinated by Claude Code".
