# Phase 7 (council-scoped): A3 trace panel + demo readiness

Source: docs/council/20261114-1718-*.md (LLM council verdict). Cut: A1 second hero, A2 Photon, A8 precise aiming, P2.
Feature freeze 00:00 Sunday. Read AGENTS.md, docs/agent-workflow.md, docs/PRD.md (Overlays, Sponsor strategy, Demo).
Setup: symlink /Users/momossss/Documents/GitHub/LightsOn/data and .env. NO Bedrock calls. Small commits, tests first,
push after each. Each task its own branch and ports.

## Task 7A: trace panel (Codex; branch phase7/trace-panel; LO_E2E_API_PORT=20001 LO_E2E_WEB_PORT=17074)
TracePanel overlay on /screen, toggled with `T`: replays Esperson's cached real prep run (agent_step records / the
validated prep cache in the main checkout's server/cache/prep/233953/, read-only): the write_todos plan, the three
subagents (property_scout, spatial_scout, persona_writer), files written, tool calls with durations, Bedrock model IDs,
then the deterministic merge/validation. Clearly labelled "Recorded prep run (deepagents on Amazon Bedrock)". Also shows
live agent_step events from the current round (challenge/verdict steps, grounding checks, fallbacks) labelled "Live".
Serve the recorded trace via a read-only endpoint (e.g. GET /api/buildings/{id}/trace) that never exposes contacts,
keys or raw prompts with kit contact data. Tests: pytest for the endpoint + redaction; Vitest for the panel model;
Playwright toggle + screenshot at 1920x1080.

## Task 7B: demo readiness (Claude Opus; branch phase7/demo-ready; LO_E2E_API_PORT=20101 LO_E2E_WEB_PORT=17174)
1. Admin "Demo preset" (host_action via existing set_data_mode-style action is a contract change: instead use server env
   DEMO_MODE=1 and an /admin toggle that calls an existing host_action if possible; ask the coordinator before adding a
   command): PITCH 20 s, NEGOTIATE 15 s, wake list Esperson only, skip/reset visible. Outside demo mode keep current timers.
2. Wake list: Wells Fargo Plaza must not be wakeable while it has no prepared persona (keep context buildings for normal
   play only when they have dark floors and do not need a persona to look polished; if unsure, hide them in demo mode).
3. Verify A5 (needs + analyst line), A6 (at least one challenge cites a spatial/Vexcel fact from the dossier: add an
   evals case), A7 (concept card labelled "Game concept, not a real renovation"). Fix gaps only; no rebuilds.
4. Grounding: parse hyphenated number words ("nine-million-square-foot", "twenty-seven-story") in grounding.py with tests.
5. README.md: what is real (CoStar kit, Vexcel, Bedrock model IDs, deepagents), cached (prep run), simulated (city needs),
   known limits (no ElevenLabs/LangSmith/Photon keys, browser speech fallback), how to run (dev.sh, tunnel.sh, DATA_MODE),
   use case and target user (Amazon track asks for it). Never "vacant".
Gates: pytest (real .env and cap 3.00), pnpm -r test, evals --quick, full e2e 3x, build.

## Both
`gh pr create --base main --label agent:codex|agent:claude`, screenshots, end the body with the usual footer.
worker_done with PR URL + summary lines.
