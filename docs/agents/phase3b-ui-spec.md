# Task: Phase 3B, round UI on screen and phones (Lights On)

Read AGENTS.md, docs/agent-workflow.md, docs/PRD.md: "Gameplay", "Physical interaction" (Power up, Instant feedback),
"Visuals and audio" (Light-up sequence, Overlays), "Living city", "Contracts" (Commands, Events, Core models), "Phase 3".
Then apps/web/src (store.ts, ws.ts, protocol.ts, ScreenApp, City.tsx, floor-colors.ts, PlayApp, Explore) and apps/web/e2e/.

A second Codex worker builds the server loop in parallel (3A). You own apps/web/src and apps/web/e2e only (not types.ts,
which 3A regenerates; add new event shapes to lib/protocol.ts).

## Event / command contract (from PRD Contracts; server sends these)
building_intro {text, audio_url, mood, analyst_line} · pitch_received {player_id, text, origin} ·
counteroffer {player_id, line, fact_ids, counteroffer, audio_url} · verdict (Verdict: round_id, winner_player_id,
scores[{player_id, data_fit, neighborhood_fit, creativity, charm, needs_bonus, total}], reason_line, fact_ids, category,
desire_met, desire_reveal, impact) · energy_updated {charge, by_player_id} · building_revived {building_id, floors, color,
category, sqft} · neighborhood_updated {needs, most_needed} · error {code, message} (code no_pitches = round skipped).
room_state adds `revived: {building_id: {floors, color}}` and city meter fields. Commands: submit_pitch {text},
revise_pitch {text}, contribute_energy {nonce}.

## Build
1. Store reducers for every event above (pure, Vitest-tested).
2. Phone (play/): Pitch (textarea, 280 chars, submit, shows "sent"), Negotiate (shows the building's counteroffer to me,
   one revision), PowerUp (big glowing button + `gesture.ts` flick detector per PRD: accelerationIncludingGravity vertical
   > +14 after < +9, peak within 300 ms, 600 ms refractory; each flick or tap sends contribute_energy with a fresh nonce;
   navigator.vibrate on accept when available), Result (winner, my score). Typed input and tap must always work.
3. Screen (screen/overlays/): Subtitles (intro text), Bubbles (pitches), ChallengeCards (counteroffers), ScoreCard
   (4 axes, needs bonus, cited fact ids resolved to dossier say_as), EnergyMeter (charge jumps instantly), CityMeter +
   NeedsBars labelled "game simulation"; housing impact labelled "rough game estimate, not a feasibility claim".
4. Light-up on building_revived: floors repaint to the winner color bottom to top, 60 ms stagger, 600 ms fade, starting
   within 300 ms of the event; use floor-colors.ts revived map; reload restores from room_state.revived.
5. Never the word "vacant". Facts only from dossiers. No console errors.

## Tests
Vitest for reducers + gesture detector (synthetic motion samples). Playwright `e2e/phase3.spec.ts` with a mocked/fake
WebSocket server or route mocks emitting the event sequence above: 2 phones type pitches, revision, tap to charge to 100%,
floors light within 300 ms in the winner color, CityMeter updates. After 3A merges the coordinator will run it unmocked.

## Rules
Small commits per working step (`phase3: ...`), tests first, `git push -u origin HEAD` after each. If the contract is
insufficient, ask instead of inventing fields.

## Done means
Branch `phase3/round-ui`. `pnpm -r test`, `pnpm --filter @lights-on/web e2e`, `pnpm --filter @lights-on/web build` pass.
`gh pr create --base main --label agent:codex` with screenshots (PITCH, CHALLENGE, VERDICT, POWER_UP, REVIVED). End body
with "🤖 Generated with Codex, coordinated by Claude Code". worker_done with PR URL + summary lines.
