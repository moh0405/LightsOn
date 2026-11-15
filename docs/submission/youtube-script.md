# YouTube video script (under 2 minutes)

One take, one live Esperson round. The game's own timers set the pace, so the times below are approximate: follow the
**phase name shown at the top left of `/screen`**, not the clock.

## Links

| Page | Link | Device |
| --- | --- | --- |
| Projector | https://chassis-practical-peace-underground.trycloudflare.com/screen | Mac, Chrome, full screen. This is what you record. |
| Player | https://chassis-practical-peace-underground.trycloudflare.com/play (or scan the QR on the projector) | Phone 1 (you) and phone 2 (teammate, or a second phone) |
| Host | https://chassis-practical-peace-underground.trycloudflare.com/admin | Second Mac window or tab, off the recording. Needs the host PIN from `.env`. |

## Setup (do this before every take)

1. **Mac:** open `/screen` in Chrome, hard-reload (Cmd+Shift+R), make the window full screen, click **Start audio**.
2. **Mac sound:** speakers on, no headphones. The screen recorder's microphone picks up your voice and the building's
   voice from the speakers.
3. **Host:** open `/admin`, enter the PIN, press **Reset room**. The projector goes back to the dark skyline.
4. **Phones:** on both phones open the join link (scan the QR), enter a nickname and join. Both names appear under
   "Players" on the projector. **Join before you record**: the video starts with players already in.
5. **Phone 1, prepare the text** (the pitch timer is only 20 seconds). Copy these into your notes app so you can paste:
   - Pitch: `A late-night board-game cafe for downtown office workers, using one dark floor with paid tables and free community nights.`
   - Revision: `Start with one listed available floor only: a small member-supported board-game cafe with evening sessions and free community nights. No structural changes.`
6. **Phone 2, prepare a second pitch:**
   `A shared training and coworking hub for local small businesses, with evening workshops and flexible desks on one dark floor.`
7. **Start recording:** Cmd+Shift+5, "Record Entire Screen", Options: Microphone = MacBook/Mac microphone. Press Record.

## The take

| Time | Phase on `/screen` | What you do | What you say |
| --- | --- | --- | --- |
| 0:00 | EXPLORE (dark skyline, QR visible) | Nothing. Let the skyline orbit. | "This is Lights On: Shark Tank, but the investor is a dark skyscraper." |
| 0:05 | EXPLORE | Phone 1: drag inside the **Drag to aim at the skyline** box until the pointer sits on Esperson. Its card appears on the left of the projector. | "Every dark window is a real floor CoStar lists as available, with nobody on record, in downtown Houston." |
| 0:12 | EXPLORE to INTRO | Phone 1: tap **Wake building Esperson**. The camera dives to the tower. | "You're the entrepreneur. The building is the investor. Wake it up." |
| 0:14 | INTRO (8 s) | Hands off. The aerial photo, the Matterport lobby tour and the building's voice play. | Stay silent. Let the building talk. |
| 0:22 | PITCH (20 s) | Phone 1: paste the pitch, tap **Submit pitch**. Phone 2: paste the second pitch, tap **Submit pitch**. Both appear on the projector. | "Pitch it anything to do with its dark floors." |
| 0:42 | CHALLENGE (about 13 s) | Hands off. A challenge card appears for each player with a cited fact. The building speaks them. | After the voice: "That number came straight from CoStar. It's pushing back with its own data." |
| 0:55 | NEGOTIATE (15 s) | Phone 1: paste the revision, tap **Send revision**. Phone 2 can leave its pitch as it is. | "You get one revision. Answer the counteroffer." |
| 1:10 | VERDICT (about 17 s) | Hands off. The score card appears and the building names the winner. | Stay silent until the voice finishes, then: "The model proposes, our server checks every number." |
| 1:27 | POWER_UP (10 s) | Both phones: tap the big **Tap to charge** button fast until the bar on the projector reaches 100%. | "Now power it up, everyone together!" |
| 1:37 | REVIVED (8 s) | Hands off. The winning floors light up in the winner's colour, then the concept card and city meter appear. | As it lights: "Your city needs you." |
| 1:45 | After the round | Mac: press **T** on `/screen` to open the trace panel. | "Each building researched itself with a deep agent on Bedrock, using CoStar, Vexcel and Matterport data. CoStar tells us what's empty. Lights On lets everyone imagine what it could become." |
| 1:57 | | Stop recording (Cmd+Ctrl+Esc, or the stop button in the menu bar). | |

## If something goes wrong mid-take

| Problem | Fix |
| --- | --- |
| A phase hangs | `/admin`: **Skip phase**. Keep talking. |
| The pitch timer runs out before you send | Stop, Reset room, start a new take. Paste faster, or have the text on the clipboard before you tap Wake. |
| "Hold to talk" hears nothing | Type or paste. Typing always works. |
| The verdict falls back to the offline judge | Keep going. The light-up still happens. |
| The room is full or shows old players | `/admin`: **Reset room**. |
| The link shows an error page | Tell the coordinator: the server or tunnel needs a restart. |

## Rules

- Never say "vacant". Say "dark" or "listed as available with nobody on record".
- Do not mention Photon or iMessage (that track is not entered).
- Do not promise a winner before the verdict: the outcome is real.
- Each take is one live round and costs about $0.07 to $0.11 of the Bedrock budget. Keep it to a few takes.

## After recording

1. Trim the start and end in QuickTime (Cmd+T) so the video is under 2:00.
2. Upload to YouTube as **Unlisted**, title "Lights On: HackPrinceton Fall 2026".
3. Paste the YouTube link into the Devpost form (text in `docs/submission/devpost.md`), tracks: Entertainment, CoStar,
   Amazon, LangChain.
4. Reset room on `/admin` before judging.

## Optional, only if you are under time

After REVIVED, press **M** on `/screen` for the Matterport walk-in (leave it 3 to 4 seconds, Escape to close) before
pressing **T**. This adds about 6 seconds, so cut the line at 1:10 to make room.
