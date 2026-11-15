# Workflow audit — current main

Audited baseline: `8794e2c61dc28086d481c30bb84c5322c59f251a` (fetched `origin/main`), 2026-11-14/15 UTC. Read-only product audit; no product code changed. This first evidence commit records failing visual checks; the complete sweep and final coverage follow in the next commit.

## Confirmed defects, ranked

### A01 · P1 · Interior tour disappears after about one second

- **Where / owner:** `/screen`, INTRO; **matterport**.
- **Steps:** Join two phones, wake Wells Fargo Plaza, observe the tour at the end of the eight-second INTRO.
- **Expected:** A loaded tour remains visible long enough to inspect, until the intro hands off to pitching.
- **Actual:** Chromium sampled it visible for **1,249 ms**, then hidden while INTRO still ran. `mediaAt` assigns every beat exactly 1,250 ms; three aerial beats place the tour at 6,250–7,500 ms, followed by 500 ms of empty skyline. With no aerials, the tour instead disappears at 3,750 ms, leaving 4,250 ms of INTRO without media. This is a scheduling defect independent of HTTP success.
- **Screenshot:** [Tour at the end of its slot](screenshots/audit/kit-233899-INTRO-7800.png).
- **Suggested fix:** Give the interior the remaining intro window, or explicitly coordinate phase duration with tour readiness and the intended display duration; retain caption fallback.

### A02 · P1 · Phone-width projector has a zero-width skyline

- **Where / owner:** `/screen`, 390×844 and 360×800, every phase; **ui**.
- **Steps:** Open `/screen`, set viewport to either phone size.
- **Expected:** Skyline and phase remain visible with a usable responsive layout.
- **Actual:** The fixed 390 px sidebar plus gap/padding squeezes the stage to **0 px**. At 390 px the sidebar begins at x=32 and extends to x=422; the page clips it. The heading, phase, dive and light-up cannot be seen.
- **Screenshot:** [390 px projector](screenshots/audit/kit-lobby-screen-390.png).
- **Suggested fix:** Stack or collapse the sidebar below a breakpoint and give the map a positive minimum usable width/height.

### A03 · P1 · City needs are clipped at 1280×720

- **Where / owner:** `/screen`, 1280×720, lobby and active rounds; **ui**.
- **Steps:** Open `/screen` at 1280×720; join two players; inspect City progress.
- **Expected:** All needs and the most-needed label remain readable.
- **Actual:** Sidebar client height is **688 px** against **844 px** scroll height in lobby and **876 px** with two players. `overflow:hidden` hides the lower needs without any scroll path.
- **Screenshots:** [Lobby](screenshots/audit/kit-lobby-screen-1280.png), [verdict](screenshots/audit/kit-233899-VERDICT-screen-1280.png).
- **Suggested fix:** Make the sidebar responsive to height, reduce the QR footprint, or provide an intentional scrolling region.

### A04 · P2 · Score headings and cells collide at 1280×720

- **Where / owner:** `/screen`, VERDICT at 1280×720; **ui**.
- **Steps:** Complete a two-player round and inspect the score card.
- **Expected:** Scoring criteria and totals are readable from the projector.
- **Actual:** Seven fixed-width columns split “Neighborhood fit” into three lines and “Creativity” inside the word; the needs-bonus annotation collides with the Total column.
- **Screenshot:** [Score card](screenshots/audit/kit-233899-VERDICT-screen-1280.png).
- **Suggested fix:** Use short criterion labels and a compact annotation, or render each player's criteria in a layout that fits the available stage width.

## Initial passing evidence

All seven real-kit office dossiers match the current index for CoStar facts and floor rows. Dark/partial/occupied/unknown statuses match the documented rule; no status or fact mismatches were found. All ten referenced local aerial images exist (five each for Esperson and Wells Fargo Plaza); the other five buildings have no aerial images in their dossiers.

A single authenticated, cache-bypassing Vexcel `property/extract` call for Esperson returned HTTP **200**, **8 features**, in **605 ms**, using the adapter's header authentication and timeout. All **23** Matterport model IDs returned HTTP **200** from the public player API; only response shape/status metadata was retained, without its contact values. The main checkout has no `server/cache/vexcel` files, although the exported public media images exist.

Baseline checks: `cd server && uv run pytest` → **687 passed, 1 skipped**; `pnpm -r test` → **79 frontend tests passed**, messaging TypeScript check passed. Browser runs use `AGENT_MODE=fake`, real CoStar data/cached media, unscaled production timers, and ports 21701/18774; Bedrock client creation is explicitly blocked. Live-model response quality and live paid speech are outside this no-Bedrock run.

Raw screenshots, instrumentation and the failing reproduction checks are local under `apps/web/e2e/artifacts/audit/` (gitignored). Curated images are committed under `apps/web/e2e/screenshots/audit/`. Example failing checks already measured: `field.width > 0` at phone widths; `aside.scrollHeight <= aside.clientHeight` at 720 px height; `visibleTourDuration >= 3000` for Wells Fargo.

🤖 Generated with Codex, coordinated by Claude Code
