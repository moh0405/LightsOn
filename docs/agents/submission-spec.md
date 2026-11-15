# Task: submission pack + tonight's test script (docs and scripts only)

No product code, NO Bedrock calls. Read docs/PRD.md (TL;DR, Sponsor strategy, Demo, Submission checklist),
docs/council/*.md, README.md, docs/handoff.md, evals/latency-check.md. Branch submission/pack (continue it if it exists).
Create:
1. scripts/demo.sh: one command for the human test tonight: checks .env keys present (names only), DATA_MODE=kit,
   AGENT_MODE=live, DEMO_MODE=1, starts server + web (like dev.sh), starts the cloudflared tunnel, waits for the tunnel URL,
   sets PUBLIC_BASE_URL for the QR, prints the /screen, /play and /admin URLs and a HOST_PIN reminder, cleans up on Ctrl-C;
   `--fixtures` (DATA_MODE=fixtures, AGENT_MODE=fake) for zero-cost rehearsal; `--dry-run` prints what it would start.
   Verify with bash -n and --dry-run.
2. docs/TEST-TONIGHT.md: 30-minute human test checklist (laptop/projector + 2-4 real phones): setup, the 2-minute demo path
   step by step, what to look/listen for (flick + vibrate on Android, sound Start button, light-up visible, subtitles),
   host reset, fallback to fixtures, how to report a bug fast (paste into Claude Code).
3. docs/submission/devpost.md: Devpost draft (inspiration, what it does, how we built it, challenges, accomplishments, what
   we learned, what's next, built with), honest about real / cached / simulated; never "vacant".
4. docs/submission/tracks.md: Entertainment, CoStar, Amazon, LangChain: 30-second ending script + evidence to show (file
   paths, trace panel, eval numbers from evals/latency-check.md). Photon not entered.
5. docs/submission/demo-script.md: the council's 2-minute script with exact lines.
PR label agent:claude; end the body with "🤖 Generated with Claude Code (Opus), coordinated by Claude Code".
worker_done with PR URL.
