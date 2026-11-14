# LLM council: It is Saturday ~6pm; submission target Sunday 6am (hard 8am), judging Sunday 9:30am. Phases 0-5 are done and Phase 6 (audio, media, light-up polish) is nearly done; see docs/handoff.md and docs/overnight-log.md. Missing keys: LangSmith, ElevenLabs, Photon. Bedrock budget left ~$1.80. Agents: Codex and Claude only. What is the right scope for the remaining ~12 hours: which Phase 7 P1 features (docs/PRD.md Scope A1-A8) to build, what to cut, and what to prepare for the 2-minute demo and the sponsor tracks (CoStar, Amazon, LangChain deepagents, Photon, Entertainment) to maximize winning? Give a prioritized plan with time estimates.

Members: codex, claude-opus, grok. Chairman: claude-opus. 20261114-1718.

## Final answer (chairman)

# Council verdict: remaining scope for Lights On (Sat 6pm to Sun 6am)

**Recommendation:** Finish Phase 6 and check every P0 gate. Build one new feature, the A3 trace panel. Polish one building, Esperson. Spend the rest of the night on reliability, rehearsal and submission. Four sponsor tracks that work beat five fragile ones.

## Where the council agrees
- **P0 comes before Phase 7.** Merge 6B and the verdict fix first. The last paid check had 2 of 2 verdict fallbacks, and no paid run has tested PR #23 since. That is the biggest risk to the live demo.
- **A3 trace panel is the only new code worth writing.** Replay the cached Esperson `agent_steps`: the `write_todos` plan, the three subagents, the files they wrote, the tool calls and the Bedrock model IDs. It costs no Bedrock money. It covers the LangChain track and the agentic parts of the CoStar and Amazon scoring, and it replaces the missing LangSmith key. Label it "recorded prep run" so it isn't mistaken for live negotiation.
- **A4, A5 and A7 mostly exist already.** Check them against their acceptance criteria and fix gaps; don't rebuild them. A4 shipped in #22. `city.py` already has needs, bonus and the analyst line. A7 rides on 6B, so confirm the "game concept" label.
- **A6 is a verification task.** Make sure at least one challenge cites a real spatial fact from the dossier, and add an eval case for it.
- **The admin demo preset is missing and has to be built:** 20-second pitch, 15-second negotiate, Esperson-only wake, skip and reset.
- **Cut** A2 (Photon), A8 (precise aiming), new voice providers, P2 items, and any regeneration of Esperson. Browser speech plus subtitles covers the missing ElevenLabs key.
- **Rehearse in fixtures mode**, and save Bedrock money for judging.

## Disagreements and who is likely right
1. **A second building (A1).** One answer wanted Wells Fargo with a $0.40 cap. The other two said cut it, and they're right. Esperson's prep cost $1.62, so a $0.40 cap is not realistic, and a failed prep would eat the judging budget. Also remove Wells Fargo from the wake list, so no judge can open its placeholder persona.
2. **Photon.** One answer proposed a 9pm go/no-go decision. With `messaging/index.ts` empty and no keys, cut it. A human can spend 15 minutes at the booths asking for Photon, LangSmith and ElevenLabs keys. Nothing gets built around those keys either way.
3. **Feature freeze.** The three answers said 23:30, 00:00 and 00:30. **Freeze at midnight**, with 2am as the absolute limit for bug fixes.
4. **Scripting the challenge.** It's fine to script the *pitch* so it invites a challenge about a dossier fact. It's not fine to rig the verdict; the outcome stays real. A templated fallback can cite a Vexcel fact only if that fact comes from the dossier.

