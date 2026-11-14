# Post-merge review: 03e32e4..82f4f8f (PR #9 Phase 3 fixes, PR #10 Phase 4A Vexcel)

Reviewer: Claude (read-only). Date: 2026-11-14.

## Verdict: pass-with-issues

Nothing blocks the demo. Fix 1 and 2 before Phase 4B lets `spatial_scout`/agents read Vexcel facts. Fix 3 and 4 before anyone re-runs `scripts/fetch_vexcel.py`.

## Test runs (worktree at 39efcf9, which includes 82f4f8f)
- `cd server && uv run pytest` (Python 3.11, real kit linked in through an ignored `data` symlink that I removed afterwards): **133 passed, 1 skipped** (the skip is the opt-in `VEXCEL_LIVE=1` smoke test).
  Without the kit, 5 tests in `test_rooms.py` fail with `OperationalError`. That is a missing-environment problem, not a code problem.
- `pnpm -r test`: **33/33 web passed**, messaging tsc passed.
- `pnpm --filter @lights-on/web e2e` (foreground): **14/14 passed (1.3 min)**, including phase3-fixes (kit + fixtures) and the layout test with 0 and 4 players.
  The first attempt hit a port clash on 18001 because the parallel Codex reviewer was running e2e on the same fixed ports. I waited for it to finish, then reran.
- Rebuilt the dossiers for 233953 and 233899 from the kit plus the Vexcel fixtures. Both are **byte-identical to the committed fixtures**.

## Findings, most severe first

1. **MEDIUM: negative detections are stated as facts.** `scripts/build_dossier.py:98-115`
   - What is wrong: every label with count 0 becomes a fact (`value: 0`, `say_as: "on the 2023 flyover, no parking lot detected"`). Each hero gets 3-4 of these: parking lot, rooftop terrace, solar panel, and tree for Esperson.
   - Why it matters: a missed sam3 detection at threshold 0.5 is not evidence that the thing is absent. A model reading the dossier can say "there is no rooftop terrace / no trees", which breaks rule 4 (no invented facts) and checklist item 3.
   - Fix: skip the fact when count == 0, or set `value: null`. Keep only positive detections.
2. **MEDIUM: the obliques cache saves a timeout or missing key as "no coverage".** `server/app/data/vexcel.py:252-259` and `231-235`
   - What is wrong: `coll_resp is None` covers a timeout, a network error and a missing API key. All three write an empty `oriented_collections.json`, and every later call returns `{}` from that cache without touching the network.
   - Verified: a timeout followed by a healthy server still returns `{}` with 0 calls.
   - Fix: cache the empty result only on a real 404. Return `{}` without caching when the response is None.
3. **MEDIUM: the detect and ortho caches ignore their inputs.** `vexcel.py:323-329` (detect), `vexcel.py:193-198` (ortho)
   - What is wrong: the cache path depends only on `property_id`, not on the labels or the WKT.
   - Verified: after `detect(labels=["car"])`, calling `detect(labels=["swimming pool"])` returns the cached car result.
   - Consequence: `fetch_vexcel.py` would then write count 0 for the new labels, which (through finding 1) become "no swimming pool detected" facts for labels that were never queried. The ortho has the same issue: a fallback square that gets cached is kept after a real parcel appears.
   - Fix: include a hash of the labels and WKT in the cache filename.
4. **LOW-MEDIUM: the adapter can raise on an unexpected response shape.** `vexcel.py:271-276`
   - What is wrong: `f["properties"]["last-capture-date"]` raises `KeyError` when a feature lacks the field. Verified: it raises out of `obliques()`.
   - Rule: adapters must return typed fallbacks and never raise (rule 9 and the module docstring).
   - Fix: use `.get(...)` and filter out None, or wrap the parse in the existing try/except.
5. **LOW: Vexcel facts have no structured capture date, and the date may be the wrong one.** `build_dossier.py:94-104`
   - The capture date appears only as a year inside `say_as`. If it is missing, the text falls back to "on the recent flyover".
   - The year comes from `property/extract` `metadata.ortho-date-estimate`. The detect call runs on its own all-layers ortho, which can come from a different capture.
   - `buffer-meter: 30` (per the PRD) means "31 car detected" for Esperson counts street cars around the parcel, but `say_as` reads as if they are on the building.
   - Grammar: "31 car detected", "2 tree detected".
   - Fix: put the date in a field such as `as_of`, say "within ~30 m", and pluralise.
6. **LOW: some projector text is now smaller than PRD:256 allows (body text ≥ 28 px at 1080p).** `apps/web/src/screen/overlays/RoundOverlays.tsx:55,60`, `ScreenApp.tsx:312`
   - The needs labels went from 28 to 24 px, "game simulation" to 22 px, and the player list to 22 px.
   - Fix: restore 28 px and reclaim height elsewhere, for example with tighter meter spacing.
7. **LOW (test quality): one layout assertion cannot fail.** `apps/web/e2e/qa-phase3-layout.spec.ts:193-194`
   - `main` is now `height: 100vh; overflow: hidden` (`ScreenApp.tsx:32`) and the aside also has `overflow: hidden`. So `scrollHeight <= 1080` holds by construction, and anything that overflows is silently clipped.
   - The `meterBottom <= 1080` check is the real guard. Consider asserting that the last needs row / "Most needed" text and the last player row are inside the viewport.
