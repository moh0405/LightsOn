# Task: Phase 6 fixes (Claude Opus review + Codex QA sweep)

Read AGENTS.md, docs/agent-workflow.md, docs/agents/review-p6-claude.md and apps/web/e2e/qa-phase6-report.md (findings
F1-F4, expected-failure specs in apps/web/e2e/qa-phase6-evidence.spec.ts). Setup: symlink
/Users/momossss/Documents/GitHub/LightsOn/data and .env. NO Bedrock calls. Ports LO_E2E_API_PORT=20301 LO_E2E_WEB_PORT=17374.
Branch phase6/fixes. Failing test first, small commits, push after each. A Phase 7B worker is editing the admin page,
grounding.py and README in parallel; rebase onto main before the PR.

## Fixes
QA:
- F1 Web Audio unavailable blanks /screen: load Tone lazily inside the Start click; if AudioContext is missing, music is
  off with a toast, the game still renders.
- F2 four-player CHALLENGE layout overflows: all counteroffers and evidence visible at 1920x1080 without scrolling,
  text >= 28 px (compact cards / two columns).
- F3 unmatched-nonce error events are dropped: every error event shows a toast (dedupe identical ones).
- F4 console errors across rounds: no request for a persona that does not exist (use /api/buildings metadata to know);
  Matterport third-party fetch errors must not surface as app console errors (load the embed only when a model id exists
  and the iframe is visible; otherwise show the still).
Review:
- MED /api/tts: requires a room + player in an active round (or host pin), text must be a line the server produced this
  round (or <= 280 chars with a per-room rate limit), cache size bounded.
- Sparks requestAnimationFrame stops when there are no particles.
- Matterport: start loading at the beginning of INTRO and allow a realistic load window (e.g. 5 s) before falling back;
  no toast for this expected fallback, only a log.
- pitch_audio: reject over 5 MB from Content-Length / streamed read before spooling the whole file.
- +3 dB repeat lift capped (e.g. at +6 dB total).
- ConceptCard: replace "Dark office" with wording the dossier supports (e.g. "Listed available floors").
- STT error text: only suggest browser dictation when the phone supports it.
Flip every QA expected failure to a normal passing test.

## Done means
pytest (real .env and cap 3.00), pnpm -r test, evals --quick, full e2e 3x green, build. PR label agent:claude; end the
body with "🤖 Generated with Claude Code (Opus), coordinated by Claude Code". worker_done with PR URL.
