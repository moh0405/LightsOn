# Task: Phase 5 latency (cut challenge timeouts)

Read AGENTS.md, docs/agent-workflow.md, the PR #18 body (gh pr view 18), evals/report.md, docs/agents/review-p5-claude.md,
server/app/agent/{live_agent,grounding,prompts,spend}.py. Setup: symlink /Users/momossss/Documents/GitHub/LightsOn/data and
.env; ledger = main checkout's server/state/bedrock_spend.json (~$2.56 of $3.00). Ports LO_E2E_API_PORT=19301
LO_E2E_WEB_PORT=16374. Branch `phase5/latency`. Failing test first, small commits, push after each.

## Problem
In the paid check 4/8 challenges fell back (3 timeouts, 1 number match); a batched challenge call for all pitches takes ~8 s
on Haiku 4.5, at the 8 s limit. Target: at most 1/8 fallbacks and the first grounded challenge on screen within ~3 s.

## Do
1. One challenge call PER PLAYER, in parallel (asyncio), each short (max_tokens ~150, one line + counteroffer), so the
   first player's grounded line can publish as soon as it passes grounding; others follow independently. Same total
   budget accounting through spend.py (reserve each call).
2. Shrink the per-call context: only the facts relevant to that pitch (hard limits, dark floors, the cited-fact
   candidates, desire hint), persona voice lines, and the pitch; use Bedrock prompt caching for the shared system prompt
   and fact table if available for Haiku 4.5 on this account (meter cache reads/writes; fall back silently if not).
3. Claim check only on lines that state a fact (skip pure counteroffer/voice lines that cite nothing and contain no
   numbers); run it in parallel with publishing the next player's line, never serially for all.
4. Fix the remaining number-match false positive from PR #18 and the "for years" unsupported history claim (reject
   duration claims like "for years/decades" unless a fact supports them).
5. Measure model-only latency per player: time to grounded line p50/p90.
6. One small paid check: 8 challenges + 2 verdicts, spend <= $0.12, stop before the ledger passes $2.70. Report fallback
   count by cause, latency p50/p90, and 3 verbatim model lines.

## Done means
pytest (kit mounted), pnpm -r test, evals --quick, full e2e 3x green, build. `gh pr create --base main --label agent:codex`;
end with "🤖 Generated with Codex, coordinated by Claude Code". worker_done with PR URL, fallback table, latency, ledger.
