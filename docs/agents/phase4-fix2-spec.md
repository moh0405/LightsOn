# Task: Phase 4 fix round 2 (Claude Opus review of PR #14)

Read AGENTS.md, docs/agent-workflow.md, docs/PRD.md "Characters", and docs/agents/review-p4fix-claude.md (file:line).
Setup: symlink /Users/momossss/Documents/GitHub/LightsOn/data and .env into the worktree; point the spend ledger at the main
checkout's server/state/bedrock_spend.json (ledger ~$1.684 of $3). Ports LO_E2E_API_PORT=18501 LO_E2E_WEB_PORT=15674.
Branch `phase4/fixes-2`. Small commits, failing test first, push after each.

## Fixes
1. Era voice survives: normalize_writer_persona / FICTION_WORDS must not delete in-character lines. Factual clauses still
   need citations with checked numbers/dates; emotional, fictional lines are allowed when they make no factual claim
   (denylist of claim patterns: numbers, years, tenant names, "was/used to be" history without a fact_ref). Log every dropped
   line with the reason. Tests: an in-character line survives; an uncited factual claim is dropped.
2. Hard limits trigger meaningfully: replace "rejects all 8 categories" with a numeric trigger per limit
   (e.g. {fact_ref, constraint, threshold, unit, text}, applied when a pitch needs more area/height/parking than the fact),
   plus optional category targeting only when justified (e.g. parking -> entertainment/food_retail). The fake agent's
   challenge picks a limit that actually applies to the pitch. Height and parking limits must be able to trigger. This
   changes HardLimit: approved by the coordinator; update models.py, types.ts, fixtures, readers and docs/PRD.md Core models.
3. Tests for the 4 reverts nothing caught (dossier Vexcel capture date, desire ids in merge_research, cache fingerprint,
   and the fourth listed in the review). Each must fail when its fix is reverted.
4. Update docs/PRD.md (Core models Persona, ~line 687) to the current Persona/HardLimit contract.
5. Regenerate Esperson's persona with ONE persona_writer call from the cached facts files, only if the pre-call estimate
   keeps the ledger under $2.90. Quote intro_line, catchphrase, 3 backstory lines and hard_limits verbatim in the PR.

## Done means
pytest (kit mounted) 0 failures, pnpm -r test, full e2e 3x green, build, `uv run python evals/run.py --quick`.
`gh pr create --base main --label agent:claude`, fixes mapped to tests, contract changes listed. End the body with
"🤖 Generated with Claude Code (Opus), coordinated by Claude Code". worker_done with PR URL + summary lines.
