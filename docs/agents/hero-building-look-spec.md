# Task: make the in-round building view look good (user's top complaint, demo path, ~45 minutes)
Read CLAUDE.md and docs/demo-scope.md. Branch visual/hero-building from origin/main. Setup: symlink
/Users/momossss/Documents/GitHub/LightsOn/data, .env and apps/web/public/media;
PREP_TRACE_DIR=/Users/momossss/Documents/GitHub/LightsOn/server/cache/prep. Ports LO_E2E_API_PORT=22021 LO_E2E_WEB_PORT=19091.
All test browsers silent (apps/web/e2e/silence.ts). Edit only apps/web/src/screen/City.tsx, apps/web/src/screen/skyline.ts
(+ its test), screen CSS, and one e2e spec. No server, model, event or command changes. No new heavy dependency unless it
is clearly the fastest route and the bundle still builds.
Problem (user screenshot, PITCH phase, Esperson woken, /screen 1920x1080): the woken tower is a muddy stack of
translucent MapLibre fill-extrusions. The 129-vertex footprint makes ragged, wavy facades; floors, halos, window bands and
faded copies overlap so colours blend into brown-grey; the roof is a shapeless blob; neighbours are flat grey boxes that
crowd and overlap the hero; nothing reads as a building. It looks broken on a projector.
Goal: from Wake until the round ends (INTRO..REVIVED) the selected building is a crisp, deliberate, good-looking hero
object, and the light-up is the best-looking moment of the demo. Judge by screenshots, not by code. Suggested direction
(you may do better):
1. Clean display geometry for the hero only: simplify/regularise the footprint for rendering (e.g. Douglas-Peucker then
   snap to its dominant axes, or oriented bounding shape when the result is still ragged). Keep real floor count,
   base/height and floor status from the data; this is display geometry only, never new facts.
2. Readable floors: opaque slabs with a thin dark reveal between floors, one clear colour per status (dark / partial /
   occupied / unknown, same legend as now), no stacked translucent duplicates, no z-fighting. A clean parapet/roof cap.
3. Facade: evenly spaced window columns or bands that read as glass; lit floors are warm and clearly emissive with a
   soft glow; dark floors are visibly dark but still have form (edge highlights).
4. Staging: neighbours recede (much darker, lower contrast, the ones between camera and hero faded or hidden), ground
   plane and fog give depth, camera pitch/bearing shows two facades and the whole tower with margin; subtle slow orbit
   is welcome if it stays 60 fps.
5. Light-up (REVIVED): the winning floors turn on floor by floor in the winner's colour, unmistakable from across a room.
Constraints: pointer, hover and charge feedback stay immediate and local; whole tower stays framed (existing camera
checks must still pass); never the word "vacant"; no ids or contacts on screen; works with DATA_MODE=kit and fixtures;
60 fps target on a real GPU (measure rAF fps on skyline, dive and light-up in headed real Chrome if available, report).
The EXPLORE skyline must not get worse; improving the other towers the same way is welcome only if it is free.
Evidence: before/after 1920x1080 screenshots of Esperson at INTRO end, PITCH, CHALLENGE and REVIVED in
apps/web/e2e/screenshots/hero/ (commit them), and look at them yourself critically before reporting; iterate until you
would be proud to project it. Gates: pnpm -r test, pnpm --dir apps/web build, the existing camera/light-up e2e specs.
Small commits, push after each. PR to main, label agent:claude, footer "🤖 Generated with [Claude Code](https://claude.com/claude-code)".
Push a first visible improvement within 20 minutes (the coordinator may merge it early), full PR within 45.
Run commands in the foreground; end with worker_done.
