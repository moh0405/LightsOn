# 2-minute demo script (main track)

From the LLM council verdict (docs/council/20261114-1718-*.md) and docs/PRD.md "Two-minute demo".

**Before the judge arrives:** `./scripts/demo.sh` running (`DEMO_MODE=1`: 20 s pitch, 15 s negotiate, Esperson
only). Audio started. Round reset from `/admin`. **Teammate two has already joined** as a player. Typed input is ready
in case the room is noisy. The winner is never predetermined.

| Time | On screen / action | Say (exact line) |
| --- | --- | --- |
| 0:00 | Dark, silent skyline with the QR code | "Every dark window is a real floor CoStar lists as available, with nobody on record, in downtown Houston." |
| 0:10 | Judge scans the QR code; teammate is already player 2 | "You're an entrepreneur. The buildings are the investors. Scan in." |
| 0:15 | Judge aims or taps the Esperson; the intro plays | "Wake that one up." Then stay quiet and let the building talk. |
| 0:30 | Judge pitches by voice, or types if it's loud | "Pitch it something to do with its dark floors. Anything." |
| 0:50 | The building's challenge appears, citing a fact, plus a counteroffer | "That number came straight from CoStar. It's pushing back with its own data." |
| 1:05 | Judge revises; the verdict lands: "I'm in" or "I'm out" | "You get one revision. Answer the counteroffer." Then let the verdict play. |
| 1:30 | Everyone flicks their phones up, or taps; energy fills, floors light bottom to top, the song layer starts, the concept card appears | "Now power it up, everyone together. Flick up!" Then, as it lights: "Your city needs you." |
| 1:50 | Press **T**: trace panel | "Each building researched itself with a deep agent on Bedrock. CoStar tells us what's empty. Lights On lets everyone imagine what it could become." |

## Rules for the presenter

- Never say "vacant". Say "dark", or "listed as available with nobody on record".
- Don't rig the verdict. You can suggest a pitch that invites a fact-based challenge (for example, something that
  needs a lot of floor space or parking), but the outcome stays real.
- If a verdict falls back to the offline judge, keep going. The light-up still lands.
- If anything stalls: `/admin` → **Skip phase**. If the network dies: Ctrl-C, then `./scripts/demo.sh --fixtures`,
  then rescan.

## Sponsor variants

Swap the 1:50 line for the track ending in docs/submission/tracks.md (Entertainment, CoStar, Amazon, LangChain).
Photon is not entered.
