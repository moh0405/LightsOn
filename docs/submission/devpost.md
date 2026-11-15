# Devpost submission: Lights On

## How to use this file

1. **Form fields** (not part of the story): copy from the table below.
2. **Story:** copy everything between `<!-- STORY START -->` and `<!-- STORY END -->` into the Devpost "About the
   project" box. It uses only Devpost's markdown (`##`, `**bold**`, `_italics_`, links, images).
3. **Images:** upload the five files in `docs/submission/screenshots/` to the Devpost **Image gallery**, in number
   order, with the captions from the table below. The first one becomes the cover image.
4. Add one screenshot of the **verdict score card** from your own recording if you have one (the saved one predates the
   new building look, so it is not included).

| Field | Value |
| --- | --- |
| Project name | Lights On |
| Tagline | Shark Tank, but the investor is a dark skyscraper. |
| Main track | Entertainment |
| Special tracks | CoStar: AI for the Built World · Amazon: Practical AI Innovation · LangChain: Best use of deepagents |
| Not entered | Photon (the iMessage controller is not shipped; do not tick it) |
| Video | Your unlisted YouTube link (script: `docs/submission/youtube-script.md`) |
| Repo | https://github.com/moh0405/LightsOn (verify judges can access it before submitting) |
| Built with | Python, FastAPI, Pydantic, WebSockets, SQLite, LangChain, deepagents, Amazon Bedrock, Claude Haiku 4.5, Claude Sonnet 4.6, CoStar data kit, Vexcel API 2.0, Matterport, React, TypeScript, Vite, MapLibre GL, Tone.js, Zustand, Web Speech API, cloudflared, Vitest, Playwright, pytest |

| Gallery image | Caption |
| --- | --- |
| `screenshots/01-skyline.png` | Explore downtown Houston, scan the QR code and pitch a new life for its dark floors. |
| `screenshots/02-challenge.png` | Esperson challenges a pitch with evidence from its own CoStar dossier. |
| `screenshots/03-light-up.png` | Players charge the building together; winning floors light up and the city meter updates. |
| `screenshots/04-walk-inside.png` | Explore Esperson's real interior through an embedded Matterport tour. |
| `screenshots/05-agent-trace.png` | Replay the recorded deepagents research run that prepared Esperson on Amazon Bedrock. |

<!-- STORY START -->

## Lights On

**Shark Tank, but the investor is a dark skyscraper.**

Our downtown Houston game board uses CoStar records to identify office floors listed as available with no current
tenant area on record. Players join from their phones, wake a building and pitch it a new life. The building is an AI character
that knows its own data. It pushes back with real numbers, picks a winner, and the whole room powers its floors back
on together.

## Inspiration

Downtown office towers have entire floors listed for lease with no tenant on record. A spreadsheet of square footage
does not make anyone care about that. A building that talks back might.

We wanted a party game where the real city is the board, and where the fun part (arguing with a 1941 skyscraper that
calls you "kid") is also the part that gets you thinking about its documented space and constraints.

## What it does

**1. Join and aim.** The projector shows downtown Houston in 3D. Players scan a QR code and join in the phone
browser, with no app to install. They drag to aim a beam at the skyline and wake a building.

**2. The building introduces itself.** The camera dives to the tower. For our Esperson demo, an aerial photo and a Matterport tour of its
real interior play while the building speaks in its own voice, with subtitles.

**3. Pitch.** In demo mode, each player has 20 seconds to pitch a new use for the dark floors, by voice or by typing.

**4. The building fights back.** It answers every pitch with a challenge that cites its own dossier and a
counteroffer. The source of the number is shown on the card.

**5. One revision, then the verdict.** Players answer the counteroffer. The building scores every pitch on four
criteria, names a winner and says why.

**6. Power it up.** Everyone taps their phone together to charge the building. The winning floors light up in the
winner's colour, a new layer joins the city song, and a concept card shows what the floors became.

**7. The city changes.** The neighbourhood's simulated needs (housing, food and retail, entertainment, community)
shift after every round, so the incentives for the next pitch change. You compete for the pitch, but everyone
shares the skyline.

At any time the host can press **M** to walk inside the real building, or **T** to open the agent's trace.

## How we built it

**Real data first.** The game runs on the CoStar hackathon kit, office properties only, streamed once into a SQLite
index. A deterministic rule turns listings and current tenancies into a status for every floor: dark, partial,
occupied or unknown. Broker and owner contacts are never shown and never sent to a model.

**Spatial evidence.** Vexcel API 2.0 supplies the parcel, footprint, aerial images and car detections. Matterport
supplies interior tours from the kit's model IDs. Vexcel evidence is cached ahead of play; Matterport tours load in live embedded players.

