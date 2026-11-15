# Sponsor track endings

Every track gets the same 2-minute demo (docs/submission/demo-script.md). Only the last ~30 seconds change.
Claim only what's on screen. Never say "vacant". **Photon: not entered.** Don't mention iMessage.

Numbers below come from `evals/latency-check.md` (paid check, 2026-11-14, DATA_MODE=kit) unless noted.

## Entertainment (main track)

**Ending (30 s):** Stay on the light-up. Let the room cheer, then:
> "Every round, the city changes. What the neighborhood needs shifts, so the next building wants something
> different. You compete for the pitch, but everyone shares the skyline. Shark Tank, but the investor is a dark
> skyscraper. Your city needs you."

**Evidence to show:** the city progress meter and needs bars (labelled "game simulation"), the concept card, the
revision changing the outcome, phones charging together.

## CoStar: AI for the Built World

**Ending (30 s):** Hover the Esperson card, then the aerial caption, then the Matterport walk-in, then the challenge
that cites one of them:
> "Three layers, one address, one decision. The dark windows are floors CoStar lists as available with no tenant on
> record: office only, contacts never shown. Vexcel and Matterport give the building its evidence, and the agent
> uses that evidence to push back. CoStar tells us what's empty. Lights On lets everyone imagine what it could
> become."

**Evidence to show:**
- Floor status rule: `scripts/build_dossier.py`. Kit index: `scripts/build_kit_index.py` → `data/costar/index.sqlite`.
- Spatial evidence: `server/app/data/vexcel.py`, `server/app/data/matterport.py`, `scripts/fetch_vexcel.py`.
- A challenge citing a kit fact, from the paid check: "My typical floor gives you 22,189 square feet"
  (cites `F_233953_grossTypicalFloorSquareFeet`).
- Agentic depth: the trace panel (press **T**): three subagents, files written, then grounded live negotiation.

## Amazon: Practical AI Innovation

**Ending (30 s):** Open the trace panel (press **T**) and point at the model IDs:
> "Every building is an agent on Amazon Bedrock. Claude Haiku challenges each pitch in about two and a half seconds,
> and Claude Sonnet picks the winner. Nothing it says reaches the screen until our server checks every number
> against the dossier, and nothing it decides changes the game until our action validator approves it. Two real
> uses: city engagement sessions, and leasing events where a building pitches itself."

**Evidence to show:**
- Model IDs: `us.anthropic.claude-haiku-4-5-20251001-v1:0` (challenges, claim checks),
  `us.anthropic.claude-sonnet-4-6` (verdicts) in the trace panel and README.
- Latency: model-only time to a grounded line **p50 2.39 s / p90 4.08 s**; first grounded line per round 2.26 to 2.39 s.
- Reliability: **0/8** challenge fallbacks, **0/2** verdict fallbacks, 0 invalid schema attempts; published local
  numeric/ID grounding 9/10 in that check. The earlier full eval (`evals/report.md`) had 100% published grounding
  and schema (33/33), counting fallbacks.
- Validation and cost: `server/app/agent/grounding.py`, `server/app/actions.py`, spend guard
  `server/app/agent/spend.py` (the check cost $0.079).
- Use case and target user: README "Use case and target user".

## LangChain: Best use of deepagents

**Ending (30 s):** Press **T** on `/screen` and walk the "Recorded prep run" panel:
> "Each building is its own deep agent. Before the game, the Esperson's agent ran three subagents:
> property_scout read the CoStar facts, spatial_scout read the Vexcel and Matterport evidence, and persona_writer
> wrote its personality, all as files. Our server then validated that output. This is a recording of a real run
> that we cached; the panel is ours, built from the deepagents steps. Then the same building judges you live."

**Evidence to show:**
- `server/app/agent/prep_agent.py`: `create_deep_agent` with `subagents=[property_scout, spatial_scout,
  persona_writer]` and a `FilesystemBackend`.
- Trace panel: `apps/web/src/screen/overlays/TracePanel.tsx`, `server/app/trace.py`;
  screenshot `apps/web/e2e/screenshots/phase7/recorded-trace-1920x1080.png`.
- Be upfront: prep was cached; the recording has no captured todo plan or historical model IDs, so the panel
  shows the current model configuration, labelled as such. No LangSmith key, so it's our own trace panel.

## Photon: not entered

The iMessage controller isn't shipped (`messaging/` is a stub, no keys). Don't demo or mention it.
