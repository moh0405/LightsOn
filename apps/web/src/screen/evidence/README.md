# Task 6B browser evidence

1920 × 1080 screenshots from `src/screen/media.e2e.ts`, using the committed Esperson dossier and persona. Skyline geometry and the Matterport document are browser test adapters; these images do not certify live Matterport availability. Missing kit captions stay unknown, and no local aerial files are present in this checkout.

Run the complete suite, including these checks, with:

```sh
LO_E2E_API_PORT=19601 LO_E2E_WEB_PORT=16674 pnpm --filter @lights-on/web e2e --config src/screen/media.playwright.config.ts --repeat-each=3
```

The checks cover both data modes, zero through four players (including maximum-length names), intro cancellation on phase change, retained subtitles, first floor paint within 300 ms, final city values, concept attribution, error toasts, and a timed-out tour with softer auto-completion.

Final validation after rebasing onto merged Phase 5 fixes and Phase 6 audio: 509 Python tests passed with one existing live-provider skip, 51 web unit tests passed, messaging TypeScript passed, production build passed, and all 90 Playwright checks passed (three complete 30-test repetitions in 12.7 minutes). The suite includes all six audio fallback round scenarios in addition to media checks.

The 200 ms base flash now leads into both the first floor and its signature motif through one shared timestamp. The actual fade begins after 200 ms and before 300 ms in both data modes. Audio scheduling uses Tone.immediate() to avoid the extra look-ahead buffer from Tone.now(); unit regressions verify the first-note timestamp and late scheduling. Camera pull-back and the concept card wait for the flash plus the final staggered floor fade.

The intro budget regression reserves the tour within eight seconds even when all four obliques are supplied; at most three available aerial views play for 1.25 seconds each.
