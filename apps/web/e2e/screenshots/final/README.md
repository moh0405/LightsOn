# Final verification

Baseline: `e0e5187`; branch: `final/verify`.

The browser rehearsals use the real CoStar kit, cached prep trace and local media,
with `AGENT_MODE=fake` to prevent Bedrock calls. Both normal and `DEMO_MODE=1`
servers use unscaled timers. Host controls advance pitch, challenge, negotiation
and verdict after each screenshot; INTRO and the light-up play normally. The room
is reset and the phone rejoins between rehearsals so Esperson has dark floors again.

## Results

READY for the requested verification scope. No Bedrock calls were made.

- Full E2E: **132 passed** (44 cases × 3 consecutive repetitions, zero retries; 17.6 minutes).
- Python: 626 passed, 1 skipped.
- Frontend unit tests: 68 passed.
- Production build: passed (existing bundle-size advisory).
- Admin broadcast/unmatched errors and rejected commands: passed in kit and fixtures; a dropped command produces one timeout toast without a server error event.
- Delayed building names: no raw IDs, tap selection works in kit and fixtures.
- Trace: all rendered body text >=22 px; headings >=28 px; no horizontal or outer-panel overflow at 1920×1080. Long trace columns scroll internally.
- Normal mode: 3 complete rounds; 0 screen/phone console errors or runtime exceptions.
- Demo mode: 3 complete rounds; 0 screen/phone console errors or runtime exceptions.
- A mutation observer checked screen/phone text throughout every rehearsal for every property ID returned by the building list and for `F_` fact IDs: none displayed.
- Every rehearsal loaded the aerial image and both concept-card images with positive natural dimensions.

Winner-colored pixels are read from the rendered map's WebGL framebuffer after
`building_revived`, excluding HTML controls and pointers. The timestamp starts
when the screen receives the actual server event; no event is fabricated or held.

| Mode | Round | Winner-colored map pixels | Milliseconds after event |
| --- | ---: | ---: | ---: |
| Normal | 1 | 1,971 | 803.5 |
| Normal | 2 | 1,705 | 749.3 |
| Normal | 3 | 1,971 | 799.7 |
| Demo | 1 | 1,971 | 791.1 |
| Demo | 2 | 1,909 | 780.9 |
| Demo | 3 | 1,747 | 772.0 |

The separate floor-isolation regression measured **2,872 visible lit-floor pixels**
after the dive in each of the three full-suite repetitions.

## Screenshots

All 79 PNGs are 1920×1080. Each `normal-{1,2,3}-*` and `demo-{1,2,3}-*`
sequence captures lobby, explore, dive, aerial, interior, pitch, challenge,
negotiate, verdict, power-up, light-up, concept and trace. The additional
`trace-1920x1080.png` records the font/overflow regression.

Example demo sequence: [aerial](demo-1-aerial.png), [challenge](demo-1-challenge.png),
[verdict](demo-1-verdict.png), [light-up](demo-1-light-up.png),
[concept](demo-1-concept.png), [trace](demo-1-trace.png).

## Reproduce

From the repo root, after linking the kit, root `.env` and public media:

```sh
export LO_E2E_API_PORT=20901 LO_E2E_WEB_PORT=17974
export PREP_TRACE_DIR=/Users/momossss/Documents/GitHub/LightsOn/server/cache/prep
DEMO_MODE=0 pnpm --filter @lights-on/web e2e --repeat-each=3
DEMO_MODE=0 pnpm --filter @lights-on/web exec playwright test --config playwright.final.config.ts
DEMO_MODE=1 pnpm --filter @lights-on/web exec playwright test --config playwright.final.config.ts
pnpm --filter @lights-on/web build
```

The final rehearsal config explicitly uses the fake agent and unscaled timers;
the standard E2E config uses accelerated timers. Live Bedrock behavior is outside
this verification's scope.
