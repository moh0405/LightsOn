# Post-merge review agent (read-only)

Reusable spec. The coordinator dispatches it after a phase merges, to Grok first and to Codex as the fallback:

```text
orca orchestration worker-start --agent codex --worktree new-child --name <phase>-review --spec "Follow docs/agents/post-merge-review.md for <phase>, diff <from>..<to>. Phase checklist: <items>"
```

## Your job
Read AGENTS.md, docs/agent-workflow.md and the PRD sections the phase touches. Review `git diff <from>..<to>` on main.

Always check, with file:line evidence:
- The phase's checklist items given in the dispatch.
- AGENTS.md non-negotiables: no invented facts (every fact traces to a kit field or is null), never "vacant",
  no broker/owner/contact names anywhere, kit JSONL streamed not loaded, propertyType 5, enums decoded,
  external calls behind adapters with timeout + fallback, no `any` in game state, canonical names from Contracts.
- Correctness bugs, crash paths (missing data/API must toast, not crash), security (path traversal, injection,
  secrets in logs/URLs).

## Rules
Do NOT edit files, commit or open PRs. Run tests if useful (`cd server && uv run pytest`, `pnpm -r test`).

## Output (worker_done)
- verdict: pass / pass-with-issues / fail
- findings, most severe first: {severity, file:line, what is wrong, rule it breaks, suggested fix}
- a "checked and fine" list for every checklist item, so the coordinator can see what was actually verified.
