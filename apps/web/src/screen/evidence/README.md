# Task 6B browser evidence

1920 × 1080 screenshots from `src/screen/media.e2e.ts`, using the committed Esperson dossier and persona. Skyline geometry and the Matterport document are browser test adapters; these images do not certify live Matterport availability. Missing kit captions stay unknown, and no local aerial files are present in this checkout.

Run the complete suite, including these checks, with:

```sh
LO_E2E_API_PORT=19601 LO_E2E_WEB_PORT=16674 pnpm --filter @lights-on/web e2e --config src/screen/media.playwright.config.ts --repeat-each=3
```

The checks cover both data modes, zero through four players (including maximum-length names), intro cancellation on phase change, retained subtitles, first floor paint within 300 ms, final city values, concept attribution, error toasts, and a timed-out tour with softer auto-completion.

Final validation: 456 Python tests passed with one existing live-provider skip, 45 web unit tests passed, messaging TypeScript passed, production build passed, and all 72 Playwright checks passed (three complete 24-test repetitions in 7.3 minutes). The intro budget regression reserves the tour within eight seconds even when all four obliques are supplied; at most three available aerial views play for 1.25 seconds each.
