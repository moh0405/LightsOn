# Task: fixes from the Codex + Claude reviews of PR #9 / #10

Read AGENTS.md, docs/agent-workflow.md, and both reviews: docs/agents/review-p3fix-p4a-codex.md and
docs/agents/review-p3fix-p4a-claude.md (file:line evidence and reproductions are there). Symlink the kit
(/Users/momossss/Documents/GitHub/LightsOn/data) and .env (/Users/momossss/Documents/GitHub/LightsOn/.env) into your
worktree so kit-dependent tests run (never commit them). Branch `phase4/vexcel-fixes`. Small commits per fix, tests first
(each test must fail before the fix), push after each.

## Fixes
1. P1 negative evidence: a failed/missing detection is unknown, never zero. fetch_vexcel.py keeps null for labels the
   API did not answer; build_dossier.py creates facts only for positive counts with a real capture date (no "recent"
   placeholder); zero counts produce no citable fact. Natural wording: "31 cars", "2 trees", "on the 2023 flyover".
   Regenerate server/fixtures/vexcel and dossiers; Esperson 6-8 stay dark 31,503 and no CoStar fact id changes.
2. Detection cache key includes property id, WKT/geometry, sorted labels, threshold and buffer.
3. Only a confirmed 404/empty response is cached as "no coverage"; timeouts, missing key and transport errors are never
   cached. Oblique cache is complete only when every advertised direction is present.
4. Typed fallbacks cover cache I/O errors and malformed JSON (no KeyError/NotADirectoryError escapes); last-capture-date
   uses .get.
5. Property ids validated as decimal and the cache path contained under the cache root (no traversal / absolute ids).
6. Projector text: restore >= 28 px for body labels (player names, needs labels, simulation label) while keeping the
   1920x1080 no-scroll fit with 0-4 players and the real QR; add a computed-font-size assertion to the layout test and
   test 0, 2 and 4 players.
7. Tests that exercise real code: call build_dossier's merge on a minimal fixture (not committed artifacts); MockTransport
   tests for oblique sequencing, label-change cache misses, timeout-not-cached, partial oblique recovery.
8. Light-up flake: City.tsx computes paint and the reschedule decision from one clock read and always paints the final
   completed frame (no weaker assertion, no slower animation). Verify with --repeat-each=10 on the Phase 3 UI spec.

## Done means
With the kit mounted: `cd server && uv run pytest` (0 failures), `pnpm -r test`, full `pnpm --filter @lights-on/web e2e`
3 times all green, build. `gh pr create --base main --label agent:codex`, each fix mapped to its test. End the body with
"🤖 Generated with Codex, coordinated by Claude Code". worker_done with PR URL + summary lines.
