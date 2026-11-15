# Task: audio lag on /screen (all buildings)
Human playtest: the building's spoken audio "is lagging like crazy" for every building. PR #36 fixed cut-offs/repeats; this is
latency. Setup: symlink /Users/momossss/Documents/GitHub/LightsOn/data, .env and apps/web/public/media into the worktree (gitignored; never commit/print); PREP_TRACE_DIR=/Users/momossss/Documents/GitHub/LightsOn/server/cache/prep. Spend ledger = the main checkout server/state/bedrock_spend.json (BEDROCK_SPEND_LEDGER). Small commits, failing test first, push after each. Run commands in the foreground; end with worker_done. Ports LO_E2E_API_PORT=21501 LO_E2E_WEB_PORT=18574. Branch audio/lag.
Measure in Playwright (Chromium, real speechSynthesis with instrumentation of speak/start/end, Tone/AudioContext, main-thread
long tasks via PerformanceObserver, requestAnimationFrame frame times) a full round on EVERY wakeable building with the fake
agent AND with the live agent replayed from recorded responses: time from each event (building_intro, counteroffer, verdict)
arriving over the WebSocket to its first spoken word and to subtitle display; frame-time/long-task stalls during speech (map
render, sparks, MapLibre fade animations, React re-renders of the store on every pointer event, Tone scheduling); speech queue
backlog (lines queued behind earlier lines or behind music fades); getVoices() delays; chunk gaps between sentences; the
'thinking' line blocking the real line. Fix the causes so the first word starts <= 300 ms after the event (subtitle immediately),
no gap > 250 ms between chunks, no long task > 100 ms during speech, and stale lines are dropped when a newer line for the same
step arrives. Report before/after numbers per building in apps/web/e2e/audio-lag-report.md. Gates: pnpm -r test, full e2e,
build, pytest. PR label agent:codex, footer "🤖 Generated with Codex, coordinated by Claude Code".
