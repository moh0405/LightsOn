# Lights On

**Shark Tank, but the investor is a dark skyscraper.** Lights On is a multiplayer party game built on real
office data from downtown Houston. The big screen shows the skyline; dark windows are floors the CoStar kit lists
as available with no tenant on record. Players join by QR code on their phones, wake a building, and pitch a new
use for its dark floors. The building is an AI character. It pushes back with evidence from its own dossier and
makes a counteroffer. Players revise, the building picks a winner, and everyone flicks their phones to power the
floors up. The city's simulated needs then shift for the next round.

Built at HackPrinceton Fall 2026. The full spec is [docs/PRD.md](docs/PRD.md).

## Use case and target user

- **Players:** groups at a party, a meetup or a classroom. No app install: a phone browser and a QR code.
- **City engagement sessions:** a planning office or a downtown association runs a round at a public meeting.
  Residents pitch uses for real dark floors and see the constraints (floor plates, stories, parking) as they play.
- **Leasing events:** a building with available floors "pitches itself". A broker or owner team shows prospects
  the real floor sizes as a game instead of a spreadsheet.

The point is to get people imagining what dark office space could become, grounded in real data, without
pretending to be a feasibility study.

## What is real, cached and simulated

| Part | Status | Details |
| --- | --- | --- |
| Building and floor data | **Real** | CoStar hackathon kit, office properties only (propertyType 5), indexed into `data/costar/index.sqlite`. Floor status is dark / partial / occupied / unknown by the rule in the PRD. Broker and owner contacts are never shown or sent to a model. |
| Aerial imagery and site evidence | **Real, cached** | Vexcel API 2.0: parcel, footprint, ortho and oblique images, and Vexcel's car and tree detections near the parcel. Fetched once at prep time (`scripts/fetch_vexcel.py`), then served from the cache. |
| Interior tours | **Real** | Matterport model IDs from the kit, embedded during the building intro when present. |
| Building research and persona | **Real run, cached** | One LangChain `deepagents` agent per building on Claude via Amazon Bedrock (`us.anthropic.claude-sonnet-4-6`). It plans with the todo tool, writes files, and delegates to three subagents: `property_scout` (CoStar facts), `spatial_scout` (Vexcel and Matterport evidence) and `persona_writer`. The server then merges and validates the result deterministically. The Esperson (PropertyId 233953) run is cached in `server/cache/prep/233953/` and replayed in the game. Other buildings have no prepared persona. |
| Live challenges and verdicts | **Real when `AGENT_MODE=live`** | Amazon Bedrock: `us.anthropic.claude-haiku-4-5-20251001-v1:0` for challenges and claim checks, `us.anthropic.claude-sonnet-4-6` for verdicts. Every line passes server-side grounding (fact IDs, numbers and units must match the dossier) before it is shown. Every proposed action passes `server/app/actions.py`. A spend ledger caps Bedrock cost (default $3.00). |
| Offline judge | **Deterministic** | `AGENT_MODE=fake` (the default) uses `server/app/agent/fake_agent.py`: the same dossier facts and grounding, no network. Live mode falls back to it on any timeout or rejected output. |
| City needs | **Simulated** | Housing, food and retail, entertainment and community needs are a deterministic game simulation (`server/app/city.py`), labelled "game simulation" on screen. They are not real city data. |
| Concept card | **Game art** | The before/after card after a revival is labelled "Game concept, not a real renovation". |

## Known limits

- **No ElevenLabs key.** The building's voice uses the browser's speech synthesis and phones use browser speech
  recognition or typing. Subtitles and typed pitches always work.
- **No LangSmith key.** Agent steps are recorded by the server instead (the prep run in
  `server/cache/prep/<id>/agent_steps.json`, live steps as `agent_step` events to the screen).
- **No Photon keys.** The iMessage controller is not shipped; `messaging/` is a stub.
- **One prepared persona.** Only the Esperson has a prepared persona. Hero buildings without one (Wells Fargo
  Plaza) are not wakeable; context buildings with dark floors can be woken in normal play with fallback dialogue.
- **Phone sensors need HTTPS.** Use `tunnel.sh`; tap and touch controls work without sensors.
- **Floor status is what the kit records.** "Dark" means listed as available with no tenant on record, not that
  nobody is there.

## How to run

Requirements: Python 3.11 with [uv](https://docs.astral.sh/uv/), Node 20+ with pnpm 9, and the CoStar kit unzipped
at `data/costar/` (not committed).

```sh
cp .env.example .env              # fill in keys you have; never commit .env
uv run --project server python scripts/build_kit_index.py   # once: stream the kit into data/costar/index.sqlite
pnpm install
./dev.sh                          # server on :8000, web app on :5173
./tunnel.sh                       # optional: HTTPS URL for phones (cloudflared); set PUBLIC_BASE_URL to it
```

Open `/screen` on the big display, scan the QR code with phones (`/play`), and use `/admin` with `HOST_PIN` for
skip phase, reset round, reset room and the data mode switch.

### Settings (server environment, read from `.env`)

| Variable | Values | Effect |
| --- | --- | --- |
| `DATA_MODE` | `kit` (default) / `fixtures` | `kit` authorizes buildings against the real kit index. `fixtures` uses the committed dossiers only, for offline play and tests. Switchable live from `/admin`. |
| `AGENT_MODE` | `fake` (default) / `live` | `live` calls Amazon Bedrock for challenges and verdicts, with grounding and fallbacks. |
| `DEMO_MODE` | `1` / unset | Demo round preset: pitch 20 s, negotiate 15 s, and only the Esperson can be woken. `/admin` shows whether it is on. Restart the server to change it. |
| `DEMO_BUILDING_IDS` | default `233953` | Buildings wakeable in demo mode (each still needs a prepared persona and dark floors). |
| `PHASE_DURATIONS_SCALE` | default `1.0` | Multiplies every phase timer (tests use `0.1`). |
| `HOST_PIN` | any | Protects host actions. |

### Tests

```sh
(cd server && uv run pytest)                  # server, both data modes
pnpm -r test                                  # web unit tests (Vitest)
uv run --project server python evals/run.py --quick   # offline agent evals, no network
pnpm --filter @lights-on/web e2e              # Playwright, starts its own server and web app
```

## Architecture

```
phones (/play) ─┐                      ┌─ CoStar kit index (sqlite, read-only)
big screen ─────┼─ WebSocket ─ FastAPI ┼─ dossiers + cached prep (Vexcel, persona)
/admin ─────────┘   commands    rooms  ├─ live agent (Bedrock) → grounding → actions.py
                                       └─ fake agent (offline fallback)
```

The server owns the game state. The model proposes; `actions.py` and the grounding checks decide.