## Plan
| When | Task | Owner |
|---|---|---|
| 18:00–19:30 | Merge 6B and the verdict fix. Fix hyphenated number words in verdict parsing. Run one capped paid verdict check (≤$0.20) and audit its claims by hand. QA in both data modes, with no console errors on `/screen`. | Codex builds, Claude reviews |
| 19:00–21:00 | A3 trace panel from cached `agent_steps`, plus a test | Codex (Claude takes over if Codex hits its rate limit) |
| 19:30–21:00 | Admin demo preset; verify A5, A6 and A7, with an eval case for A6 | Claude |
| 21:00–22:30 | Playtest with 2–3 people who haven't seen the game. Test on iPhone and Android, the projector, sound, and a phone hotspot. Fix the worst comprehension or pacing problem. | Humans; agents fix |
| 22:30–00:00 | Two live rehearsals (cap $0.30). Final cross-review. | Both |
| **00:00** | **Feature freeze** | |
| 00:00–02:30 | README (what is real, cached or simulated; Bedrock IDs; known limits), Devpost entry, sponsor cards. Run `pytest`, `pnpm -r test` and `evals --quick`. | Claude + humans |
| 02:30–04:30 | Five fixture rounds. Record the 2-minute video and five screenshots: skyline, challenge, verdict, light-up, trace. Also record an offline backup, clearly labeled. | Humans |
| 04:30–06:00 | Submit. Keep 6–8am for emergencies only. At least one presenter sleeps. | |

**Budget:** Keep at least $1.00 for judging. Final validation spend tops out around $0.50 in total.

## Demo (2 minutes)
- **0:00** Dark skyline and QR code: "every dark window is a floor CoStar lists as available, with nobody on record." Never say "vacant."
- **0:15** The judge wakes Esperson and the intro plays.
- **0:30** Pitch. Typed input is the fallback on a noisy floor.
- **0:50** A challenge that cites a fact.
- **1:05** Revision and verdict.
- **1:30** Everyone charges together: floors light up, the song plays, and the concept card appears.
- **1:50** Trace panel and close.

Teammate two joins in advance.

## Track-specific endings
- **Entertainment (main track):** laughter, the pitch getting revised, and the whole room powering the skyline together.
- **CoStar:** hover fact, then aerial caption, then Matterport, then the challenge that cites one of them. "Three layers, one address, one decision." Keep listed availability, recorded occupancy and simulation clearly separate.
- **Amazon:** real Bedrock negotiation, server-side validation, the spend guard, and graceful fallbacks.
- **LangChain:** walk through plan, subagents and files in the trace. Say plainly that prep was cached and the trace is your own panel built from real deepagents steps.
- **Photon:** don't enter, and don't mention iMessage.

**Safe mode at the venue:** run everything locally, bring a hotspot, and practice switching to `DATA_MODE=fixtures` and doing a host reset. If a verdict falls back in front of judges, that's acceptable as long as the light-up still lands.

## Aggregate ranking

Response A (1.33), Response C (1.67), Response B (3.00)


Identities (revealed after ranking): Response A = codex, Response B = claude-opus, Response C = grok


## Stage 1 answers

### codex
**Build one convincing Esperson round, expose its real research, and spend the rest on reliability and presentation. Cut additional buildings and Photon.** Four credible tracks beat five fragile integrations.

The repository supports this choice: Esperson’s original prep cost **$1.62**, almost your remaining budget; `messaging/index.ts` is empty; music and much of neighborhood needs already exist. More urgently, the latest paid check had **2/2 verdict fallbacks**. PR #23 addresses number matching, but the log shows no subsequent paid verification.

Prioritize the remaining hours as follows:

