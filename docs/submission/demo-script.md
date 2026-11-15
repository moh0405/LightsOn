# Lights On — judge demo playbook

**The line to remember:** “Shark Tank, but the investor is a dark skyscraper.”

**The experience to deliver:** the judge sees a real building challenge an idea, watches a player respond to that challenge, then helps light the building up. Keep the negotiation and the payoff. Explain the architecture after the audience has seen why it matters.

This is a **two-minute target**, with an optional technical follow-up. Live generation and speech make exact wall-clock timing variable. Follow the phase displayed on `/screen`; the cues below are authoritative, the elapsed times are estimates. Do not promise a particular challenge, winner or score.

## The strongest presentation setup

- **Presenter:** tells the story and points to the evidence. Stops speaking whenever the building speaks.
- **Operator / player two:** submits the competing pitch, watches phase changes and keeps `/admin` ready off the shared display.
- **Judge / player one:** uses a phone already joined to the room, or scans before the timed presentation. Offer a prepared phone if joining takes time. Let them choose a concept; offer the example below if they prefer.
- **Solo presenter:** join two separate phones/browser profiles before starting. Submit both pitches yourself; hand the judge a joined phone for the charging moment. Say that you are demonstrating two players.

The game has four player slots. Use two for the core demo: the contrast between proposals is easy to follow and the building has fewer challenges to speak.

## Preflight — finish before the judge's clock starts

1. Open `/screen` in Chrome on a 1920 × 1080 display. Use the current launcher URL, not a QR from a screenshot. Keep the phones awake.
2. Confirm `/admin` shows **Demo preset ON** and **data mode: kit** for the real-data presentation. The live launcher is `./scripts/demo.sh`; it sets `AGENT_MODE=live`. Data mode alone does not prove the model is live.
3. Click **Start audio** on the shared display. Check that the building and your voice can both be heard without shouting over each other.
4. In `/admin`, connect to the screen's room code and enter the host PIN. **Reset room**, then join both players again. Confirm both names and **EXPLORE** on screen. Reset room clears players and city progress; Reset round does not.
5. Prepare player one's pitch and player two's pitch from the next section. Keep the revision options available, but select/edit a revision only after reading the actual counteroffer.
6. Choose **Esperson** for this presentation. The demo defaults also allow Wells Fargo Plaza; they do not force Esperson. If launching a dedicated presentation server, `DEMO_BUILDING_IDS=233953 ./scripts/demo.sh` restricts the choice.
7. Before judging, check cached aerial images, the Matterport tour and the recorded trace. Close the tour/trace before the timed round. Their availability on a prepared machine is not guaranteed on a fresh clone.
8. Have a downloaded recording of a successful round ready as a fallback. Rehearse controls with `./scripts/demo.sh --fixtures --no-tunnel` on a separate setup or after stopping the live launcher. Fixture rehearsal makes no paid model calls; live takes consume the configured Bedrock budget.

Do not reset or restart a shared demo server while someone else is using it.

## Prepared pitches — proposals, not claims about the building

Each field accepts **280 characters**. Submit early in the phase; wait for **Sent**. Typing/pasting is the dependable stage path. Dictation is optional after a real-phone check.

**Player one — a concrete, social entertainment idea:**

```text
A late-night board-game cafe on a listed available floor, with paid tables and free community nights. I want it to bring people together after work. What would make you say yes?
```

**Player two — a credible competing idea:**

```text
A shared training and coworking hub on a listed available floor, with flexible desks, paid workshops and free evening sessions for local small businesses.
```

Both are legitimate proposals. Neither is a deliberately broken opponent, and neither is guaranteed to win. The judge can substitute their own idea.

**During CHALLENGE, identify the actual request.** Is the building asking about footprint, parking, who will use the space, or how the idea supports itself? In NEGOTIATE, answer that request. These are short starting points, not a script to paste regardless of the challenge:

| If the counteroffer asks about… | Player one's revision |
| --- | --- |
| Space / layout | `I will start with a small pilot inside the listed floor area you cited, using movable game tables and a separate circulation area. I will scale the layout to the documented space, with paid tables funding free community nights.` |
| Parking / arrivals | `I will use reservations and staggered evening sessions, encourage transit and walking, and avoid relying on new parking. Paid tables will support free community nights. I will keep the pilot within a listed available floor.` |
| Audience / revenue / evening activity | `The first audience is nearby workers after work and local board-game groups. Paid table reservations fund free community nights. I will start with a small pilot on a listed available floor and expand only if demand supports it.` |
| A different constraint | Write: `I will address [the actual request] by [a concrete change to the proposal].` Remove the brackets and answer what appeared on screen. Do not invent building measurements or capabilities. |

