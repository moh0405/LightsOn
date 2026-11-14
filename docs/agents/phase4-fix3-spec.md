# Task: Phase 4 fix round 3 (Codex final review)

Read AGENTS.md, docs/agent-workflow.md and docs/agents/review-p4-final-codex.md (file:line, reproductions). Setup: symlink
/Users/momossss/Documents/GitHub/LightsOn/data and .env into the worktree; spend ledger = main checkout's
server/state/bedrock_spend.json. NO Bedrock calls. Ports LO_E2E_API_PORT=19101 LO_E2E_WEB_PORT=16174.
Branch `phase4/fixes-3`. Failing test first for each fix, small commits, push after each.

A Phase 5 worker is editing server/app/agent/ (live_agent.py, grounding.py, prompts.py, spend.py streaming, rooms.py) in
parallel: keep your changes minimal and local to persona.py, prep_agent.py, main.py, the listed tests and
data-mode.spec.ts so the merge stays easy.

## Fixes
1. P1 persona.py:240: uncited factual claims (e.g. "I have a gym", "my fire stairs", "asbestos-free") pass as fiction.
   A denylist cannot cover everything: make fiction lines pass only when they contain no physical/building-feature or
   historical claim. Use a curated physical-feature lexicon (amenities, systems, materials, safety, structure, rooms,
   tenants, events) plus the existing numeric/proper-noun/past-tense checks; anything matching needs a fact_ref. Add the
   review's examples and a few of your own as tests, and confirm the shipped Esperson persona still validates.
2. P2 persona.py:347: width/length dimensions mistaken for height; only buildingHeightInFeet (or explicit height facts)
   may produce a height limit. Test.
3. P3 equality boundaries: pitches exactly at a threshold do not trigger; tests for > vs >= on every limit kind so a
   mutation fails.
4. The inherited items in the report: missing prep error toasts (main.py:113), scout ownership (prep_agent.py:56), HTTP
   floor rebuilding (main.py:108), each as the report suggests, with tests.
5. data-mode.spec.ts:29 repeat isolation: each test starts from a known data mode (reset in a fixture), so
   --repeat-each=3 passes.

## Done means
pytest (kit mounted), pnpm -r test, full e2e 3x green, e2e data-mode spec --repeat-each=3, build, evals --quick.
`gh pr create --base main --label agent:claude`; end the body with "🤖 Generated with Claude Code (Opus), coordinated by
Claude Code". worker_done with PR URL + summary lines.