| Time | Priority and deliverable |
|---|---|
| **6–8pm** | **Finish Phase 6 and pass P0 gates.** Merge media and verdict fixes; cross-review with Codex/Claude. Verify grounded challenge → meaningful revision → validated verdict, two-phone charging, immediate lights, audible payoff, reconnect/reset and readable projector text. Run a small, capped paid verdict check and manually audit its claims. No Phase 7 until P0 passes. |
| **8–9:30pm** | **A3: research trace.** Show the existing cached Esperson run: `write_todos`, three named subagents, filesystem operations, validated output artifacts, then the resulting constraints. Label it “recorded prep run”; distinguish live negotiation. Local `agent_steps.json` already exists. Do not regenerate research or fabricate missing plan content. |
| **9:30–10:30pm** | **Close existing A4–A7 acceptance gaps.** Verify synchronized song layers; needs update plus next-intro mention; a challenge citing an actual spatial fact; and A7’s “game concept” label. These are integration checks and small fixes, not four new builds. Finish the 20-second pitch/15-second negotiation demo preset, currently absent from the admin UI. |
| **10:30pm–midnight** | **Playtest and device QA.** Three unfamiliar players, iPhone/Android, venue Wi-Fi/hotspot, projector and sound. Fix the biggest comprehension or pacing issue. A8 gets calibration/lag fixes only if observed; retain tap selection. |
| **Midnight–2am** | Record the two-minute video, take screenshots, write README/Devpost and sponsor variants. Freeze features by midnight if possible; **2am is absolute**. |
| **2–4am** | Required tests/evals, five fixture rounds and three live rounds within budget; audit console errors, reset and failure fallbacks. Capture a clearly labeled offline backup. |
| **4–6am** | Upload, verify links and submit. Preserve 6–8am for submission emergencies; rest before 9:30 judging. |

**Cuts:** A1 additional buildings; A2 Photon; new voice providers; generated interiors; neighbor banter/memory; aiming redesign. Missing ElevenLabs is already handled by browser speech/subtitles. Missing LangSmith should not block a truthful local trace. Have a human spend at most 15 minutes checking sponsor eligibility and obtaining a LangSmith key; do not make new integrations depend on it.

**Two-minute demo:** hook/QR 0–15s; wake and intro 15–30; pitch 30–50; sourced challenge 50–65; revision/verdict 65–90; collective charge, lights and music 90–110; trace/closing 110–120. Prejoin teammate two; never predetermine the winner.

Sponsor emphasis:

- **Entertainment:** laughter, revision and everyone powering the skyline.
- **CoStar:** show precisely how sourced floor data changes the decision; distinguish availability, recorded occupancy and simulation.
- **Amazon:** real Bedrock negotiation, server validation and graceful failures.
- **LangChain:** actual planning, delegation and artifacts; disclose cached prep.
- **Photon:** skip without working messaging.

Reserve roughly **$1 for judging**, cap final paid validation around **$0.50**, and leave the remainder as headroom. Use Codex and Claude on separate implementation/review lanes; keep a human on playtests, recording and submission.

### claude-opus
**My recommendation:** build three cheap features that get you onto more tracks (A3, A5, A6), do at most one more building, make Photon a go/no-go decision at 9pm, and cut A8. Freeze features at 00:30. After that, only rehearsal, the video and submission. A complete, reliable round on a projector will win more than any extra feature.

## Where things stand
- **A4 (city song)** shipped in 6A. **A7 (concept card)** is mostly covered by the running 6B task; just confirm it carries the "game concept" label.
- **A5 (city needs)** is half built: `server/app/city.py` already has `most_needed`, `needs_bonus` and `analyst_line`.
- **A3 (trace panel)** doesn't exist yet: nothing under `apps/web/src` mentions a trace. That is a gap for LangChain (the whole pitch), CoStar (30% of its score is agentic depth) and Amazon (agentic behavior).
- **Bedrock:** ~$1.80 left. Keep about $1.00 for live rehearsals and the judged rounds.