Player two may revise too. Do not claim the revision changed the winner unless the displayed evidence establishes that. The server retains each player's better validated submission; the point is the opportunity to respond, not a guaranteed comeback.

## The two-minute core — exact actions and speaking lines

**Start with both players joined.** Show the QR as part of the product; do not spend the whole opening on setup.

| Approximate elapsed time | Actual phase / action | Presenter says |
| --- | --- | --- |
| **0:00–0:10** | **EXPLORE.** Show the skyline and the joined phones. | **“What if the building judged your idea? This is Lights On: Shark Tank, but the investor is a dark skyscraper.”** |
| **0:10–0:15** | Briefly drag on the phone's **Drag to aim at the skyline** pad. Tap **Wake building Esperson**; the wake button selects it directly, so aiming is not a prerequisite. | **“This is real Houston office data. You pitch a new life for its dark floors.”** |
| **Next 8 seconds** | **INTRO.** Let the dive, aerial/tour and building introduction play. | **Silence.** Let the character make its entrance. |
| **Next 20 seconds** | **PITCH.** Both players paste/type, tap **Submit pitch**, and confirm **Sent**. Point to the two ideas on the screen. | **“We're proposing a board-game cafe. They're proposing a coworking hub. The building gets to push back.”** Then let the audience read. |
| **Generation + response window** | **CHALLENGE.** Listen to the building. Point to the evidence beneath the relevant card after its voice finishes. Operator identifies the request for the revision. | **“That challenge is tied to its building dossier. Now we have to answer it.”** If discussing a specific source, name the source actually displayed. |
| **Next 15 seconds** | **NEGOTIATE.** Read **Make your deal** on the phone, adapt the revision to the actual counteroffer, then tap **Send revision**. Confirm **Sent**. | **“It asked us about [actual request]. We're changing [actual part of our plan] to answer it.”** Replace both phrases with what just happened; do not read the brackets. |
| **Generation + verdict window** | **VERDICT.** Let the winner, reason and scorecard land. Point to the result without covering it. | **Silence during the verdict.** If time remains afterward: **“The model proposes; our server validates the result.”** |
| **As soon as it appears** | **POWER_UP.** Both players tap **Tap to charge** about once per second until 100%. Pass a joined phone to the judge if appropriate. | **“Even if your pitch lost, you help bring it to life. Tap with us.”** |
| **First seconds of REVIVED** | Watch the winning floors illuminate and the music change. Leave the tour and trace closed. | **Silence for the light-up.** Give the audience a moment to see it. |
| **During REVIVED / return to EXPLORE** | Point to the concept card and the labelled city simulation. Finish before it disappears, or continue the closing sentence over the skyline. | **“You compete for the pitch, but everyone shares the skyline. Real data gives the game its constraints. Your ideas give it its next chapter. Lights On.”** |

**Short on time?** Remove the source commentary and the post-verdict technical sentence. Keep the actual counteroffer, revision, verdict and light-up. Do not replace the ending with a rushed architecture lecture.

The city meter is a game simulation. “Reimagined” square footage is a game outcome; it is not space actually renovated or leased.

## The phone-sized cue card

> **HOOK:** What if the building judged your idea?<br>
> **WAKE:** Esperson → let it speak.<br>
> **PITCH:** Two ideas → Submit pitch → Sent.<br>
> **LISTEN:** Hear the counteroffer → point to evidence.<br>
> **REVISE:** Answer its actual request → Send revision → Sent.<br>
> **VERDICT:** Stop talking. Let the decision land.<br>
> **CHARGE:** Tap together, about once per second.<br>
> **LIGHTS:** Give the reveal a beat of silence.<br>
> **CLOSE:** You compete for the pitch, but everyone shares the skyline.

## If the judge gives you another minute

Ask: **“Would you like to see how the building researches itself, or look inside the real space?”**

**Research, about 25 seconds:** press **T** on the shared display.

> “Before play, we ran Esperson through a deepagents workflow on Amazon Bedrock. Three subagents handled property facts, spatial evidence and personality. This panel replays that recorded research. During the round, a separate live LangChain agent looks up dossier facts to negotiate. The server validates its proposed actions before changing the game.”

