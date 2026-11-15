# Handoff: current state (keep updated)

Updated: 2026-11-14 ~21:30. Coordinator = Claude Code session in this repo. Workers run in Orca run `run_dfed0d96782e`.

## Done
- Phases 0-7 (council scope) merged through PR #34; final verification READY (132 e2e, 626 pytest, 68 web,
  6 real-kit rounds, light-up visible within ~0.8 s). Live agent: challenges/verdicts grounded, p50/p90 ~2.4/4.1 s.
- Submission pack: scripts/demo.sh, docs/TEST-TONIGHT.md, docs/submission/{devpost,tracks,demo-script}.md.

## Next
1. Human test tonight (./scripts/demo.sh), fix anything found (bug fixes only after 00:00 freeze, until 02:00).
2. Record 2-minute video + screenshots; submit Devpost by 06:00 (hard 08:00). Reset room before judging.

## Rules and budget
- docs/agent-workflow.md (routing, small commits, reviews by Codex high + Claude Opus), AGENTS.md.
- Bedrock: BEDROCK_SPEND_CAP_USD=4.50 in .env, ledger server/state/bedrock_spend.json ~$2.70. AWS budget $5 with alerts.
- Missing keys: LangSmith, ElevenLabs, Photon. Antigravity Opus/GPT-OSS quota exhausted (~7 days).
- Full history: docs/overnight-log.md. Reviews/specs: docs/agents/.
