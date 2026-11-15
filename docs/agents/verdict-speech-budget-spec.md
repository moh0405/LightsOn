# Task: verdict speech must finish before the power-up and light-up (demo path, ~20 minutes)
Read CLAUDE.md, docs/demo-scope.md and apps/web/e2e/visible-demo-run-report.md (ranked issue 1). Branch
audio/verdict-budget from origin/main. Setup: symlink /Users/momossss/Documents/GitHub/LightsOn/data, .env and
apps/web/public/media; PREP_TRACE_DIR=/Users/momossss/Documents/GitHub/LightsOn/server/cache/prep. Ports
LO_E2E_API_PORT=22031 LO_E2E_WEB_PORT=19095. All test browsers silent (apps/web/e2e/silence.ts). No paid Bedrock calls.
Bug (live round, real Chrome, real timers): the live verdict was ready 6.6 s into VERDICT, its first word came 385 ms
later, and the spoken verdict kept going 7.8 s into POWER_UP and 4.4 s into REVIVED, talking over the charge and the
light-up, which is the key moment of the demo. The server already arms the 10 s VERDICT timer after the verdict
resolves, so the spoken verdict is simply too long for its window.
Fix in the web speech path only (the code PR #44 added for budgeting challenges into CHALLENGE: look in
apps/web/src/screen/ScreenApp.tsx, music.ts/speech code and overlays). Budget the verdict the same way: speak what fits
in the time left in VERDICT (winner + reason line first; the desire reveal only if it fits), keep the full text on the
score card, never cut a sentence mid-word, and drop anything still queued when POWER_UP begins. Do NOT edit
apps/web/src/screen/City.tsx or skyline.ts (another worker owns them), server code, models, events or commands.
Also: add a favicon (inline SVG data URI in apps/web/index.html is fine) so /screen has no favicon 404 in the console.
Prove it: unit test for the budget, and the existing audio-lag natural-timer spec (fake agent, DEMO_MODE=1) extended to
assert no utterance is speaking when POWER_UP begins, including a long verdict (use a ~45-word reason line fixture).
Gates: pnpm -r test, pnpm --dir apps/web build. Small commits, push after each. PR to main, label agent:claude, footer
"🤖 Generated with [Claude Code](https://claude.com/claude-code)". Run commands in the foreground; end with worker_done.
