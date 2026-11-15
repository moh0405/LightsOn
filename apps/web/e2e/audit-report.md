# Workflow audit — current main

Baseline: `8794e2c61dc28086d481c30bb84c5322c59f251a`, fetched from `origin/main` on **2026-11-14 UTC**. Branch: `qa/audit`. Product code unchanged.

**Result: 13 confirmed usability/visual defects: 3 P1, 7 P2, 3 P3.** The core two-player loop works for all seven buildings in both data modes. The highest-priority defects are the disappearing interior, the zero-width phone projector, and the clipped 720 px city meter. No P0 server/game-state failure was observed in the tested paths.

## Coverage and method

- **14 complete two-player rounds:** one per building in `DATA_MODE=kit`, then one per building in `DATA_MODE=fixtures`. Both players typed pitches and revisions, received challenge cards and scores, and tapped to charge. Production timers were unscaled; the host advanced deliberation phases after evidence capture. INTRO ran naturally.
- **One additional complete natural-timer Esperson round:** 45 s pitch, 10 s challenge, 30 s negotiation, 10 s verdict, followed by player-completed power-up. A third player joined during negotiation. Seven separate screenshot-free dives measured actual browser frame cadence.
- **1920×1080, 1440×900, 1280×720, 390×844 and 360×800:** `/screen`, `/play`, `/admin`; phase layouts, dive/media beats, typed input, challenge/evidence, verdict, energy, revival, concept, city meter and trace. The main sweep captured **760 layouts**; **143** additional targeted captures fill INTRO, POWER_UP and host-panel phase coverage, for **982 raw screenshots** including focused/iframe evidence.
- **All 68 core workflow checks passed** across kit/fixtures: wake/aim path, two challenges, two score rows, concept availability, walk-in during explore, player reload, projector reload, server restart with city restoration, round reset and room reset. A wrong host PIN produced a toast without advancing the phase.
- The two phones use separate Chromium contexts with touch enabled. Headless Chromium used `--use-gl=swiftshader --enable-unsafe-swiftshader`. No external API mocking or iframe interception was used. `AGENT_MODE=fake` prevents live inference; Bedrock client construction was explicitly blocked. ElevenLabs was disabled for the browser speech fallback timing run.
- Ports: API **21701**, web **18774**. Data, root `.env`, and public media were symlinked from the main checkout. `PREP_TRACE_DIR` points to its recorded prep; `BEDROCK_SPEND_LEDGER` points to its spend ledger. Room state was isolated in temporary directories.
- The ledger stayed at **$3.0692596, 194 recorded calls** before/after the runs. **Zero Bedrock calls** were made. No product source, fixture, model contract or data artifact was edited.

Raw screenshots, measurements and runnable audit scripts are local in `apps/web/e2e/artifacts/audit/` (gitignored). The 17 curated images linked below are committed in `apps/web/e2e/screenshots/audit/`. Assertions for A01, A02, A03, A05, A06, A07 and A09 were executed against the recorded browser evidence and failed as expected; their failures are saved in `defect-checks.json`. Initial harness races and a third-party opacity-based visibility assertion were corrected before assessing coverage; they are not product defects.

## Ranked defects

### A01 · P1 · Interior tour disappears after about one second

- **Where / owner:** `/screen`, INTRO; **matterport**.
- **Steps:** Join two phones, wake Wells Fargo Plaza or Esperson, observe the interior at the end of INTRO. Repeat with TC Energy Center, which has no aerials.
- **Expected:** A loaded interior remains visible long enough to inspect and has a deliberate handoff into pitching.
- **Actual:** Wells Fargo's iframe was visible for **1,249 ms**, then hidden while INTRO continued. `mediaAt` assigns every beat exactly 1,250 ms. Three aerials put the interior at **6,250–7,500 ms**, followed by a 500 ms gap. With no aerials it occupies **2,500–3,750 ms**, leaving 4,250 ms of INTRO without media. The iframe remains mounted but hidden until PITCH, then unmounts. The measured short appearance is scheduling, not an API failure or component remount.
- **Screenshots:** [Wells Fargo interior](screenshots/audit/kit-233899-INTRO-7800.png), [TC Energy after its media slot](screenshots/audit/kit-233905-INTRO-4200.png).
- **Suggested fix:** Give the interior the remaining intro window, or coordinate the phase duration with readiness and an explicit viewing duration. Preserve caption fallback.
- **Source:** [effects.ts](../src/screen/effects.ts), [IntroMedia.tsx](../src/screen/IntroMedia.tsx).

