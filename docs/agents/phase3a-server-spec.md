# Task: Phase 3A, server game loop on a fake agent (Lights On)

Read AGENTS.md, docs/agent-workflow.md, docs/PRD.md: "Gameplay" (Round flow, negotiation, Scoring), "Round state machine",
"Living city" (Neighborhood needs, Shared progression), "Physical interaction" (Power up server rules), "AI architecture"
(Action validation), "Contracts" (Commands, Events, Core models), "Phase 3". Then server/app/{rooms,commands,main,models}.py.

A second Codex worker builds the Phase 3 screens/phone UI in parallel (3B) against the PRD event contract. You own server/,
scripts/gen_types.py output (apps/web/src/lib/types.ts) only. Do not touch other apps/web files.

## Approved contract change (coordinator)
Add to server/app/models.py: `VerdictProposal` = what an agent returns (winner_player_id, scores: list of
{player_id, data_fit, neighborhood_fit, creativity, charm}, reason_line, fact_ids, category, desire_met, desire_reveal).
The server turns it into the PRD `Verdict` (needs_bonus, totals, tie-breaks, impact) in actions.py. Run scripts/gen_types.py.
No other models.py changes. Event and command names exactly as in PRD Contracts.

## Build
1. `server/app/agent/fake_agent.py`: deterministic, schema-valid `intro(dossier)`, `challenge(pitch, dossier) -> Challenge`,
   `verdict(pitches, dossier, city) -> VerdictProposal`. Template text only. Facts it cites MUST be real fact ids from the
   building's dossier (pick by key, e.g. dark-floor available sqft); never invent numbers or history. A keyword
   classifier maps pitch text to one of the 8 categories (else wildcard). Same input -> same output.
2. Commands in commands.py: `submit_pitch {text}` (PITCH only, one per player, last wins), `revise_pitch {text}`
   (NEGOTIATE only, one per player), `contribute_energy {nonce}` (POWER_UP only; per PRD: room players only, max 1 per
   player per 600 ms, nonce de-dup, +25% each, cap 100%). Text: strip, 1..280 chars.
3. Phase hooks in rooms.py: INTRO emits `building_intro {text, audio_url:null, mood, analyst_line}` (analyst_line per
   Neighborhood needs rule 4). Entering CHALLENGE: one `counteroffer` per pitch from the fake agent. Entering VERDICT:
   validate the proposal in actions.py and emit `verdict`. POWER_UP: `energy_updated {charge, by_player_id}`; at 100% or at
   timer end (auto-complete, with a flag for a softer animation) commit `building_revived {building_id, floors, color,
   category, sqft}` EXACTLY once, then `neighborhood_updated {needs, most_needed}` and move to REVIVED.
   Edge cases: no pitches at PITCH end -> skip straight back to EXPLORE (emit an `error` to all with code no_pitches);
   a player who leaves mid-round keeps their pitch.
4. `server/app/actions.py`: winner must be in the room and have pitched; clamp scores 0-10; data_fit capped at 5 when no
   valid fact id cited; needs bonus +2 (cap 10) for the most-needed category; round score = better of original and
   revision; total server-computed; tie-break creativity then earlier final submission; category must be canonical;
   `target_floors` chosen at wake = lowest contiguous dark floors with verified sq ft, up to 4 (dossier source_status);
   revived floors/sqft from target_floors, never from model output; idempotency key per round so revive commits once.
5. `server/app/city.py`: needs table, revival rule `min(30, sqft/1000)` cap 100, most-needed with table-order ties, bonus
   rule, housing estimate `units = floor(sqft*0.75/850)`, `residents = round(units*1.9)`, labelled "rough game estimate".
   City meter state (buildings revived, sq ft reimagined counted once per floor, needs) in room_state and snapshots.
6. Revived floors: a floor keeps `source_status`; room state tracks `game_status: revived` per floor with the winner color.
   Include `revived: {building_id: {floors, color}}` in room_state so the UI can repaint after reload.
7. Tests (pytest): every validation rule, energy rate limit + dedupe + cap + auto-complete, building_revived exactly once
   under concurrent taps, city rules, fake agent determinism and fact-id grounding, a full WS round with 2 players by typing,
   5 rounds in a row without restart (scaled timers), both DATA_MODE=kit and fixtures.

## Rules
Small commits per working step (`phase3: ...`), tests first, `git push -u origin HEAD` after each commit.
Never the word "vacant" in any text. No contacts. If a contract change beyond VerdictProposal is needed, ask first.

## Done means
Branch `phase3/server-loop`. `cd server && uv run pytest`, `pnpm -r test` pass. `gh pr create --base main --label agent:codex`
listing each rule with its test, and an example event sequence of one full round (JSON). End the body with
"🤖 Generated with Codex, coordinated by Claude Code". worker_done with PR URL + summary lines.
