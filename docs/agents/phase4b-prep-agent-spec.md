# Task: Phase 4B, prep deepagent on Bedrock + persona (Lights On)

Read AGENTS.md, docs/agent-workflow.md, docs/overnight-log.md (AWS + spend-cap notes), docs/PRD.md "Characters" (all
subsections), "AI architecture" (Prep mode, Grounding, Prompt-injection and safety), "Phase 4", "Testing and evals".
Then server/app/agent/, server/app/data/ (incl. vexcel.py/matterport.py from 4A if merged), server/fixtures/dossiers/.

## Facts you must use
- AWS credentials come from the default chain (~/.aws). Do NOT put keys in .env or code. Region AWS_REGION.
- Models from .env: BEDROCK_SMART_MODEL_ID=us.anthropic.claude-sonnet-4-6 (prep, persona), BEDROCK_FAST_MODEL_ID=
  us.anthropic.claude-haiku-4-5-20251001-v1:0. Claude 5.x is NOT enabled on this account.
- BUDGET: AWS budget is $5/month with no automatic stop. Build `server/app/agent/spend.py`: every Bedrock call goes
  through one wrapper that records input/output tokens from the response, multiplies by the model's per-token price
  (table in code with a comment and source), persists the running total in server/state/bedrock_spend.json, and refuses
  calls once BEDROCK_SPEND_CAP_USD (default 3.00) is reached (returns the normal fallback + logged error). Tests for it.
  Real prep runs only for the 2 hero buildings; everything else uses the fake agent.
- LANGSMITH_API_KEY is not set: tracing must be optional (on when the key exists), and agent_step events are always emitted.
- ElevenLabs is not set: tts.py must be an adapter with ElevenLabs when ELEVENLABS_API_KEY exists, else NO audio
  (audio_url null, subtitles carry it). Do not call Amazon Polly (budget).

## Build
1. `server/app/agent/tools.py`: kit tools (kit_get_building, kit_get_floor_status, kit_get_tenant_history,
   kit_get_matterport_models) reading the index/dossier, spatial tools wrapping vexcel.py/matterport.py (cached; if 4A is
   not merged yet, read server/fixtures/vexcel/<id>.json when present, else return "unavailable"). Contacts are never
   returned by any tool.
2. `server/app/agent/prep_agent.py`: `deepagents.create_deep_agent` on `langchain_aws.ChatBedrockConverse` through the
   spend wrapper, with subagents property_scout, spatial_scout, persona_writer exactly as the PRD table, filesystem
   backend writing facts_property.json, facts_spatial.json, persona.json under server/cache/prep/<id>/.
3. Deterministic post-processing (no model): merge facts into the dossier with fact IDs; validate persona against
   models.Persona; every backstory beat is fact_ref (must resolve to a dossier fact id) or fiction:true; desire_key from the
   fixed list; hard_limits only from facts; reject and retry once (then fail loudly) on unresolved refs; never "vacant".
   Write server/fixtures/personas/<id>.json (committed). Emit agent_step {step, tool, summary, duration_ms} events.
4. `scripts/prep_building.py <id> [--force]` and `POST /api/buildings/{id}/prep` (idempotent, cached, force flag),
   `GET /api/buildings/{id}/persona`.
5. Wire the persona into the game: building_intro uses persona.intro_line (+ analyst line); fake agent keeps working when
   no persona exists.
6. Tests: pytest with a fake chat model (no network): tool outputs never include contacts, persona validation rejects
   unresolved fact_refs and invented physical facts, spend cap blocks calls at the cap and persists, prep is idempotent.
   Then ONE real prep run for Esperson (233953) and, if spend allows, Wells Fargo Plaza (233899); report tokens and $.

## Rules
Small commits per working step (`phase4: ...`), tests first, push after each. Model output never mutates game state.
Never send kit contacts to a model. If a real Bedrock/deepagents response differs from the PRD, record it in the PR and
docs/overnight-log.md and continue with the safe interpretation (human asleep).

## Done means
Branch `phase4/prep-agent`. pytest, pnpm -r test, e2e pass. The exit gate minus LangSmith (no key): prep_building.py
produces dossier + persona (desire + 3 neighbor lines) + floors for Esperson, every fact_ref resolves; trace shows the 3
subagents in agent_step events. Report spend so far. `gh pr create --base main --label agent:codex`, end body with
"🤖 Generated with Codex, coordinated by Claude Code". worker_done with PR URL + summary lines.
