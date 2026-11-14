# Task: Phase 4A, Vexcel adapter, media and footprints (Lights On)

Read AGENTS.md, docs/agent-workflow.md, docs/PRD.md "Data layer" (Sources, Vexcel calls, Dossier schema, Floor geometry)
and "Phase 4", docs/vendor/vexcel/vexcel_quickstart.py (the reference implementation) and the tutorial PDF in the same
folder. Then server/app/data/ and scripts/build_dossier.py, scripts/build_floors.py.

A second worker (4B) builds the prep deepagent later and will call your functions as tools. You own:
server/app/data/vexcel.py, server/app/data/matterport.py, scripts/fetch_vexcel.py (new), scripts/build_floors.py,
scripts/build_dossier.py (merge only), server/tests/, apps/web/public/media/ (gitignored; never commit images).

## Build
1. `server/app/data/vexcel.py` (httpx, async OK): X-API-KEY header from VEXCEL_API_KEY (never in URLs, never logged),
   base VEXCEL_API_BASE, WKT `POINT(lon lat)`, srid 4326, layers urban,urban-r,wide-area,urban-g, `/oriented/collections`
   before obliques, exponential backoff with jitter on 429 (max 5 retries), 60 s timeout, every failure logged and returned
   as a typed fallback (never raises into game code). Functions: `property(lat, lon)` (parcel + structure footprints,
   latest=true, include=precomputed), `ortho(parcel_wkt)`, `obliques(parcel_wkt)`, `detect(parcel_wkt, labels)`
   (threshold 0.5, buffer-meter 30). Results cached on disk under server/cache/vexcel/<propertyId>/ (gitignored) so a
   second run makes zero network calls.
2. `scripts/fetch_vexcel.py <id>...`: for the 2 hero buildings only (233953, 233899) by default: footprint, ortho, the
   available obliques, and detections for labels "parking lot", "car", "rooftop terrace", "solar panel", "tree". Save
   images to apps/web/public/media/<id>/. Write `server/fixtures/vexcel/<id>.json` (committed, small: footprint polygon,
   capture dates, detection counts/labels with confidence, image file names; no API key, no raw image bytes).
3. Dossier merge (scripts/build_dossier.py): Vexcel detections become facts with `source: "vexcel+vision"`,
   `kind: "estimate"`, the capture date in `say_as` ("on the 2025 flyover ..."), and the footprint replaces the approx
   square with `footprint.source: "vexcel"`. `media.aerial` lists ortho/oblique paths. Missing = null. Existing CoStar facts
   and fact ids must not change (Esperson floors 6-8 stay dark, 31,503).
4. `scripts/build_floors.py`: use the Vexcel footprint for heroes when present (else OSM, else approx) and set
   `footprint_source` accordingly. Regenerate floors.geojson.
5. `server/app/data/matterport.py`: docs/vendor/matterport does not exist, so return the kit's Matterport model ids and
   captions only (from the index / dossier media). Same adapter shape (timeout/fallback) for later.
6. Tests: unit tests with recorded fixture responses (no network in pytest): auth header set and never in URL, 429
   backoff, timeout fallback, cache hit makes no call, fact building (estimate kind + capture date), footprint merge,
   Esperson unchanged. One opt-in live smoke test behind `VEXCEL_LIVE=1`.

## Rules
Small commits per working step (`phase4: ...`), tests first, `git push -u origin HEAD` after each. Never commit images,
data/, .env, server/cache/. If a real Vexcel response differs from the PRD or quickstart assumptions, record it in the PR
and docs/overnight-log.md and continue with the safe interpretation (the human is asleep).

## Done means
Branch `phase4/vexcel`. `cd server && uv run pytest`, `pnpm -r test`, `pnpm --filter @lights-on/web e2e` pass.
Run `scripts/fetch_vexcel.py` once for real for both heroes and report what came back (footprint yes/no, image counts,
detections). `gh pr create --base main --label agent:antigravity` (or agent:codex if Codex did it). End the body with
"🤖 Generated with <agent>, coordinated by Claude Code". worker_done with PR URL + summary lines.