## Plan (from 18:00)
| # | When | What | Who | Est. |
|---|---|---|---|---|
| 1 | 18:00–19:30 | Merge 6B and the verdict fix. Confirm the `/admin` demo-round preset (20 s pitch, 15 s negotiate). Run the QA sweep in both data modes with no console errors on `/screen`. | Codex + Claude review | 1.5 h |
| 2 | 19:00–21:30 | **A3 trace panel.** Show the real recorded prep run for Esperson: todo plan, files written, subagent calls, tool calls, Bedrock model IDs, and the game action that resulted. Label it "recorded prep run." No new Bedrock spend, and it stands in for the missing LangSmith key. | Codex | 2.5 h |
| 3 | 19:00–20:30 | **A5.** Add an on-screen "City needs (game simulation)" meter, mention the most-needed category in the next intro, and add `city.py` unit tests. Strengthens the Entertainment "shared progression" story. | Claude | 1.5 h |
| 4 | 20:30–21:30 | **A6.** Make sure at least one challenge cites a Matterport or Vexcel spatial fact from the cached dossier, plus an eval case. The CoStar demo ("three layers, one address") depends on this. | Claude | 1 h |
| 5 | 21:00 | **Photon go/no-go.** Ask the Photon booth for keys now. If you have them by 21:00, give Codex a 3 h A2 task, kept off the main demo path. If not, cut A2 and don't enter Photon. Ask the ElevenLabs and LangSmith booths for keys too; the browser voice fallback stays as the safety net. | Human | — |
| 6 | 21:30–23:00 | **A1, one building only** (Wells Fargo Plaza, already the fallback). Hard spend cap $0.40, and it must pass the grounding eval. If it fails or goes over the cap, ship Esperson alone. Skip a third building. | Codex | 1.5 h |
| 7 | 23:00–00:30 | Final reviews (Codex high + Claude Opus), QA sweep, bug fixes. | both | 1.5 h |
| 8 | **00:30** | **Feature freeze.** | | |
| 9 | 00:30–02:30 | 5 clean rounds in fixtures mode and 2–3 live. Time the demo round to under 2 min. README: run steps, architecture diagram, sponsor tech, what is real vs cached vs simulated, known limits. | humans + Claude for docs | 2 h |
| 10 | 02:30–04:30 | Record the video (under 2 min, from a real round) and the five screenshots (skyline, challenge card, verdict, light-up, trace panel). Write the Devpost entry. | humans | 2 h |
| 11 | 04:30–06:00 | Buffer, then submit at 06:00. At least one presenter sleeps 03:00–08:30. | | |

## Cut
- **A8 precise aiming:** cut. Device lag is a risk you can't test properly in time, and the touch trackpad plus the "Wake" list already cover it.
- **A2 Photon:** cut if there are no keys by 21:00.
- **A third building, S-tier work, any new paid service:** cut.

## Demo prep
- **Main track (Entertainment):** follow the PRD script. A teammate is already player 2. The judge types or speaks the pitch, and typed input is the fallback on a noisy floor. The light-up moment is the climax, so rehearse it until it is reliable.
- **Last-30-seconds variants**, one card each:
  - **CoStar:** hover facts → Vexcel caption → Matterport → challenge citing that fact. Close with "three layers, one address, one decision."
  - **LangChain:** open the trace panel and walk through plan → files → subagents.
  - **Amazon:** the Bedrock model IDs in the trace, the spend guard, and two real uses: city engagement sessions and leasing events.
- **Only claim what works.** With no Photon, don't mention iMessage. With no LangSmith, say "the trace is our own panel built from real deepagent steps."
- **Safe mode at the venue:** run locally, bring a phone hotspot, and know how to switch to `DATA_MODE=fixtures` from `/admin` in one step if Bedrock or Wi-Fi fails. Practice the host reset.

## Risks
- **Codex usage limits** have hit three times today. Give A3 to Codex first. If Codex gets limited, Claude takes over that task and the review.
- **Budget:** each live round costs roughly $0.07–0.12, and the eval sub-cap reserves 6–7× the real cost per call. Do rehearsals in fixtures mode.
- **Hyphenated number words** in verdicts are still unparsed. That's a small cause of fallbacks, so fix it in step 7 only if it shows up in QA.

### grok
I'll read the PRD, handoff, overnight log, and the Phase 7 scope so the remaining-hours plan is grounded in what's actually done.The docs say Phases 0–5 are done and Phase 6 is almost there. I'll check which A1–A8 items already exist in the code before recommending what to spend the night on.Finish the demo, then stop building. Phases 0–5 already cover the three moments that win. Of A1–A8, only the trace panel is worth new code. A second building or a Photon sidecar would spend the budget and the night on something you cannot show.

