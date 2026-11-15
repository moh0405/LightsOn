Camera regression evidence uses the checked-in floor/context geometry with DATA_MODE=kit, AGENT_MODE=fake and DEMO_MODE=0. Each building is captured at 1920×1080, 1440×900 and 1280×720; the image width is the map field after the projector sidebar is deducted.

Six buildings use real phone wakes. As required by the camera framing task spec, Wells Fargo Plaza (233899) invokes the same production dive function through a development-only hook. The hook moves only the camera and does not alter game state.

Cyan is a test-only floor highlight. The tests project every footprint vertex at ground and roof height through MapLibre's actual matrix, check canvas margins, then compare roof/middle/base pixels with an unobstructed reference. Overview captures include all exported context and floor geometry.

The 30 captures cover seven towers, the EXPLORE overview, the INTRO handoff, and the post-revival ease at each viewport. Round framing also reserves room for subtitles; occlusion fading covers both context towers and neighboring buildings' separate floor geometry.

Run from the repository root with the shared data, `.env`, and media symlinks configured:

```sh
PREP_TRACE_DIR=/Users/momossss/Documents/GitHub/LightsOn/server/cache/prep \
DEMO_MODE=0 LO_E2E_API_PORT=21201 LO_E2E_WEB_PORT=18274 \
pnpm --filter @lights-on/web e2e camera.spec.ts
```

Validation: 72 frontend unit tests passed; server pytest reported 626 passed and one skipped; production build passed. The final full Playwright run passed 49 of 50 tests, including all six camera checks. Its housing-impact test sent mock messages before socket readiness; the coordinator-approved readiness wait fixes that race, and the corrected test passed three consecutive targeted runs. The earlier overview assertion now checks the projected tower volumes instead of requiring the previous zoom after the layout changes.