### A02 · P1 · Phone-width projector has a zero-width skyline

- **Where / owner:** `/screen`, 390×844 and 360×800, every phase; **ui**.
- **Steps:** Open `/screen` at either phone width, including during wake and revival.
- **Expected:** The skyline and phase remain visible in a responsive layout.
- **Actual:** The fixed 390 px sidebar plus padding/gap squeezes the stage to **0 px**. At 390 px the sidebar begins at x=32 and extends to x=422. The heading, phase, dive and light-up disappear from the usable viewport.
- **Screenshot:** [390 px projector](screenshots/audit/kit-lobby-screen-390.png).
- **Suggested fix:** Stack/collapse the sidebar at narrow widths and reserve a usable minimum map area.
- **Source:** [ScreenApp.tsx](../src/screen/ScreenApp.tsx).

### A03 · P1 · City needs are clipped at 1280×720

- **Where / owner:** `/screen`, 1280×720, lobby and active rounds; **ui**.
- **Steps:** Open the projector at 1280×720; join two players; inspect City progress.
- **Expected:** All needs and the most-needed category remain readable.
- **Actual:** Sidebar client height is **688 px**, versus **844 px** scroll height in lobby and **876 px** with two players. `overflow:hidden` hides lower needs and the next-round cue without a scroll path.
- **Screenshots:** [Lobby](screenshots/audit/kit-lobby-screen-1280.png), [verdict](screenshots/audit/kit-233899-VERDICT-screen-1280.png).
- **Suggested fix:** Adapt the sidebar to viewport height, shrink/move the QR, or provide an intentional scrolling region.

### A04 · P2 · Score headings and cells collide at 1280×720

- **Where / owner:** `/screen`, VERDICT, 1280×720; **ui**.
- **Steps:** Complete a two-player round and inspect the score card.
- **Expected:** Scoring criteria and totals are readable on the projector.
- **Actual:** Seven fixed-width columns split “Neighborhood fit” into three lines and split “Creativity” inside the word. The needs-bonus “(included)” annotation collides with Total.
- **Screenshot:** [Score card](screenshots/audit/kit-233899-VERDICT-screen-1280.png).
- **Suggested fix:** Use shorter criterion labels and a compact bonus annotation, or a per-player score layout sized to the stage.

### A05 · P2 · Intro shows the Matterport start poster, requiring a projector click

- **Where / owner:** `/screen`, INTRO, all seven buildings; **matterport**.
- **Steps:** Wake a building and watch the unmodified embedded showcase without clicking the projector.
- **Expected:** The advertised interior beat enters a playable tour or deliberately presents a labeled source still.
- **Actual:** All seven sampled showcases loaded a real image and **“Explore 3D Space”** play prompt. The URL has only `?m=<model>`, so the tour waits for a separate click; phones provide no action to enter it. Combined with A01, the default flow never enters an interactive interior before hiding it. iframe `onLoad` means the showcase shell loaded, not that the 3D scene is ready.
- **Screenshot:** [Unentered showcase](screenshots/audit/kit-233899-INTRO-7800.png).
- **Suggested fix:** Use a supported showcase entry option and verify readiness, or intentionally use a real still with clear labeling. Keep user activation requirements explicit.

### A06 · P2 · Attract orbit advances in visible steps

