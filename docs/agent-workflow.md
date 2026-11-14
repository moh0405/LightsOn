# Agent workflow

Claude Code is the coordinator. It plans, writes task specs, reviews PRs and merges.
Coding goes to cheaper agents through Orca workers or PRs. Every agent follows AGENTS.md.

## Who does what

| Agent | Label | Use for |
| --- | --- | --- |
| Codex (main coder) | `agent:codex` | Feature code for each phase, refactors, every Playwright / headless browser test |
| Grok | `agent:grok` | Second opinion reviews, prompt and persona writing, eval cases (`evals/pitches.yaml`) |
| Gemini Pro | `agent:gemini` | Long-context work: reading the CoStar kit docs, PRD cross-checks, docs and README |
| Antigravity (`agy`) | `agent:antigravity` | Backup coder when Codex is busy; UI/visual work (skyline, overlays) |
| Claude Code | `agent:claude` | Coordination, contract changes (models.py, events, commands), merges, final review |

CLIs on this machine (checked 2026-11-13): `codex`, `agy` (Antigravity 1.5.8, logged in), `grok` 1.0.77
(logged in), `gemini` 0.68.0 (installed, needs Gemini auth before use).

Headless one-shots: `grok -p "<prompt>"`, `gemini -p "<prompt>"`, `agy --print "<prompt>"`.

## Branches and PRs

- One branch per task: `phaseN/<short-name>` off `main`. Never commit straight to `main` from a worker.
- PR title: `phaseN: <what changed>`. Label it with the agent that owns it.
- PR body: what changed, how it was tested (commands + results), anything that touches a contract.
- Merge only when `uv run pytest` (in `server/`), `pnpm -r test` and the Playwright suite pass.

## Testing: Playwright, headless, run by Codex

There is one real phone. Multi-phone checks run in Playwright with one browser context per player
(mobile viewport, touch enabled) plus one desktop context for `/screen` and one for `/admin`.

- Tests live in `apps/web/e2e/`, run with `pnpm --filter @lights-on/web e2e`.
- The suite starts its own server and web app (Playwright `webServer`) with `STATE_DIR` pointed at a temp dir.
- Every phase's exit gate gets an e2e spec before the phase is called done.
- Human phone check is still needed for real sensors (orientation, motion, vibrate) from Phase 3 on.

## Briefing Codex (task spec template)

Specs must stand alone. Include:

1. Goal and the PRD section / exit gate it serves.
2. Files it may create or edit; files it must not touch (models.py, event/command names, .env, data/).
3. Branch name, commit prefix, and "open a PR with label agent:codex".
4. Evidence required: commands run and their output summary, PR URL.
5. Stop and ask (instead of guessing) if a contract change is needed.

Dispatch from Claude Code:

```text
orca orchestration worker-start --agent codex --worktree new-child --name <short-name> --spec-file <spec.md>
```

Swap `--agent codex` for `antigravity`, `grok` or `gemini` to route to another agent.
