# Task: demo-path dress rehearsal (headless, silent) and must-fix list
Read docs/demo-scope.md and docs/submission/demo-script.md. Setup: symlink /Users/momossss/Documents/GitHub/LightsOn/data,
.env and apps/web/public/media; PREP_TRACE_DIR=/Users/momossss/Documents/GitHub/LightsOn/server/cache/prep. Ports
LO_E2E_API_PORT=22001 LO_E2E_WEB_PORT=19074. Branch qa/dress-rehearsal. All browsers silent (use apps/web/e2e/silence.ts).
Run the exact demo: DEMO_MODE=1, DATA_MODE=kit, /screen at 1920x1080 Chromium, 2 phone contexts, host /admin, Esperson.
A) Three full rounds with the fake agent, real timers. B) ONE live round (AGENT_MODE=live) with two realistic typed pitches
and a revision; spend <= $0.10 (ledger: main checkout server/state/bedrock_spend.json; abort above $3.35).
For every beat in docs/demo-scope.md steps 1-7 record PASS/FAIL with a 1920x1080 screenshot and timings: QR join; hover
highlight + Wake; dive ends with the whole tower framed; intro aerial; Matterport lobby tour autoplays and stays >= 6 s;
subtitles and first spoken word latency per line (instrument speechSynthesis; every started utterance must end; nothing
cut mid-sentence; nothing spoken after its phase); challenge is grounded and specific (live round: quote lines, count
fallbacks and causes); score card + footer; power-up; light-up visible (lit pixels); concept card appears after REVIVED
(a screenshot once showed only the charge bar: investigate); city meter; M walk-in opens and stays; T trace panel; H host
controls; Reset room; zero console errors on /screen (the embedded Matterport player sometimes logs 'ApolloError: Failed
to fetch': decide whether it is ours to silence/guard); pointer dot + nickname must not cover the selected building; no
'vacant', no raw ids, no contacts. A main-branch audio PR may merge while you run: pull and re-run the audio beats.
Output: apps/web/e2e/dress-rehearsal-report.md with the beat table and a ranked MUST-FIX list (demo-breaking or
judge-visible only) with suggested fixes; curated screenshots in apps/web/e2e/screenshots/dress/. Do not fix product code.
PR label agent:codex, footer "🤖 Generated with Codex, coordinated by Claude Code". Be fast: report within ~40 minutes.
Run commands in the foreground; end with worker_done.
