# Demo-first scope (user decision, Sun Nov 15 ~04:30)

We are NOT finishing the whole product. We are making the 2-minute demo flawless. Anything outside the demo path is cut
or left as is.

## The demo path (must be perfect)
Projector `/screen` at 1920x1080 in Chrome, 2 phones on `/play`, host on `/admin`, building = **Esperson (233953)**,
`DEMO_MODE=1`, live Bedrock agent with fixtures/fake fallback. Script: docs/submission/demo-script.md.
1. Dark skyline looks good; QR join works.
2. Aim/tap selects Esperson with a clear, smooth highlight; Wake.
3. Smooth dive; whole building framed; intro: aerial, Matterport lobby tour visible (autoplay, stays), subtitles + voice
   start promptly, no lag, no cut-off.
4. Typed pitch -> grounded, knowledgeable challenge spoken promptly -> revision -> verdict + score card.
5. Tap/flick power-up -> light-up clearly visible -> concept card -> city meter.
6. `M` walk-in tour, `T` trace panel work on the projector.
7. Host: Reset room works; zero console errors; never "vacant", no ids, no contacts.

## Explicitly out of scope now
Phone-width or 1280x720 projector layouts, trace panel on phones, other buildings beyond "does not crash", late-joiner
edge cases, new features, refactors, extra tests beyond one regression per fix.
