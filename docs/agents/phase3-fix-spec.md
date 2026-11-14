# Task: Phase 3 fixes (from Codex review + QA sweep)

Read AGENTS.md, docs/agent-workflow.md, docs/PRD.md "Gameplay", "Living city" (Shared progression), "Visuals and audio"
(City song, Overlays: readable from 3 m), /tmp/LightsOn-phase3-review.md if present, and apps/web/e2e/qa-phase3-report.md.
Branch `phase3/fixes` off main. Small commits per fix (`phase3: ...`), tests first, `git push -u origin HEAD` after each.

## Fixes
1. Intro subtitles survive reconnect. Store the current round's intro {text, audio_url, mood, analyst_line} on the room,
   include it in room_state (`intro`, null outside INTRO..REVIVED of that round), persist it in snapshots; the store must
   keep it from room_state instead of nulling it. Test: reconnect /screen during PITCH still shows the intro subtitles.
2. Wake list stays current. After every revival (and on room reset) broadcast the updated wakeable list so phones drop
   exhausted buildings without reconnecting (send a room_state, or add the list to an existing event; no new event names).
   Test: after a building's last dark floors are revived, a connected phone no longer shows its Wake button.
3. City song layers = number of distinct categories revived in this room (max 8, per PRD City song), not the revival count.
   Fix server city.py and the client reducer. Test: two culture revivals -> 1 layer; culture + housing -> 2.
4. Projector fit at 1920x1080: /screen must never overflow the viewport (no page scroll) with 0-4 players and the real
   264 px QR. Shrink/position the QR + side panel (e.g. QR <= 200 px, compact player list, needs summary inside the
   viewport). Body text stays >= 28 px equivalent where the PRD asks for 3 m readability. Flip
   apps/web/e2e/qa-phase3-layout.spec.ts from expected failure to a normal passing test, also with 4 players.
5. Flaky test: the Phase 1 player-row color assertion failed once in a full run and passed alone. Find the race
   (likely asserting before room_state/player_joined renders) and make it wait on the right condition, not a timeout bump.

## Done means
`cd server && uv run pytest`, `pnpm -r test`, `pnpm --filter @lights-on/web e2e` (run the full suite 3 times, all green
every time), `pnpm --filter @lights-on/web build` pass. Re-run apps/web/e2e/qa-phase3-sweep.mjs in kit and fixtures:
17/17 each. `gh pr create --base main --label agent:codex`, each fix with its test and the 3x e2e results, before/after
screenshot of /screen at 1080p. End body with "🤖 Generated with Codex, coordinated by Claude Code". worker_done with
PR URL + summary lines. Ask before any contract change beyond adding `intro` to room_state.
