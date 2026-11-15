# Task: visible, audible live demo run the user watches (no product code changes)
Read CLAUDE.md, docs/demo-scope.md, docs/submission/demo-script.md and the "Fix round" section of
apps/web/e2e/dress-rehearsal-report.md. Work in a new branch qa/visible-demo-run from origin/main (git pull first).
Goal: the user sits at this Mac and WATCHES and HEARS one complete Esperson demo round driven by Playwright.
Use the REAL running demo stack, do not start another server: web http://localhost:5173 (Vite, proxies to the game server
on port 8000: DATA_MODE=kit, AGENT_MODE=live, DEMO_MODE=1). Check http://127.0.0.1:8000/api/health first; if it is down,
stop and report (do not restart it).
Browser: Playwright Chromium HEADED (headless: false), not muted, no e2e/silence.ts. The app speaks at volume 0 when
navigator.webdriver is true, so launch with --disable-blink-features=AutomationControlled (and ignoreDefaultArgs
['--enable-automation'], --autoplay-policy=no-user-gesture-required) and assert navigator.webdriver is false and that
SpeechSynthesisUtterance volume is > 0 before the round. Click "Start audio" on /screen if it is shown.
Windows: /screen at 1920x1080 as the main window; two phone contexts (390x844, separate storage) as separate smaller
windows placed beside it so all three are visible; /admin only when needed (HOST_PIN from the repo .env; never print it).
Run, at human pace with NATURAL timers (no host skips, no clock mocks, ~1 s pauses between actions, type pitches with a
visible per-key delay): 1) fresh room, both phones join through the QR url as Maya and Leo; 2) aim at Esperson, Wake;
3) dive + intro (aerial, Matterport lobby tour, voice); 4) two realistic typed pitches, challenge, one typed revision,
verdict + score card; 5) tap power-up to 100%, light-up, concept card, city meter; 6) press M (walk-in, leave open ~7 s,
Escape), T (trace panel), H (host controls); 7) Reset room. Then leave the windows open for 20 s and close them.
Exactly ONE live round. Spend <= $0.12: read server/state/bedrock_spend.json before and after; do not start if the
ledger is above $4.20. Record: per-line first-word latency and whether any speech was still playing when the next phase
began; whether challenge and verdict came from the live model or a fallback (and the cause); any raw fact id, the word
"vacant", contact names, console errors or page errors on /screen; whether the pointer label stayed off the tower.
Also save a screen video of the /screen page (Playwright recordVideo) to /tmp/lights-visible-run/ and report its path.
Output: apps/web/e2e/visible-demo-run-report.md (short: beat table PASS/FAIL, timings, live vs fallback, spend, issues
ranked) with the harness in apps/web/e2e/visible-demo-run.spec.ts + its config. PR to main, label agent:codex, footer
"🤖 Generated with Codex, coordinated by Claude Code". Do not fix product code; report must-fixes instead.
Start the visible run within 10 minutes of starting this task. Run commands in the foreground; end with worker_done.
