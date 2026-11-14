# Task: Phase 5 live-agent quality (fallback rate)

Read AGENTS.md, docs/agent-workflow.md, docs/PRD.md "AI architecture" (Live mode, Grounding, Building system prompt) and
evals/report.md (main). Setup: symlink /Users/momossss/Documents/GitHub/LightsOn/data and .env; spend ledger = main
checkout's server/state/bedrock_spend.json (now $2.44 of the $3.00 cap). Ports LO_E2E_API_PORT=19201 LO_E2E_WEB_PORT=16274.
Branch `phase5/live-quality`. Failing test first, small commits, push after each.

## Problem
The paid eval published 14 template fallbacks in 15 steps: almost every challenge is the same canned line
"Floor 6 has 31,503 listed available square feet. How does your idea fit?". The one real model line was great. The
"city fights back" moment must come from the model, grounded. A 3 s socket timeout during the paid run is a suspect.

## Do
1. Diagnose OFFLINE first (no Bedrock): from the logs, agent_step records, eval artifacts and retained responses, classify
   every fallback by cause (timeout, invalid JSON, fact-id check, number match, claim check, safety, budget). Put the table in
   the PR. If raw model outputs were not kept, add logging of rejected candidates (line, cited ids, failing check) to
   server/state/ (gitignored) so the next run is diagnosable.
2. Fix the real causes with tests built from the rejected candidates: e.g. number matching must accept "31,503 sq ft",
   "about 31,500 square feet", "31.5k", years without separators, percentages from say_as; claim check must not reject
   fictional mood/voice or counteroffers that state no fact; the prompt must show the model the exact say_as wording and the
   persona voice and ask for one constraint + one counteroffer tied to the desire.
3. Fallbacks must not all be identical: deterministic fallback picks a limit/fact that applies to that pitch (hard limits
   first), varies across players in a round, and uses the persona voice and catchphrase (no new facts).
4. Keep the PRD timeouts (challenge 8 s, verdict 12 s) end to end; one batched challenge call per round.
5. One small paid check AFTER offline fixes: at most 8 challenge cases + 2 verdicts, total spend <= $0.20, and stop before
   the ledger passes $2.70. Report the fallback count by cause and quote 3 model challenge lines verbatim.

## Done means
pytest (kit mounted), pnpm -r test, evals --quick, full e2e 3x green, build. Fallback rate in the small paid check reported
honestly (target: at most 1 in 8 challenges). `gh pr create --base main --label agent:codex`; end the body with
"🤖 Generated with Codex, coordinated by Claude Code". worker_done with PR URL, fallback table, ledger total.
