# Tonight's human test (30 minutes)

Goal: one person runs the full 2-minute demo round on a laptop or projector with 2 to 4 real phones, while
everyone else watches and writes down anything that breaks. Do a zero-cost rehearsal first, then one live round.

## What you need

- Laptop, ideally on the projector at its real resolution. Make sure the room can hear the laptop speakers.
- 2 to 4 phones, at least one iPhone (Safari) and one Android (Chrome).
- The **main checkout** of the repo (it has `.env`, `data/costar/index.sqlite` and the Vexcel media; worktrees don't).
- `cloudflared` installed (`brew install cloudflared`), and `uv` and `pnpm install` done.
- A phone hotspot as a backup network.

## Setup (5 min)

1. `git pull origin main`.
2. Rehearsal (free, no Bedrock): `./scripts/demo.sh --fixtures`
   Live round (spends a few cents of Bedrock per round; the spend cap in `.env` still applies): `./scripts/demo.sh`
   Want to see what it will do without starting anything? Add `--dry-run`.
3. The preflight prints `ok` / `MISSING` for each key **name** (never the value). Fix anything marked `MISSING`, or
   use `--fixtures`.
4. When it prints **LIGHTS ON IS UP**, open the `screen` URL on the laptop and make it fullscreen. Open `admin`
   in a second tab and enter `HOST_PIN` from `.env`.
5. Click **Start audio** in the screen header. The browser blocks sound until you click it.
6. Check that the QR code on `/screen` points to the `https://…trycloudflare.com/play` URL, not localhost.

## The 2-minute demo path (run it 2 to 3 times, ~10 min)

Time it with a phone stopwatch. In `DEMO_MODE=1`: pitch is 20 s, negotiate is 15 s, and only the Esperson can be woken.

| Step | Do | Check |
| --- | --- | --- |
| 1. Dark skyline | Leave `/screen` idle for 10 s | Dark windows are visible; no error toasts |
| 2. Join | Every phone scans the QR | Each player shows up on screen within ~2 s; the nickname shows |
| 3. Wake | One phone aims or taps the Esperson | Hover and select respond instantly; the intro plays with **subtitles**; aerial / tour media or a labelled fallback |
| 4. Pitch | One phone holds to talk, one types | Both pitches show as bubbles; typing always works |
| 5. Challenge | Wait | Each pitch gets a challenge that names a real fact (sq ft, floors, parking), with a counteroffer, in **≤ ~5 s** |
| 6. Revise | At least one phone sends a revision | The revision shows; the timer doesn't stall |
| 7. Verdict | Wait | The winner is named with a reason; no "candidate_1" or raw IDs in the text |
| 8. Power up | **Everyone flicks their phone up**, or taps | Android **vibrates** on each charge; the energy bar fills on phone and screen; floors light **bottom to top** and are clearly visible (not hidden behind another tower); a new song layer starts; the concept card says "Game concept, not a real renovation" |
| 9. Trace | Press **T** on `/screen` | "Recorded prep run" panel: subagents, files, model IDs. Press T again to close |

Listen for: the building's voice (browser speech) and the subtitles matching it, the city song starting after
Start audio, and the light-up sound. Watch for: text readable from 3 m, nothing cut off with 4 players, and the
word "vacant" never appearing anywhere.

## Host controls and recovery (5 min)

- `/admin` → **Skip phase** (move on if a phase hangs), **Reset round** (same players, new round), **Reset room**
  (everyone rejoins). Try each once.
- Reload one phone mid-round: it should rejoin the same round.
- Turn motion off, or deny the permission on iPhone: tap selection and **Tap to charge** must still work.
- **Fallback to fixtures:** Ctrl-C, then `./scripts/demo.sh --fixtures`. Phones must rescan, because the tunnel URL
  changes on every start. Use this if Bedrock or the network misbehaves in front of judges.
- Hotspot test: switch the laptop to the hotspot, restart the script, and play one round.

## Reporting a bug fast

Paste this into Claude Code in the repo (one bug per paste):

```
BUG (TEST-TONIGHT step N): <what you did>
Expected: <what should happen>
Saw: <what happened>
Device: <iPhone Safari / Android Chrome / laptop Chrome>, mode: <fixtures|live>
Console/log: <paste the red console line or the last lines the script printed, if any>
```

A screenshot or a 10-second phone video helps. Never paste `.env` contents or keys.

## Done when

- [ ] 3 people joined without help
- [ ] One full round in fixtures and one in live, each under 2 minutes
- [ ] Flick + vibrate worked on Android; tap-to-charge worked on iPhone
- [ ] Light-up visible from the back of the room; audio audible
- [ ] Skip, reset round and reset room all work
- [ ] Bugs pasted into Claude Code

## Note: demo mode runs out after 4 rounds
In `DEMO_MODE=1` only Esperson can be woken, and its dark floors are used up after about 4 rounds. Before the next run (and before judging) open `/admin` and press **Reset room** to bring every floor back.
