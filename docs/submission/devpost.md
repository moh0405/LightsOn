# Devpost draft: Lights On

**Title:** Lights On
**Tagline:** Your city needs you.
**Main track:** Entertainment. **Special tracks:** CoStar AI for the Built World, Amazon Practical AI, LangChain
deepagents. (Photon not entered: the iMessage controller isn't shipped.)

## Inspiration

Downtown office towers have whole floors listed for lease with no tenant on record. A spreadsheet of square
footage doesn't make anyone care about that. A building that talks back might. We wanted a party game where the real
city is the board: Shark Tank, but the investor is a dark skyscraper.

## What it does

The big screen shows the downtown Houston skyline. Dark windows are floors the CoStar kit lists as available with no
tenant on record. Players join by QR code in a phone browser (no app), aim or tap to wake a building, and pitch a new
use for its dark floors by voice or text.

The building is an AI character with a personality and a hidden desire. It answers each pitch with a challenge that
cites its own dossier ("My typical floor gives you 22,189 square feet...") and a counteroffer. Players get one
revision. Then the building picks a winner and says why. Everyone flicks their phone up, or taps, to charge the
building together: its floors light from the bottom up, a new layer joins the city song, and a concept card appears.
The city's simulated neighborhood needs (housing, food and retail, entertainment, community) then shift for the
next round.

Who it's for beyond parties: city engagement sessions, where residents pitch uses for real dark floors and see the
real constraints, and leasing events, where a building with available floors pitches itself.

## How we built it

- **Data:** the CoStar hackathon kit, office properties only (propertyType 5), streamed once into a SQLite index.
  A deterministic rule turns listings plus current tenancies into floor status: dark, partial, occupied or unknown.
  Broker and owner contacts are never shown or sent to a model.
- **Spatial evidence:** Vexcel API 2.0 (parcel, footprint, ortho and oblique images, car and tree detections) and
  Matterport tours from the kit's model IDs, fetched once at prep time and cached.
- **Prep agent:** one LangChain `deepagents` agent per building on Claude via Amazon Bedrock, with three named
  subagents: `property_scout` (CoStar facts), `spatial_scout` (Vexcel and Matterport evidence) and `persona_writer`.
  It writes its research to files; the server then merges and validates the result deterministically
  (`server/app/agent/prep_agent.py`).
- **Live negotiation:** Bedrock Claude Haiku 4.5 for challenges and claim checks, Claude Sonnet 4.6 for verdicts.
  Every line passes server-side grounding: cited fact IDs must exist, and numbers and units must match the dossier.
  Every proposed game action passes `server/app/actions.py`. The model proposes; the server decides. A spend ledger
  caps Bedrock cost.
- **Game:** FastAPI + WebSockets server that owns all state; React + MapLibre skyline, Tone.js city song, browser
  speech synthesis and recognition with subtitles always on; phone motion for flicks with tap fallbacks everywhere.

## What is real, cached and simulated

| Part | Status |
| --- | --- |
| Building and floor data | **Real**: CoStar kit, office only |
| Aerial imagery, detections, interior tours | **Real, cached** at prep time (Vexcel, Matterport) |
| Building research and persona | **Real deepagents run, cached**: one prepared building (the Esperson, PropertyId 233953) |
| Challenges, counteroffers, verdicts | **Live Bedrock calls** in live mode, with grounding. A deterministic offline judge (same facts, no network) is the fallback on timeout or rejected output |
| Trace panel | Replays the **recorded** prep run's steps (subagents, files, tool calls). The recording didn't capture a todo plan or historical model IDs, so the panel shows the current model configuration and says so |
| Neighborhood needs | **Simulated**: a deterministic game model, labelled "game simulation" on screen |
| Concept card | **Game art**, labelled "Game concept, not a real renovation" |
| Building voice | Browser speech synthesis (no ElevenLabs key) |

"Dark" means listed as available with no tenant on record. It does not mean nobody is there.

## Challenges we ran into

- **Making the model cite and not invent.** The first verdicts kept getting rejected by our own number check
  (for example, a player's "one floor" counted as an unsourced number, and hyphenated number words weren't parsed). We
  tightened the grounding rules until the paid check went from 2 of 2 verdict fallbacks to 0 of 2.
- **Latency for a party game.** We batch challenges, show a persona "thinking" line instantly and keep physical
  feedback off the AI path. Measured model-only time to a grounded challenge: p50 2.39 s, p90 4.08 s.
- **"Available" isn't "vacant".** Floor status needed a careful rule built from active listings and current tenancies,
  with "unknown" when floor-level data is missing.
- **Budget.** A hard Bedrock spend ledger, cached prep, and a free fixtures mode for rehearsal.

## Accomplishments that we're proud of

- A full multiplayer round, from QR join to light-up, in under two minutes.
- In the latest paid check: 0 of 8 challenge fallbacks and 0 of 2 verdict fallbacks; every published line passed
  grounding (`evals/latency-check.md`).
- The power-up is the moment: the whole room flicking phones to light a real building.

## What we learned

- The server-decides pattern (model proposes, deterministic code validates) made live AI safe enough to put in front
  of strangers.
- Labelling what's real, cached and simulated on screen made the game more convincing, not less.
- Fallbacks should be first-class: typed input, tap-to-charge, subtitles and an offline judge kept every round
  playable.

## What's next

- Prepared personas for more buildings (Wells Fargo Plaza is next) and other cities.
- iMessage as a second controller (Photon), so people can pitch by text.
- Real voice (ElevenLabs) and LangSmith tracing of live negotiation.
- A facilitator mode for planning offices and leasing teams.

## Built with

Python, FastAPI, Pydantic, WebSockets, SQLite, LangChain deepagents, Amazon Bedrock (Claude Haiku 4.5, Claude
Sonnet 4.6), CoStar hackathon data kit, Vexcel API 2.0, Matterport, React, TypeScript, Vite, MapLibre GL, Tone.js,
Zustand, Web Speech API, DeviceMotion API, cloudflared, Vitest, Playwright, pytest.

## Submission checklist (from docs/PRD.md)

- [ ] Public GitHub repo link; README has run steps, architecture, sponsor tech, real vs cached vs simulated, limits
- [ ] Video under 2 minutes on YouTube, linked
- [ ] Screenshots: skyline, challenge card, verdict, light-up, trace panel
- [ ] Discord usernames of all members
- [ ] Tracks: Entertainment + CoStar + Amazon + LangChain only