**Each building researches itself.** Before the game, a LangChain `deepagents` agent on Amazon Bedrock runs three
named subagents for the Esperson: `property_scout` reads the CoStar facts, `spatial_scout` reads the Vexcel and
Matterport evidence, and `persona_writer` writes its personality. They write files; our server then merges and
validates the result deterministically.

**Live negotiation.** During the round the building is a LangChain agent on Bedrock with tools to look up any fact in
its dossier. Claude Haiku 4.5 writes the challenges and checks claims; Claude Sonnet 4.6 decides the verdict.

**The model proposes, the server decides.** Nothing the model says reaches the screen until our server has checked
it: every cited fact must exist, and every number and unit must match the dossier. Nothing the model decides changes
the game until an action validator approves it. A spend ledger caps the Bedrock cost.

**The game itself.** A FastAPI and WebSocket server owns all state. The projector is React with a MapLibre 3D
skyline, a Tone.js city song and browser speech. Typing, tapping and subtitles always work, so a noisy room or a
denied microphone never blocks a round.

## What is real, cached and simulated

- **Real:** building and floor data from the CoStar kit (office only).
- **Real, cached at prep time:** Vexcel aerial imagery and detections.
- **Real, loaded live:** embedded Matterport interior tours using model IDs from the kit.
- **Real deepagents run, cached:** the Esperson's research and persona. The trace panel replays that recorded run and
  says so on screen.
- **Live Bedrock calls:** challenges, counteroffers and verdicts, each checked for grounding. A deterministic offline
  judge using the same facts takes over on a timeout or a rejected answer.
- **Simulated:** the neighbourhood needs, labelled "game simulation" on screen.
- **Game art:** the concept card, labelled "Game concept, not a real renovation".

_"Dark" means at least 90% of a known floor area is listed as available, with zero current tenant area recorded.
Missing floor data remains unknown. These records do not prove that nobody is physically there. The building is a
game character, and its verdict is not a feasibility assessment._

## Challenges we ran into

- **Making the model cite and not invent.** Early verdicts kept failing our own number check: a player's "one floor"
  counted as an unsourced number, and hyphenated number words were not parsed. We tightened the grounding rules until
  a paid check went from 2 of 2 verdict fallbacks to 0 of 2.
- **Latency for a party game.** Physical feedback (pointer, hover, charge) never waits on an AI call, and a persona
  "thinking" line appears instantly. In the recorded live rehearsal, the two grounded challenges arrived about 3.0 and 3.4 seconds after the
  challenge phase began.
- **Speech that respects the round.** The building's voice has to finish inside each phase. A live rehearsal exposed a verdict running into the
  light-up. We added speech budgeting and phase-aware queue handling; the revised verdict timing still needs a
  fresh live hardware check.
- **"Listed as available" is not "empty".** Floor status needed a careful rule built from active listings and current
  tenancies, with "unknown" when floor-level data is missing.
- **Budget.** A hard Bedrock spend ledger, cached prep and a free offline mode for rehearsal kept recorded Bedrock usage
  around $3.45 through the documented live rehearsal.

## Accomplishments that we're proud of

- A complete multiplayer loop: QR join, pitch, counteroffer, revision, verdict and a shared light-up.
- In a full live rehearsal on the demo machine, both challenges and the verdict came from the live model with no
  fallbacks. That run reached the light-up about 77 seconds after waking Esperson.
- Dossier citations, number and unit checks, and server-side action validation around the model output. The
  recorded rehearsal showed no raw fact IDs or contact names in the sampled UI.
- The power-up: a whole room tapping phones to light a real building.

## What we learned

- **Let code decide.** Having the model propose and deterministic code validate made live AI safe enough to put in
  front of strangers.
- **Label everything.** Saying on screen what is real, cached and simulated made the game more convincing.
- **Fallbacks are features.** Typed input, tap-to-charge, subtitles and an offline judge kept every round playable.

## What's next

- Full deepagents research runs for more buildings and other cities (seven Houston towers already have data-grounded
  personas).
- iMessage as a second controller, so people can pitch by text.
- A recorded building voice and tracing of live negotiation.
- A facilitator mode for city engagement sessions and leasing events, where residents pitch uses for real dark
  floors and see the real constraints.

<!-- STORY END -->

## Submission checklist

- [ ] Story pasted, five images uploaded to the gallery with captions
- [ ] YouTube video under 2 minutes, unlisted, linked
- [ ] Repo link works for judges (check access while signed out)
- [ ] Tracks: Entertainment + CoStar + Amazon + LangChain only (not Photon)
- [ ] Discord usernames of all team members
- [ ] "Built with" tags entered
