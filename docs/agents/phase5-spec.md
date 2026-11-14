# Task: Phase 5, live agent, grounding and evals (Lights On)

Read AGENTS.md, docs/agent-workflow.md, docs/overnight-log.md, docs/PRD.md "AI architecture" (Live mode, Grounding,
Action validation, Prompt-injection and safety, Building system prompt), "Testing and evals" (3. Agent evals) and "Phase 5".
Then server/app/agent/*, server/app/actions.py, rooms.py, commands.py, evals/run.py, server/fixtures/personas/233953.json.
Setup: symlink /Users/momossss/Documents/GitHub/LightsOn/data and .env into the worktree; point the spend ledger at the
main checkout's server/state/bedrock_spend.json (shared cap). Ports LO_E2E_API_PORT=19001 LO_E2E_WEB_PORT=16074.
Branch `phase5/live-agent`. Small commits (phase5: ...), tests first, push after each.

## Budget (hard)
Ledger is ~$1.75 of BEDROCK_SPEND_CAP_USD=3.00. All Bedrock calls go through spend.py. Unit tests and e2e use fake models
only. The real eval may spend at most $0.80 total: estimate before running, use the fast model
(us.anthropic.claude-haiku-4-5-20251001-v1:0) for challenges and claim checks and the smart model
(us.anthropic.claude-sonnet-4-6) for verdicts only, small max_tokens, and stop the run (reporting partial results) before
the ledger would pass $2.60. Leave at least $0.40 for the live demo.

## Build
1. `server/app/agent/prompts.py`: the PRD Building system prompt template filled from persona + dossier FACTS table
   (id | say_as | value unit | source | kind) + mood + city needs (game simulation) + memory summary. Pitches wrapped as
   `<pitch player="pN">...</pitch>`, never instructions. Persona HardLimits are listed as the building's constraints.
2. `server/app/agent/live_agent.py`: same interface as fake_agent (challenge, verdict, intro). Challenge = one structured
   call on the fast model returning Challenge[] for all pitches; verdict = one structured call on the smart model returning
   VerdictProposal. JSON/structured output validated by Pydantic; on invalid JSON retry once then fall back to fake_agent for
   that step (logged, agent_step emitted). Stream text deltas of the challenge line to /screen subtitles (a new event is a
   contract change: reuse an existing event or ask the coordinator first). Timeouts (challenge 8 s, verdict 12 s) with
   fake_agent fallback, so the round never stalls.
3. `server/app/agent/grounding.py`: (a) every fact_id exists in the building's dossier; (b) every number in the line
   matches a cited fact's value with unit tolerance (or this round's impact estimate); (c) claim check with the fast model
   ("Does this line state any physical or historical claim not supported by these facts? JSON"); fail -> regenerate once
   with the reason -> templated fallback from the cited fact's say_as. Estimates phrased "looks like". Never "vacant".
4. Mood: one step per scored pitch (data fit >= 7 toward flattered, <= 3 toward offended; injection -> offended), carried in
   building_intro/counteroffer mood and room_state.
5. Safety: block list + short in-character refusal for slurs, sexual content, real people, politics; injection treated as
   a bad pitch and roasted gently; verdict card footer "Game character. Not a feasibility assessment."
6. Flag: `AGENT_MODE=fake|live` (default fake in tests and when the cap is reached or Bedrock fails). Host can switch it via
   host_action set_data_mode? No: add AGENT_MODE env only; no new commands.
7. `evals/pitches.yaml`: >= 15 cases per hero (Esperson 233953, Wells Fargo 233899 with fake persona fallback) covering
   strong fit, impossible, borderline, desire match, funny, injection, unsafe, mixed language, equivalent pitches.
   `evals/run.py`: `--quick` = fake agent, no network (CI); `--live` = real Bedrock under the budget above, 3 repeats of
   the verdict cases for winner stability; measures first-subtitle and full-line latency; writes evals/report.md with
   grounding %, schema %, winner stability %, latency p50/p90, spend.

## Done means
pytest (kit mounted), pnpm -r test, full e2e 3x green, build, `uv run python evals/run.py --quick` green, ONE
`evals/run.py --live` within budget with evals/report.md committed. Exit-gate targets: grounding 100%, schema 100%, same
winner >= 90% of 3 runs, first subtitle <= 3 s, full challenge line <= 6 s p90; report honestly if a target is missed.
`gh pr create --base main --label agent:codex`; end the body with "🤖 Generated with Codex, coordinated by Claude Code".
worker_done with PR URL, eval numbers and ledger total.
