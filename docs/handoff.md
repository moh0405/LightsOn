# Handoff: current state (keep updated)

Updated: 2026-11-14 ~17:45. Coordinator = Claude Code session in this repo. Workers run in Orca run `run_dfed0d96782e`.

## Done
- Phases 0-4 done (Phase 4 minus LangSmith trace: no key). Phase 5 challenges meet targets (1/8 fallbacks, first grounded
  line ~2.2 s); verdict number-match fix in progress.
- Phase 6A audio/voice merged (PR #22): browser speechSynthesis/SpeechRecognition fallbacks, ElevenLabs when keyed,
  procedural Tone.js city song.

## Running (check with `orca orchestration worker-list --run run_dfed0d96782e`)
- phase6-media (Codex, Task 6B in docs/agents/phase6-spec.md): intro media, light-up payoff, ConceptCard, projector polish.
- phase5-verdict-numbers (Claude Opus): verdict number-match fallback + eval sub-cap.

## Next
1. Merge 6B and the verdict fix; run a Codex QA sweep (docs/agents/qa-sweep.md) + reviews (Codex high + Claude Opus).
2. Phase 7 P1 features (docs/PRD.md): A1 two more buildings, A2 iMessage via Photon (docs/vendor/photon/README.md; needs
   PHOTON keys), A3 trace panel, A5 needs, A7 concept card, A8 precise aiming. Then Phase 8 freeze/rehearse/submit.
3. Run the LLM council (.claude/skills/llm-council) on scope before Phase 7.

## Rules and budget
- docs/agent-workflow.md (routing, small commits, reviews by Codex high + Claude Opus), AGENTS.md.
- Bedrock: BEDROCK_SPEND_CAP_USD=4.50 in .env, ledger server/state/bedrock_spend.json ~$2.70. AWS budget $5 with alerts.
- Missing keys: LangSmith, ElevenLabs, Photon. Antigravity Opus/GPT-OSS quota exhausted (~7 days).
- Full history: docs/overnight-log.md. Reviews/specs: docs/agents/.