- **Where / owner:** `/screen`, LOBBY/EXPLORE; **camera**.
- **Steps:** Watch the idle skyline for four seconds without moving/resizing the browser.
- **Expected:** A smooth slow orbit without discrete camera jumps.
- **Actual:** `setInterval(...,100)` calls `jumpTo`, producing a nominal **10 camera updates/s**. Measured movement intervals: **111.0 ms median, 178.6 ms p95, 201.3 ms maximum**. The browser's render frames do not interpolate those jumps.
- **Screenshot:** [Attract scene](screenshots/audit/kit-lobby-screen-1920.png); motion evidence: `focused-results.json → orbit.moves`.
- **Suggested fix:** Advance the bearing on animation frames using elapsed time, with a reduced-motion path. Benchmark on the projector GPU after fixing the source cadence.
- **Source:** [City.tsx](../src/screen/City.tsx).

### A07 · P2 · Second player's spoken challenge starts after negotiation begins

- **Where / owner:** `/screen`, CHALLENGE→NEGOTIATE, browser speech fallback; **audio**.
- **Steps:** Run an Esperson round with two typed pitches and natural timers; enable Start audio.
- **Expected:** Both players can associate the spoken challenge with its challenge beat and revision prompt.
- **Actual:** Player 1's challenge/counteroffer takes **12.81 s** to finish against a **10 s** CHALLENGE. Player 2 starts **12.82 s** after CHALLENGE starts, already **2.80 s into NEGOTIATE**, then speaks for another **12.24 s**. The queue is serialized and CHALLENGE/NEGOTIATE share a speech group. Both cards/subtitles are immediately available, so typed play remains functional.
- **Screenshot:** [Simultaneous challenge cards](screenshots/audit/natural-CHALLENGE.png); measured speech events in `focused-results.json → natural.speech`.
- **Suggested fix:** Shorten and budget spoken challenge/counteroffer content across both players, make queue ownership clear, and preserve the full written evidence and negotiation window.
- **Source:** [music.ts](../src/screen/music.ts).

### A08 · P2 · Late joiner is offered a revision the server cannot accept

- **Where / owner:** `/play`, joining during NEGOTIATE; **ui**.
- **Steps:** Start a two-player round, submit original pitches, advance to negotiation; join a third phone, type a revision, press Send revision.
- **Expected:** Explain that this player joins the next pitching opportunity while still allowing shared power-up.
- **Actual:** The newcomer gets “Make your deal,” Your revision and Send revision, then receives **“Submit an original pitch before revising.”** The current phase provides no way to submit that original pitch. Server validation correctly rejects it; the offered action is unusable.
- **Screenshot:** [Late-join rejection](screenshots/audit/late-join-rejected.png).
- **Suggested fix:** Gate the revision form on the player's original pitch; show a waiting/participation explanation otherwise, retaining tap-to-charge.
- **Source:** [PlayApp.tsx](../src/play/PlayApp.tsx), [Round.tsx](../src/play/Round.tsx).

### A09 · P2 · Documented H host-controls shortcut does nothing

- **Where / owner:** `/screen`, any phase; **ui**.
- **Steps:** Press H on the projector after joining a room.
- **Expected:** PRD's host-controls overlay exposes skip/reset/data-mode controls.
- **Actual:** No UI or buttons change. The only projector button after audio starts is Agent trace · T. `/admin` controls work, including bad-PIN toast, skip, reset and both data modes.
- **Screenshot:** [Projector controls](screenshots/audit/focus-hover-233953.png); `focused-results.json → hostH` records `changed:false`.
- **Suggested fix:** Implement the documented shortcut/overlay with host authentication, or reconcile the documented host workflow with the dedicated admin route.

### A12 · P2 · Trace panel's fixed columns overflow on phones

- **Where / owner:** `/screen`, trace panel, 390×844; **ui**.
- **Steps:** Open `/screen` at phone width and press T.
- **Expected:** Recorded steps, live events and Close remain usable within the viewport.
- **Actual:** Panel client width is **324 px**, but its content scroll width is **910 px**. Three minimum-width columns spill outside the panel; there is no intentional outer horizontal scroll container. This is separate from the main projector's zero-width map.
- **Screenshot:** [Trace at 390 px](screenshots/audit/trace-phone-390.png).
- **Suggested fix:** Stack the trace sections or provide responsive tabs and a reachable close control.