**Already done. Do not rebuild.** A4 (city song, PR #22) and A5 (needs, bonus, analyst line in `city.py`) meet their checks. A6 is close: Esperson already has Vexcel facts. A7 is inside the still-open Phase 6B (ConceptCard, light-up, intro media). Only Esperson has a real persona (`server/fixtures/personas/233953.json`). There is no TracePanel, no demo-round preset (pitch is still 45s), no README.

**Cut**

*   A1, two more buildings. Esperson’s full prep was $1.62. About $1.80 of Bedrock remains. One more prep leaves nothing for Sunday live rounds. Wake only Esperson in the demo so a judge cannot open Wells Fargo’s fake persona.
*   A2, Photon, and that prize track. No keys. A sidecar that cannot text is a broken sponsor claim. Enter only tracks that work.
*   A8, precise aiming. Tap and the wake list already satisfy the P0 path. The PRD cut order drops this first.
*   LangSmith, ElevenLabs, Polly, and every P2 item (neighbor banter, secret roles, AI interiors, second city). Browser speech is enough. Do not regenerate Esperson.

**Plan**

| When | What | Time |
|---|---|---|
| 6:00–7:30 | Merge 6B and the hyphenated-number verdict fix. One QA sweep. Fix only demo blockers: unreadable type, light-up that does not read from 3 m, a round that cannot finish on tap. | 1.5h |
| 7:30–9:00 | A3: a `T` panel that replays Esperson’s cached `agent_steps` (plan, files, `property_scout`, `spatial_scout`, `persona_writer`, tool, timing). Label it a local trace. This is the LangChain ticket. | 1.5h |
| 9:00–10:00 | Admin demo preset: 20s pitch, 15s negotiate, Esperson-only wake, skip and reset. One-page speaker card. | 1h |
| 10:00–11:30 | Two live rehearsals, hard cap $0.30. Script the pitch so the challenge cites a known fact (floor 6, 31,503 sq ft, or the 1941 completion). If the model will not cite a Vexcel fact, put one in the templated fallback. Confirm the Matterport iframe fails over to the caption card. | 1.5h |
| 11:30–1:30 | Freeze features. README (real vs cached vs simulated, Bedrock IDs, known limits), Devpost, five screenshots, 2-minute video. | 2h |
| 1:30–5:00 | Five fixture rounds, at most two more live rounds. Time the script. Write the last-30-second sponsor cards. | 3.5h |
| 5:00–6:00 | Submit. 6:00–8:00 is only for a failed upload or a demo-breaking bug. | 1h |

Reserve at least $1.40 for Sunday. Each live round has been about $0.07–$0.12, and judging will want several.

**Two-minute demo.** 0:00 dark skyline, “every dark window is a floor CoStar lists as available, with nobody on record.” 0:25 judge taps Esperson; let the intro play. 0:40 scripted pitch. 1:00 challenge with a cited fact. 1:15 revision and “I’m in.” 1:30 flick, floors, song, concept card labeled game concept. 1:45 trace panel.

Sponsor endings, same product: Entertainment — “Shark Tank, but the investor is an empty skyscraper.” CoStar (lead track) — hover fact, aerial caption, Matterport, “three layers, one address.” Amazon — Bedrock model IDs in the trace, plus the leasing-event use case in the README. LangChain — name the three subagents and the files they wrote. Skip Photon.

The live risk is still a verdict fallback, which has already happened twice. Persona-voiced fallbacks are acceptable if the light-up always lands. Codex has been rate-limited all day, so give it QA and the trace panel only. Claude writes the demo preset and the submission.


## Stage 2 peer reviews

### codex
**Response A:** Best overall: it respects the Phase 6 gate, prioritizes the unresolved verdict failures, and concentrates scarce time and money on one convincing round plus a truthful research trace. Its acceptance checks, sponsor framing, and early submission buffer make it the most actionable plan. The main weakness is budget precision: paid validation and three live rounds should share one explicit spending cap.

**Response B:** Useful task ownership, time estimates, and submission preparation, but it overcommits the two-agent team by leaving both Photon and another building in scope. A $0.40 building-prep target is unsupported by the recorded $1.62 Esperson run, and the proposed Photon work overlaps Codex’s other assignments. It also understates A5’s implementation: needs bars, simulation labeling, and the next-intro analyst line already exist.

**Response C:** Strong scope discipline: one building, the trace panel, demo controls, and rehearsal fit the actual constraints, and its assessment of existing A5 functionality is more accurate than B’s. However, saying persona fallbacks are acceptable “if the light-up always lands” underweights the meaningful negotiation and validated verdict that distinguish the product. Its instruction to insert a spatial fact into a fallback also needs an explicit dossier citation and validation requirement; the opening process narration adds little.

FINAL RANKING:
1. Response A
2. Response C
3. Response B

### claude-opus
**Response A** lays out a disciplined, reliability-first plan that is grounded in the repo. It cites the $1.62 Esperson prep cost, the empty messaging module, the 2/2 verdict fallbacks and the missing demo preset. It sensibly treats A4–A7 as integration checks rather than new builds, and it cuts A1 and A2 for the right reasons. Its weaknesses are a late, soft feature freeze (it says midnight, then "2am absolute") and a schedule that is somewhat generic. It also spends little time on concrete demo scripting or on how a challenge will reliably cite a fact.

**Response B** is well organized: it assigns each task to an agent, plans around Codex rate limits, and correctly finds the missing trace panel and the half-built `city.py`. Its biggest problem is proposing a Wells Fargo prep with a $0.40 cap. The logged Esperson prep cost $1.62, so that cap is unrealistic and would put the Sunday budget for live rounds at risk. Keeping Photon open until a 9pm go/no-go also adds risk at the moment focus matters most. Its sponsor variants and safe-mode advice are useful.

**Response C** is the most grounded and decisive. I checked its claims against the repo and they hold:
- There is no trace UI.
- `city.py` has `most_needed`, `needs_bonus` and `analyst_line`.
- Only the 233953 (Esperson) persona exists.
- The prep cost $1.62.

It adds sharp, practical points the other two missed: wake only Esperson so judges can't open a fake persona, reserve $1.40 or more for Sunday, and script the pitch around known facts so the challenge cites real data. It may overstate A5 as fully done, since the on-screen meter and the mention in the next intro aren't verified. It also leaves some narration ("I'll read the PRD…") at the top. Overall it is the most useful plan.

FINAL RANKING:
1. Response C
2. Response A
3. Response B

### grok
I'll check the handoff, overnight log, and PRD against the code so the ranking is based on what's actually left, not just how the plans sound.**Response A** is the plan to run. It holds Phase 7 until a small paid check confirms the verdict path, because the last paid run was 2/2 fallbacks and PR #23 has no paid follow-up. One Esperson round, a labeled replay of the cached prep, and about $1 left for Sunday match the ledger ($2.70 of a $4.50 cap), the $1.62 Esperson prep, the empty Photon sidecar, and the still-45-second pitch. It overstates the A4–A7 leftovers: the city song, needs meters, and most-needed intro line are already in the tree, and `agent_steps.json` has the three subagents and file tools with no `write_todos` event. It also leaves Wells Fargo’s fake persona wakeable and does not plan for the Codex limits that already hit three times.

**Response B** is the most precise on cost and ops. Live rounds at about $0.07–$0.12, the 6–7× eval reservation, the hyphenated-number residual, and a Codex-limit handoff are all in the log, and the 00:30 freeze plus the PRD demo script are sound. The build list spends those hours on the wrong work. A5’s meter, analyst line, and `city.py` tests already exist, so the 1.5-hour task rebuilds them. A second building under a $0.40 cap conflicts with the $1.62 prep that already forced Wells Fargo to be skipped, and a 3-hour Photon sidecar after 21:00 starts from an empty `messaging/index.ts`.

**Response C** reads the repo best. Only `233953` has a real persona, there is no trace panel, README, or demo preset, A5 already meets its check, and another full prep would consume the remaining ~$1.80. Esperson-only wake, the early freeze, a ~$1.40 Sunday reserve, and limiting Codex to QA plus the trace panel fit the night so far. The PRD cut order drops extra buildings first and precise aiming last, and the opening block writes a hyphen parser before any paid verdict check. It also skips the required Codex-high plus Claude-Opus review and a stranger playtest.

FINAL RANKING:
1. Response A
2. Response C
3. Response B
