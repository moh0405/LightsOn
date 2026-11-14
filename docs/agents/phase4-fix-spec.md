# Task: Phase 4 fixes (Codex + Claude Opus reviews)

Read AGENTS.md, docs/agent-workflow.md, docs/PRD.md "Characters" (all subsections) and "AI architecture", and both reviews:
docs/agents/review-p4-codex.md and docs/agents/review-p4-claude.md (file:line evidence, reproductions, proposed changes).
Setup: symlink /Users/momossss/Documents/GitHub/LightsOn/data and /Users/momossss/Documents/GitHub/LightsOn/.env into the
worktree (never commit/print). The shared spend ledger is the main checkout's server/state/bedrock_spend.json ($1.62 of
the $3 cap used); point BEDROCK_SPEND_LEDGER (or equivalent) at it so the cap is shared. Use LO_E2E_API_PORT=18401
LO_E2E_WEB_PORT=15574. Branch `phase4/fixes`. Small commits per fix, a failing test first, push after each.

## Fixes
1. P1 cache poisoning: the model's writable workspace is a separate directory from trusted outputs; trusted dossier/persona
   are written only by deterministic code after validation; a failed prep never leaves a trusted cache. Test reproduces it.
2. P1 hard limits: typed physical constraints derived from facts (e.g. {fact_ref, constraint, rejects_categories}) that the
   fake/live agent can use to push back on a pitch; identity facts (name, address, dates, class) are never limits;
   at least 2 limits required when facts allow, else explicitly empty with a reason.
3. P2 spend: meter the model id and output bound actually sent (all kwargs/overrides), account for prompt caching tokens
   (cache read/write) with correct prices; no call path bypasses the wrapper. Tests.
4. P2 auth: POST /api/buildings/{id}/prep with force=true requires HOST_PIN (header), constant-time compare; without force it
   only returns the cached result and never calls Bedrock. Tests.
5. P2 voice: replace "My dossier records/lists..." prose. Implement the reviews' proposal: structured backstory beats whose
   numbers/dates are checked against the cited fact (not near-copies of fact text), derived facts (dark floor count and sq ft,
   tenancy record counts, top former industries from tenant_history), and an era-voice table (1941 completion -> old-Houston
   art-deco pride, etc.). Persona must sound like an in-character Shark Tank investor while every factual claim cites a fact.
6. P2 desire: desire_key must carry a justification fact_ref list; validator checks the cited facts support it.
7. P2 Vexcel provenance: the detection's capture date comes from the detection/imagery response itself, else null (no
   borrowed date); regenerate fixtures; CoStar facts unchanged; Esperson 6-8 dark 31,503.

## One real Bedrock run (budget)
After all tests pass, regenerate ONLY Esperson's persona: re-run just the persona_writer step from the cached
facts_property/facts_spatial files (no re-scouting). Before calling, estimate cost from token counts; proceed only if the
estimate + ledger stays under $2.90. If not affordable, keep the old persona and say so. Report the new intro_line,
catchphrase, hard_limits and 3 backstory beats verbatim in the PR, plus the ledger total.

## Done means
pytest (kit mounted, 0 failures), pnpm -r test, full e2e 3x green, build, `uv run python evals/run.py --quick`.
`gh pr create --base main --label agent:codex`, each fix mapped to its test. End the body with
"🤖 Generated with Codex, coordinated by Claude Code". worker_done with PR URL + summary lines.