### A10 · P3 · Hover area has no meaning label

- **Where / owner:** `/screen`, building hover card; **ui**.
- **Steps:** Aim at Esperson, or any of the seven buildings.
- **Expected:** Area is identified as listed available space, distinct from total building area or the dark-floor revival target.
- **Actual:** The hover card shows **“280,852 sqft”** with no “available” label. That value comes from the dossier's available-space fact, but its displayed `say_as` contains only a quantity/unit. All seven cards have the same ambiguity.
- **Screenshot:** [Esperson hover](screenshots/audit/focus-hover-233953.png).
- **Suggested fix:** Add a fixed “listed available” label based on the known fact key while preserving its sourced value.

### A11 · P3 · Missing caption occupies 35% of a working tour

- **Where / owner:** `/screen`, interior beat; **visual**.
- **Steps:** Wake either prepared aerial building and inspect the interior beat.
- **Expected:** A working source image/tour gets useful space; missing metadata has a compact notice.
- **Actual:** All model captions are null, but the left **35%** is reserved for a giant diamond and “Interior tour caption unavailable,” repeated as “Caption unavailable” below. Missing metadata dominates an already short viewing slot. Five buildings also have “Source image unavailable” in the before concept panel despite a reachable public tour.
- **Screenshots:** [Tour placeholder](screenshots/audit/kit-233899-INTRO-7800.png), [Missing before image](screenshots/audit/kit-233905-REVIVED-screen-1920.png).
- **Suggested fix:** Collapse missing-caption UI and use an allowlisted, cached real source still where available. Keep null metadata honest.

### A13 · P3 · One rejected revision produces two live error announcements

- **Where / owner:** `/play`, rejected submission; **ui**.
- **Steps:** Reproduce A08 and inspect role=alert elements.
- **Expected:** One clear, accessible error announcement per failure.
- **Actual:** The same rejection appears in both the global toast `<div role="alert">` and form `<p role="alert">`, announcing it twice and repeating it visually.
- **Screenshot:** [Duplicate rejection](screenshots/audit/late-join-rejected.png); `followup-results.json → lateJoin.alerts` contains the identical message twice.
- **Suggested fix:** Assign form submission failures to one announcement surface and keep the other non-live or absent.

## Data and external API results

The provider was called against the actual read-only office index. Dossiers were rebuilt in memory from indexed facts/floors/listings/tenancies and compared without writing them. All seven are `propertyType=5` / decoded **Office**; **no CoStar fact or floor-row mismatches** were found. The rule considers active listed area, floor size and current tenancies; unknown tenancy area does not become evidence of no tenancy. Unknown/unmatched floor space is not assigned to an arbitrary rendered floor.

| Building | ID | Dark | Partial | Occupied | Unknown | Public model IDs | Local aerial files |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Wells Fargo Plaza | 233899 | 17 | 16 | 26 | 13 | 7 | 5 |
| TC Energy Center | 233905 | 9 | 11 | 33 | 10 | 2 | 0 |
| 3 Houston Center | 233918 | 17 | 11 | 20 | 4 | 1 | 0 |
| 1415 Louisiana | 233928 | 11 | 9 | 9 | 16 | 6 | 0 |
| One Allen Center | 233935 | 5 | 10 | 21 | 3 | 3 | 0 |
| Esperson | 233953 | 8 | 11 | 6 | 4 | 3 | 5 |
| 717 Texas | 519027 | 6 | 3 | 16 | 2 | 1 | 0 |

**Vexcel:** The real-key adapter made exactly one cache-bypassing Esperson `GET property/extract` with header authentication and a 30 s timeout. Result: **HTTP 200, 8 features, 605 ms**. No auth value or raw response was exported. All ten dossier-referenced exported public images exist. The main checkout has **no raw `server/cache/vexcel` files**, so exported public media availability should not be confused with a warm adapter cache. Five context buildings have no aerials in their dossiers; their caption/tour path still works.