Close with **T** or **Escape**. Do not describe recorded prep as a live model call or imply all seven buildings received full deepagents research.

**Interior, about 15 seconds:** press **M** or **Walk inside**, show the real Matterport tour, then **Escape**. If no building is selected, wake/select the appropriate building only outside the timed core or use the host's **Walk inside** control for the intended building.

> “The character has a real address. This is its real interior tour, while Vexcel supplies the aerial context.”

Use a single [track-specific explanation](tracks.md) if the judge asks about a sponsor. Do not recite the entire stack.

## Answers worth rehearsing

| Judge asks | Answer |
| --- | --- |
| **Why AI?** | “Players can pitch ideas we didn't script. The building can challenge their reasoning and ask for a revision using its own dossier.” |
| **Why isn't this just a chatbot?** | “It's a shared game with competing pitches, constrained negotiation, a validated verdict and a cooperative physical payoff. The conversation changes what players do next.” |
| **Who would use it?** | “Our first audience is groups playing together on a shared screen. We could adapt it for facilitated classroom or city engagement sessions, where people explore ideas against documented constraints.” |
| **What's actually real?** | “CoStar supplies property and floor records, Vexcel supplies cached aerial evidence, and Matterport supplies the interior tour. Personalities, city needs and renovation concepts are game elements.” |
| **Can the AI make things up?** | “We check citations, numbers and units against the dossier, run claim checks and validate actions server-side. Unsupported answers can fall back. That reduces risk; it doesn't prove every sentence is perfect.” |
| **How is a pitch scored?** | “Data fit, neighborhood fit, creativity and charm, with the game's needs bonus included in the total. The scorecard shows the actual result; I don't choose the winner.” |
| **Is this a feasibility tool?** | “No. It's a game that invites exploration. A conversion would still require professional assessment beyond these records.” |
| **How would you grow it?** | “First prove people want another round, then research more buildings and test facilitated sessions with potential hosts. Those are next steps, not existing customers.” |
| **What was hardest?** | “Making evidence-grounded negotiation fit a live party game. We separated instant physical feedback from AI latency, built fallbacks and budgeted speech so the building doesn't talk over the light-up.” |

## Recovery without losing the story

| What happens | What to do / say |
| --- | --- |
| Judge cannot join quickly | Hand over an already joined phone. “You can use ours.” |
| Microphone or sensors fail | Type the pitch, select with the wake button, tap to charge. No permission troubleshooting during the core. |
| The model is still thinking | Let its normal timeout/fallback path finish. Say once: “It's checking the proposal against its dossier.” Do not repeat the line or promise a response time. |
| A step uses the offline judge | “This step is using our deterministic fallback with the same dossier.” Continue; don't present fallback dialogue as live generation. The trace can identify which path ran. |
| No pitch was submitted | Reset the round and submit early on the next attempt, if time permits. Otherwise use the saved recording, labelled as recorded. |
| Wrong phase / recoverable operator error | Use host controls only when the phase and consequence are understood. Never skip an unfinished challenge, negotiation or verdict just to hit a timestamp. A pending live verdict cannot be advanced by a host skip. |
| Charging reaches its deadline | The game can auto-complete the charge and labels that assistance. Do not claim the audience supplied all energy if it did not. |
| Network fails | Show the downloaded recording and say it is recorded. For the next session, stop the live launcher and use `./scripts/demo.sh --fixtures --no-tunnel` locally. For phones, establish working LAN access or a new HTTPS tunnel and rejoin; the old tunnel is not an offline route. |
| Aerial or tour unavailable | Keep the negotiation going with the map/subtitles fallback. Do not claim missing visuals were shown. |

## Verification basis

This script follows the current phase machine in `server/app/rooms.py`, phone labels in `apps/web/src/play/Explore.tsx` and `Round.tsx`, and the documented live rehearsal in `apps/web/e2e/visible-demo-run-report.md`.

INTRO is 8 seconds; demo PITCH is 20 seconds; NEGOTIATE is 15 seconds. CHALLENGE and VERDICT include variable live generation before their response timers, and speech handling can affect the presentation window. POWER_UP can complete early at 100%; REVIVED lasts 8 seconds. Do not use an old recording's timestamps as a fixed schedule for a new round.

A script/code review and automated UI tests do not establish fresh live-model quality, real-phone microphone reliability or audible stage timing. Rehearse once on the actual presentation hardware before judging, within the existing model budget.
