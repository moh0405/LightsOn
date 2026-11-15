# Lights On — judge follow-ups by track

Give the same [core demo](demo-script.md) first: pitch → counteroffer → revision → verdict → shared light-up. These are optional **20–30 second follow-ups**, not four speeches to squeeze into the core. Use the one that answers the judge's interest.

Do not promise a specific model response or cite an old timing result as current performance. Photon/iMessage is not shipped and is not part of this demo.

## Entertainment

**Keep the skyline visible.**

> “The competition gives you a reason to pitch. The counteroffer gives you a reason to listen. And even if you lose, you help light the building. Every revival changes the simulated city needs and adds to its song. You compete for the pitch, but everyone shares the skyline.”

**Point to:** both proposals, the actual revision, group charging, the lit floors, city needs and the new music layer. Do not claim a revision reversed the outcome without evidence.

## CoStar: AI for the Built World

**Point to the cited evidence; offer the interior tour afterward.**

> “CoStar makes the game specific to a real building: floor areas, listings and recorded tenancies shape what it can challenge. Vexcel adds aerial evidence, and Matterport lets you look inside. We keep unknowns unknown, exclude contacts, and distinguish listed availability from physical occupancy. The game makes the data something people can discuss and play with.”

**Evidence:**

- `scripts/build_kit_index.py`: streaming, Office-only index with contact-free allowlists.
- `server/app/data/floor_status.py`: dark / partial / occupied / unknown rules.
- `server/app/data/vexcel.py` and `server/app/data/matterport.py`: spatial/tour adapters.
- The source label and dossier fact under the actual challenge card. A challenge does not necessarily cite all three providers.
- **M** / **Walk inside**: an available real Matterport tour. Aerial evidence is cached; the embedded tour loads live.

## Amazon: Practical AI Innovation

**Use the live trace if available; distinguish it from recorded research.**

> “Claude on Amazon Bedrock powers the negotiation: Haiku handles challenges and claim checks, and Sonnet handles verdicts. The live agent can retrieve facts from the building's dossier. Our server checks citations and quantities, validates proposed actions, and enforces a spend cap. If generation fails, the same game loop can continue with a deterministic judge.”

**Evidence:**

- `server/app/agent/live_agent.py` and `knowledge.py`: live negotiation and fact lookup.
- `server/app/agent/grounding.py` and `server/app/actions.py`: grounding and final state-change validation.
- `server/app/agent/spend.py`: persistent spend accounting and enforced cap.
- `apps/web/e2e/visible-demo-run-report.md`: a documented replacement live round with two live challenges and a live verdict, no fallback in that run. Challenges were ready at about 3.0 and 3.4 seconds; verdict readiness was about 6.6 seconds. These are historical observations from that build, not a fresh benchmark or guarantee.
- `evals/latency-check.md`: a separate budget-limited evaluation. Do not quote its fallback cases as live-model successes or reuse the obsolete 0/8 fallback claim.

**Potential use, if asked:** facilitated classroom or city engagement sessions. These are proposed extensions, not validated customers or deployments.

## LangChain: Best use of deepagents

**Press T and identify the recorded prep run before describing it.**

> “This is the recorded research run for Esperson. A deepagents supervisor delegated to property_scout, spatial_scout and persona_writer, which wrote research artifacts. We validated those outputs before using them. At play time, a separate LangChain agent retrieves dossier facts to negotiate. Research is cached; the conversation can be live.”

**Evidence:**

- `server/app/agent/prep_agent.py`: `create_deep_agent`, named subagents and a scoped filesystem backend.
- `server/app/trace.py` and `apps/web/src/screen/overlays/TracePanel.tsx`: the project's own recorded/live trace UI.
- The prepared Esperson artifacts in the local cache, if available. They are not included in a fresh clone.
- Seven buildings have grounded personas; only Esperson has the documented full recorded research run. Do not generalize that run to every building.
- The saved run did not capture `write_todos` or historical model IDs. The panel labels the model configuration it shows; it is not a LangSmith trace.

## One-line answers when there is no time

| Judge interest | Say |
| --- | --- |
| Entertainment | “Compete to persuade the building, then cooperate to bring it to life.” |
| CoStar | “Real property evidence becomes the constraints of a playable conversation.” |
| Amazon | “Bedrock powers the negotiation; our server validates the result and controls the spend.” |
| LangChain | “Deepagents researches Esperson before play; a LangChain agent uses its dossier during negotiation.” |
