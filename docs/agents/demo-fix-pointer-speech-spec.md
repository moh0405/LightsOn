# Task: pointer label off the selected tower + speech phase re-check (demo must-fix 3 and 2)
Read CLAUDE.md, docs/demo-scope.md and apps/web/e2e/dress-rehearsal-report.md (MUST-FIX 2 and 3). Branch
fix/demo-pointer-speech from origin/main (audio PR #44 is now merged there). Setup: symlink
/Users/momossss/Documents/GitHub/LightsOn/data, .env and apps/web/public/media;
PREP_TRACE_DIR=/Users/momossss/Documents/GitHub/LightsOn/server/cache/prep. Ports LO_E2E_API_PORT=22012 LO_E2E_WEB_PORT=19082.
All browsers silent (apps/web/e2e/silence.ts). Do NOT edit server/app/agent/live_agent.py or
apps/web/src/screen/overlays/RoundOverlays.tsx display-text code (another worker owns the fact-id fix there).
A) Pointer (P1), apps/web/src/screen/City.tsx around data-testid="dot": on /screen at 1920x1080 the aim dot and nickname
   cover Esperson's selected roof/facade. Make the marker a small hollow ring and place the nickname outside the selected
   building's projected bounds (short leader line is fine). Pointer movement and highlight stay immediate and local
   (never wait on a network or AI call). One regression check (unit or Playwright) that the nickname box does not
   intersect the selected building's projected bounds for Esperson. Before/after screenshot in
   apps/web/e2e/screenshots/dress/.
B) Speech phase discipline (P0), verify on current main first: DEMO_MODE=1, DATA_MODE=kit, Esperson, /screen 1920x1080,
   2 phone contexts, natural timers (no host skips, no clock mocks). Run 2 fake-agent rounds, then ONE AGENT_MODE=live
   round (spend <= $0.10; ledger /Users/momossss/Documents/GitHub/LightsOn/server/state/bedrock_spend.json; abort above
   $3.40). Instrument speechSynthesis as the dress rehearsal did. Required: verdict first word <= 300 ms after the verdict
   line arrives; no challenge speech still playing when VERDICT begins; thinking/placeholder lines are not spoken (subtitle
   only) and never repeated; every started utterance ends; no sentence cut mid-word. If any fails, fix it in the web speech
   queue (drop stale queued sentences at phase change, let the current sentence finish) with one regression test, and
   re-measure. Do not change server phase durations, models, events or commands.
Output: append a short "Fix round" section to apps/web/e2e/dress-rehearsal-report.md with the timing table and PASS/FAIL.
Gates before PR: pnpm -r test, pnpm --dir apps/web build (and uv run pytest only if server code changed). Small commits,
push after each. PR to main, label agent:codex, footer "🤖 Generated with Codex, coordinated by Claude Code".
Target: PR within 35 minutes. Run commands in the foreground; end with worker_done.
