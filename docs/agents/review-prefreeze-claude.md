# Pre-freeze review (main @ c522da3), DEMO_MODE=1, fake agent, no Bedrock

Setup: API on 20401 and web on 17474. The data and .env symlinks point to the main checkout, and PREP_TRACE_DIR points to the main server/cache/prep. AGENT_MODE=fake and the AWS keys were blanked.
Two full rounds were walked in Playwright at 1920x1080 with two iPhone-13 phones. Screenshots are in this folder: 01-16 for run 1, 20-23 for run 2 with aerials present. Raw text and console output are in report*.json.
Tests: `uv run pytest` 549 passed, 1 skipped. `pnpm -r test` 62 passed.

## Must fix before freeze (ranked, ~1h45 total)
1. **The light-up can't be seen (the PRD's third protected moment).** After the wake dive, a context tower stands between the camera and Esperson. Lit floors 6-8 show as a sliver in 12-lightup.png, 13-*.png and 23-lightup-t*.png. Both runs gave the same framing. The intro and challenge frames show the same occluder (05, 08, 10). Fix in `apps/web/src/screen/City.tsx:98` with one of two options: give the flyTo a fixed clear `bearing`, or lower the context layer's `fill-extrusion-opacity` to about 0.3 from INTRO through REVIVED. Re-screenshot after the change. About 30-45 min.
2. **The aerial media is missing on the demo checkout.** `/Users/momossss/Documents/GitHub/LightsOn/apps/web/public/media/` does not exist. The only copy is in the `phase4-vexcel` worktree. Without it, the intro is blank map plus subtitles until Matterport appears for about 1.2 s at 6.8 s, and the concept card reads "Source image unavailable" (13-*.png). With the folder copied in, the Vexcel oblique and ortho beats work (20-intro-t4.png), and so does the "before" image on the concept card (23-*.png). Copy `phase4-vexcel/apps/web/public/media/233953` into the main checkout. No Vexcel spend. 2 min.
3. **Raw fact IDs and ".0" floats on the projector.** Challenge cards and the score card print `F_233953_floor_20_available_sqft: 9,068.0 sqft`, and the hover card says `280,852.0 sqft`. The cause is `Evidence` in `apps/web/src/screen/overlays/RoundOverlays.tsx:41`, which renders the id. Replace it with a source label (CoStar / Vexcel / Matterport) plus a formatted say_as, and drop the trailing ".0". 20-30 min plus a test.
4. **The header says "Waking building 233953" for the entire round.** This is `apps/web/src/screen/ScreenApp.tsx:46`. Show the building name, for example "Esperson". 5-10 min.
5. **The fallback counteroffer repeats the intro catchphrase.** It currently reads "Give your venue a reason to buzz after sunset; Pitch like you mean it, kid — I have been waiting long enough." That puts the intro line in every challenge, with a capital letter after the semicolon. The cause is `server/app/agent/fake_agent.py:100`. Judges see it every time live mode falls back. About 10 min plus a quick eval.
6. **The phone's "Hold to talk" label is invisible** (09b-phone-negotiate.png). At `apps/web/src/play/Round.tsx:46`, `background: listening ? "#39455a" : undefined` erases the button background, which leaves #eee text on the browser's default light grey. Fix: use `: button.background`. 1 min.
7. **README accuracy.**
   - It says the prep agent "plans with the todo tool", but the recorded trace panel says "No write_todos call captured in this recording". Reword it to match the recording.
   - Document `PREP_TRACE_DIR`.
   - Document that the `apps/web/public/media/<id>` images (from `scripts/fetch_vexcel.py`) must be present.
   - Everything else checked matches the code: ports 8000/5173, DEMO_MODE timers 20/15, the Esperson-only wake list, the $3.00 default cap, the model IDs, the test commands, and the `@lights-on/web e2e` script.

   About 10 min.
8. **C7: /screen has no fixture-mode label**; only /admin shows the data mode. Add a small "Offline data (fixtures)" badge when `dataMode === "fixtures"`. That is the council's safe-mode fallback, so it will be on screen if they switch at the venue. About 15 min.

## P0 acceptance (C1-C8)
- **C1 PASS.** The hero's dark floors in floors.geojson ([6,7,8,17,18,20,21,24]) and its partial floors match the dossier `source_status`. The paint uses the PRD colors.
- **C2 PASS.** Two phones joined through the QR URL, the trackpad hover showed the fact card, and the demo-mode wake list offers only Esperson. Three strangers were not tested.
- **C3 PASS, with must-fix 2 needed for media.** Subtitles appeared within about 1 s of the wake, inside the 2.5 s dive. The intro line cites 1941. The Matterport iframe loads but is visible for only about 1.2 s.
- **C4 PASS (fake agent).** Typed pitch → cited challenge → revision → verdict "I'm in", with the four-axis score card, the needs bonus, cited evidence and the "Game character. Not a feasibility assessment." footer. The grounding eval was not rerun (no Bedrock).
- **C5 PASS.** Two phones charged to 100% within 1.6 s of the first tap. A duplicate tap from the same phone was rejected (50% after 3 rapid taps).
- **C6 PASS mechanically, FAIL visually (must-fix 1).** The floors light, and the city meter adds 94,509 sq ft once and entertainment +30. The 300 ms timing was not measured precisely.
- **C7 PARTIAL.** Typed input, subtitles, skip phase and reset room all work. Fixture mode is not labeled on /screen (must-fix 8).
- **C8 PARTIAL.** The dictation button exists but its label is invisible (must-fix 6). The typed path is unaffected.

## Judge-visible checks
- Console: 0 errors on /screen across two full rounds. Warnings only: React Router v7 future flags, swiftshader ReadPixels, and a Matterport iframe animation notice.
- No "vacant" anywhere in the UI. No broker or owner contacts. Every number shown matched a dossier fact.
- Internal IDs are visible: 233953 in the header and F_* fact IDs in the cards (must-fix 3 and 4).
- A6 works only when the pitch mentions parking or cars (`fake_agent.py:127` regex). With "drive-in movie... parking for the crowd", the challenge cited the Vexcel car count (21-challenge-parking.png). The esports pitch from the default script cites CoStar floor sq ft instead.

## Nice to have
- Script the demo pitch to mention parking so the challenge cites the Vexcel fact (the CoStar track's "three layers" line).
- Matterport caption copy: replace "Interior tour caption unavailable" and "Matterport · Caption unavailable" with plain "Matterport interior tour". Consider starting the tour beat earlier or holding it longer.
- The pet names "Sugar" and "Dollface" said to a judge may read as condescending (`fake_agent.py:82`, `persona.py:83-85`, `personas/233953.json:50`). "Hotshot", "Darling" and "kid" are safer.
- "1 buildings revived" needs singular/plural handling.
- Hover card line "Estimate · in imagery with an unknown capture date, 31 cars detected…" reads awkwardly.
- The trace panel's 13-14 px text is unreadable at 3 m. It opens by saying no `write_todos` call was captured, which is a weak lead for LangChain. Every row is labeled "research · 0 ms". Lead with the three subagents instead and enlarge the text.
- Someone must click "Start audio" on /screen before the demo, or there is no sound. Put it on the speaker card.
- Esperson is hard to pick out on the attract skyline (short, surrounded by towers). A glow or label on the hero would help.
