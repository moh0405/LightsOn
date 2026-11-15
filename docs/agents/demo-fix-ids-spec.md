# Task: never show internal fact IDs in generated dialogue (demo must-fix 1, P0)
Read CLAUDE.md, docs/demo-scope.md and apps/web/e2e/dress-rehearsal-report.md (MUST-FIX 1). Branch fix/demo-fact-ids from
origin/main. Setup: symlink /Users/momossss/Documents/GitHub/LightsOn/data, .env and apps/web/public/media;
PREP_TRACE_DIR=/Users/momossss/Documents/GitHub/LightsOn/server/cache/prep. Ports LO_E2E_API_PORT=22011 LO_E2E_WEB_PORT=19081.
Bug: in the live round the accepted challenge was displayed as "Floor 7 has 31,503 listed available square feet... 
F_233953_floor_7_available_sqft" for ~25 s on /screen. Speech already strips it; the card does not.
Fix (smallest change that is safe):
1. Server: at the existing validation/grounding boundary in server/app/agent/live_agent.py (prepared_voice / challenge and
   verdict acceptance), remove fact-id tokens (F_<digits>_... and bare property ids used as ids) from every display string
   that goes to clients (challenge text, counteroffers, verdict lines, concept text). Citations stay only in fact_ids.
   Do not change models.py, events or commands; do not weaken grounding checks (strip after validation, or validate the
   stripped text too). Tidy leftover whitespace/punctuation.
2. Web defence: apply the existing speech id-removal rule to displayed dialogue in
   apps/web/src/screen/overlays/RoundOverlays.tsx (ChallengeCards and verdict copy) and the phone view if it shows the
   same strings. Keep the readable "Source" evidence line.
3. One regression test each side using the exact leaked line above.
Constraints: demo path only; no new features; no invented facts; never the word "vacant"; no contacts. No paid Bedrock calls.
Gates before PR: uv run pytest (server), pnpm -r test, pnpm --dir apps/web build, uv run python evals/run.py --quick
(agent code changed). Small commits, push after each. PR to main, label agent:codex, footer
"🤖 Generated with Codex, coordinated by Claude Code". Target: PR within 25 minutes. Run commands in the foreground;
all browsers silent (apps/web/e2e/silence.ts); end with worker_done.
