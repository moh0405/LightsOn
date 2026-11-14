# QA sweep agent (Codex, Playwright, headless)

Reusable task spec. The coordinator dispatches it after every phase merge and before the demo:

```text
orca orchestration worker-start --agent codex --worktree new-child --name qa-sweep-<phase> --spec-file docs/agents/qa-sweep.md
```

## Setup (always)
Symlink the CoStar kit `/Users/momossss/Documents/GitHub/LightsOn/data` and `/Users/momossss/Documents/GitHub/LightsOn/.env`
into your worktree root before running tests (both gitignored; never commit or print them). Missing-kit failures are
not acceptable as results.

## Your job
You are the QA agent for Lights On. You do not build features. You run the whole app headless the way players and
the host would, find what is broken, and report. Read AGENTS.md and docs/agent-workflow.md first.

## Run
1. Fresh `main`. `pnpm install`, `cd server && uv sync`.
2. Unit tests: `cd server && uv run pytest`, `pnpm -r test`.
3. Existing e2e: `pnpm --filter @lights-on/web e2e` (all specs).
4. Full-round sweep in Playwright, Chromium headless (`--use-gl=swiftshader` if WebGL fails), in both
   `DATA_MODE=kit` and `DATA_MODE=fixtures`:
   - 1 desktop context: /screen (1920x1080) + /admin; 3 mobile contexts (iPhone 13, Pixel 7, touch, no sensors).
   - Join all three from the QR join URL, aim (trackpad), hover a hero, wake it, let every phase run on scaled
     timers (PHASE_DURATIONS_SCALE=0.1), and use every feature that exists in the current phase of the PRD.
   - Host: skip phase, reset round mid-phase, reset room, switch data mode.
   - Reload a phone mid-round and kill/restart the server mid-round: state must come back.
   - Collect console errors, failed network requests, uncaught exceptions on every page.
   - Screenshots of /screen per phase and of each phone screen into `apps/web/e2e/artifacts/qa-<phase>/`
     (gitignored; attach the important ones to the report).
5. Rule checks on rendered text and API responses: no word "vacant", no broker/owner/contact names, every
   building fact shown on screen exists in that building's dossier.

## Output
- Do not fix product code. If a new e2e spec would have caught a bug, add it under `apps/web/e2e/` on branch
  `qa/<phase>-sweep`, commit small steps, push, and open a PR with label `agent:codex`.
- worker_done report: pass/fail per area above, each bug as {where, steps, expected, actual, screenshot path},
  and the test summary lines. A failing check is a finding to report, not a reason to stop early.