8. **LOW (test quality): the Vexcel unit tests do not check the request contract.** `server/tests/test_vexcel.py`
   - Nothing asserts `wkt=POINT(lon lat)` ordering, `srid=4326`, the four layers, that collections is called before `oriented/extract`, the 60 s client timeout, or that the key never reaches log output (no caplog check).
   - The 429 test monkeypatches `time.sleep` globally, which is fine.
   - `test_vexcel_live_smoke` uses the default disk cache, so after one run it no longer hits the live API.
   - The fact and footprint tests only read committed fixtures. The rebuild is reproducible (verified by hand), but no test runs the merge in `build_dossier` against `fixtures/vexcel`.
9. **INFO: things to tidy.**
   - `server/app/data/matterport.py:83`: the alias `matterport_get_model = get_models` is misnamed. `timeout` is used only as the sqlite busy timeout.
   - The snapshot restore drops old `song_layers` when a pre-fix snapshot has no `song_categories` (`rooms.py:430`). This is harmless for the hackathon.
   - The phone `room_state` after a revival resets `lastError`/`revival` on phones (`store.ts:101`). Nothing in `/play` reads `revival`.

## Checked and fine

### (1) Phase 3 fixes
- **Intro survives reconnect and restart.**
  - `rooms.py:93` stores the intro, which is built once at INTRO (`rooms.py:237-238`), broadcast from the same stored value (`:251`), and saved before the broadcast.
  - The snapshot sends it only when there is a round and the phase is not LOBBY/EXPLORE (`:384`). It is cleared in `_clear_round_inputs` (`:394`) and restored on load (`:417`).
  - The client keeps `msg.intro` (`store.ts:99`).
  - Tests: `test_intro_survives_pitch_snapshot_and_restart`, store.test, phase3.spec reload, phase3-fixes reload. All pass.
- **Wake list is sent again after revivals and resets.**
  - `rooms.py:356` sends `room_state` to `play` after every `_revive`. That covers the tap and timer paths, which both go through `_revive`.
  - `reset_room` already broadcast `room_state` (`:280`). No new event names were added.
  - Unit and e2e tests check that the Wake button disappears after 4 rounds while the button for the next building stays.
- **Song layers count distinct categories.**
  - `city.py` keeps `song_categories` (capped at 8), and `song_layers` is a property equal to its length. The snapshot adds `song_categories`, so the change is additive.
  - `protocol.ts:15` makes the field optional. The client reducer mirrors the same cap.
  - Tests: culture+culture gives 1 layer, adding housing gives 2 (server and client).
- **/screen fits 1920x1080.** The QR is 200 px. The e2e test passes with 0 and 4 players using the real QR, with the city meter bottom ≤ 1080 and the QR width ≤ 200 (see findings 6 and 7).
- **Flaky player-row test.** The root cause was row order (server join order versus `colors[0]`). The fix compares against Ann's own row color (`phase1.spec.ts:44,57`), with no added sleeps.

### (2) Vexcel adapter
- **Key handling.**
  - The `X-API-KEY` header is the only place the key goes (`vexcel.py:97`). It never goes into params or the body.
  - Logs print the path and the exception class name only. Unit tests assert the key is not in the URL.
- **Request parameters.**
  - `POINT({lon} {lat})` (`:150`), `srid: 4326` on every call, and `layer=urban,urban-r,wide-area,urban-g` on property, ortho and detect. Obliques use `urban`, as in the quickstart.
  - `latest=true` and `include=precomputed`.
- **Collections before obliques.** `oriented/collections` is called before `oriented/extract`, and only the directions available in the newest capture are requested. The oblique body matches the quickstart quirks.
- **Backoff and timeout.**
  - Backoff on 429 follows `min(2^n, 30) + jitter`, with 5 retries.
  - `httpx.Client(timeout=60)`. The timeout and request errors return None, which becomes a typed fallback (empty FeatureCollection, None, or `{}`).
- **Disk cache.**
  - The cache lives under `server/cache/vexcel/<pid>/`, which is gitignored.
  - A cache hit makes zero calls (tested). Exceptions are finding 2 and finding 3.
- **Detect body.** `buffer-meter: 30`, threshold 0.5, and the PRD's labels.

### (3) Dossier merge
- Vexcel facts are `kind: estimate`, `source: vexcel+vision`.
- **No CoStar fact id changed.** I diffed the facts of both hero dossiers against 03e32e4. Nothing was removed or changed; only 5 `F_<pid>_vexcel_detection_*` facts were added per hero. `floors` are identical.
- **Esperson floors 6-8** are `source_status` dark, size and available 31,503.
- **Footprint.** It is the `primary-structure` `footprint.wkt` and carries `source: vexcel`. It is valid and covers the dossier point for both heroes (Esperson ~6,350 m², WFP ~2,400 m²).
  - `build_floors.footprint_for` prefers it and falls back to osm, then approx (tested).
- **Media paths.** Media paths `/media/<pid>/...` point at the gitignored `public/media`.

### (4) Hygiene
- **No images, data or secrets committed.**
  - No files under `data/`, `apps/web/public/media` or `.env`. The only PNGs are the e2e/QA screenshots under `apps/web/e2e/screenshots/`. I viewed `projector-overflow.png`: it shows a localhost QR only, with no aerial imagery.
  - No key-like strings in the diff.
- **No contacts or "vacant".** No broker or owner contacts. The only "vacant" in the diff is the negative test regex in the QA sweep.

### (5) Other
- Matterport adapter: it uses read-only sqlite, validates the id as decimal, and never raises.
- `fetch_vexcel.py` writes only metadata to the fixtures, no bytes or keys.