**Matterport:** All **23** IDs returned **HTTP 200** from `https://my.matterport.com/api/player/models/<id>/`. The public metadata includes contact fields, so only response status, key names, size and timing were retained; contact values were not printed or sent to a model. Real, unmodified sandboxed showcase iframes loaded for all seven representative models and stayed mounted beyond three seconds in isolation. The application itself hides them on its short schedule (A01). All **23** showcases also passed real sandboxed iframe checks after manual entry: a canvas remained present and the iframe stayed visible after three seconds. Results are in `followup-results.json`; its opacity predicate distinguishes a faded play prompt from a destroyed element.

| Building | Public player API model IDs, all HTTP 200 |
| --- | --- |
| Wells Fargo Plaza | `3K5rnFt1P6B`, `Gj2E4uqqdfU`, `Ry9V96reQ77`, `jUnF84zghQk`, `kDmRpp4ypA1`, `qVqBanbJQze`, `tzDLoMcCjuC` |
| TC Energy Center | `gGm7vFc9YgS`, `rjEYw8eRQpf` |
| 3 Houston Center | `JWtTP2g7mDj` |
| 1415 Louisiana | `LJn59uoV759`, `qgHrw7d3MJ1`, `sEmBqaiPBba`, `tMswvfbZK8C`, `vh1XhRJyZPW`, `yPnykGhkJf6` |
| One Allen Center | `P2N8mt8BdAE`, `hG6Fn3bPrxT`, `oL4WGNKLFZu` |
| Esperson | `Wtxv2Mp8uQE`, `nP2o5YT7nCP`, `wovF4kpoaw4` |
| 717 Texas | `WAeBuPU2HLw` |

**HTTP routes:** `/api/health`, `/api/buildings`, every `/api/buildings/{id}`, and every `/persona` and `/trace` returned **200** in both modes. All seven personas validate. `/api/tours` and `/api/buildings/{id}/tours` return **404**; there is no tours route in this baseline, so this optional endpoint was not counted as a defect. Tours are supplied by dossier media instead.

**Recorded trace:** Esperson has actual cached prep steps and all four named artifacts. The other six `/trace` responses honestly return `available:false`. The UI explicitly labels and always requests **Esperson prep evidence**, even while another building is active; it is a demonstration recording, not current-building historical proof. Historical model IDs were not recorded; the panel labels displayed IDs as current configuration. Replay/Show all/T/Escape worked; there was no live model execution.

**Privacy:** Three kit JSONL files were streamed, not loaded wholesale, to collect **1,428** contact-name candidates. Across **774** rendered UI/data surfaces there were **0** matching contact names and **0** occurrences of the prohibited floor word. This scan covers application DOM/provider payloads; third-party showcase branding is external content, not an application contact allowlist audit.

## Motion, interaction and audio evidence

Visual ratings are subjective and based on inspected screenshots and observed motion: **attract skyline 5/10**, **selection 6/10**, **dive 5/10**, **intro media 3/10**, **light-up 6/10**, **concept card 4/10**. The skyline is recognizably 3D and the revived colors are clear, but blocks lack façade detail, the orbit steps, some tall roofs leave the frame, media cuts are abrupt, and category icons convey little of the proposed reuse. [Natural light-up](screenshots/audit/natural-REVIVED.png) shows a visible three-floor color change; [attract](screenshots/audit/kit-lobby-screen-1920.png) shows the actual start-screen quality.

Screenshot-free frame measurements below use the first ~2.7 s after each wake at 1920×1080. They include real iframe loading during the dive and use software WebGL; they are diagnostics for this headless host, not a measurement of the venue GPU. No screenshots, viewport changes or parallel test suite ran during these seven measured dives.

| Dive | Median frame ms | p95 ms | Maximum ms |
| --- | ---: | ---: | ---: |
| Wells Fargo Plaza | 33.3 | 50 | 116.7 |
| TC Energy Center | 33.3 | 50 | 83.3 |
| 3 Houston Center | 33.4 | 66.7 | 100 |
| 1415 Louisiana | 33.4 | 66.8 | 166.7 |
| One Allen Center | 16.7 | 33.4 | 33.4 |
| 717 Texas | 50.0 | 83.4 | 166.6 |
| Esperson | 66.6 | 149.9 | 233.4 |

Idle orbit's browser-frame median/p95 were **33.4/83.3 ms**; the independent camera update interval was **111.0/178.6 ms**, exposing the fixed-step orbit independently of render cadence. One Allen Center's dive was smoothest here; Esperson and 717 Texas had substantial stalls.

All seven buildings were aimed at using real phone trackpad input and a queried rendered floor. Observed floors/statuses were Wells Fargo 71/dark, TC Energy 56/unknown, 3 Houston Center 51/occupied, 1415 Louisiana 43/occupied, One Allen Center 34/partial, 717 Texas 33/occupied, and Esperson 27/unknown. The correct building hover card appeared for each, and tap selection woke each building. There is no separate direct floor-selection control; the server selects target floors. End-to-end automation waits for hover cards ranged **79–262 ms**; those include Playwright dispatch/polling and do not establish the PRD's sub-150 ms browser-only feedback guarantee. The game did not wait on a model for pointer, hover or charge.

Source/game status remained separate through revival. The selected floor groups were Wells Fargo **[3]**, TC Energy **[18,19]**, 3 Houston Center **[4,5]**, 1415 Louisiana **[1]**, One Allen Center **[11]**, Esperson **[6,7,8]**, 717 Texas **[23,24,25,26]**. Each round emitted one revival; four accepted taps completed charge, and city totals survived reload/restart. After all seven rounds the city showed **7 buildings / 370,440 sq ft reimagined**. Distinct winning categories controlled the number of song layers rather than the number of buildings.

### Natural Esperson timeline

Times below are seconds relative to INTRO's received phase event; actual browser speech start/end events were recorded, rather than inferred from a call to `speak`.

| Beat | Start | End / observation |
| --- | ---: | --- |
| INTRO | 0.00 | PITCH at 7.98 |
| Intro speech | 0.49 | 6.64; two chunks, no repeated intro on PITCH |
| PITCH | 7.98 | CHALLENGE at 53.02 |
| CHALLENGE | 53.02 | NEGOTIATE at 63.04; both cards immediately visible |
| Player 1 challenge speech | 53.03 | 65.84 |
| Player 2 challenge speech | 65.84 | 78.09 |
| NEGOTIATE | 63.04 | VERDICT at 93.13; both revisions accepted |
| VERDICT | 93.13 | POWER_UP at 103.19 |
| Verdict speech | 93.18 | 95.72 |
| POWER_UP | 103.19 | REVIVED at 104.31, completed by taps |
| REVIVED | 104.31 | Red target floors, 100% energy, city update and concept visible |

Across the 14 main rounds, intro speech began **92–377 ms** after INTRO's event using the browser fallback. Subtitles remained present while speech/media ran. The natural full round emitted **no console errors or page exceptions on the projector or either original phone**. Restart probes intentionally generated transient WebSocket reconnect errors; routine dev-mode React Router warnings, third-party entry-orbit warnings and software-GL ReadPixels warnings were recorded separately from game failures.

## Validation and remaining limits

- `cd server && uv run pytest`: **687 passed, 1 skipped**, run twice before the two evidence commits. Existing pytest-asyncio default-loop-scope deprecation warning remains.
- `pnpm -r test`: **79 frontend tests passed**, messaging TypeScript check passed, run before both commits.
- No agent code changed, so the conditional agent quick-eval command was not required. Live Bedrock deliberation, paid TTS/STT, Photon delivery and physical sensor/haptic behavior were not exercised in this explicitly headless/no-Bedrock audit.
- Chromium phone emulation does not verify native Safari permission dialogs or venue network/GPU behavior. Speech start/end timing does not measure perceived audio quality or speaker intelligibility.
- No media/credentials/data files are committed. The report and curated screenshots are the complete tracked change; the defects remain open for their owner areas.

🤖 Generated with Codex, coordinated by Claude Code
