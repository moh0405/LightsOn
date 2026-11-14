# Overnight log (Nov 13-14)

- 23:21 Codex hit its usage limit during Phase 3 fixes (fix 1 committed as 8751473). Handed the rest to a Claude
  Sonnet 5.5 worker on the same branch (phase3/fixes).
- 23:3x AWS found in ~/.aws (account user MohammadTest, us-east-1). Bedrock test calls:
  OK: us.anthropic.claude-sonnet-4-6, global.anthropic.claude-sonnet-4-6, us.anthropic.claude-opus-4-5-20251101-v1:0,
  us.anthropic.claude-opus-4-6-v1, us.anthropic.claude-haiku-4-5-20251001-v1:0.
  Denied (not enabled on this account): Claude Sonnet/Opus/Haiku 5.x, Opus 4.7/4.8, Fable 5.
  Set BEDROCK_SMART_MODEL_ID=us.anthropic.claude-sonnet-4-6 and BEDROCK_FAST_MODEL_ID=us.anthropic.claude-haiku-4-5-20251001-v1:0
  in .env. Keys stay in ~/.aws (boto default chain); /api/health will show AWS_ACCESS_KEY_ID=false, which is expected.
- 02:51 scheduled: merge Phase 3 fixes, QA + review, then Phase 4 on Codex (Bedrock now available).
- 23:4x AWS budget `lightson-5usd` created: $5/month cost budget, email alerts at 50%, 80%, 100% actual and 100% forecast.
  Automatic hard stop (budget action attaching a deny-Bedrock IAM policy) was NOT created: IAM changes were blocked by
  Claude Code's safety check. Compensating control: every Phase 4/5 Bedrock adapter must enforce an in-app spend cap
  (BEDROCK_SPEND_CAP_USD, default 3.00) from token usage x model price, persisted across restarts, refusing calls (with the
  usual fallback) once reached. AWS billing data lags hours, so the in-app cap is the real guard tonight.
- 23:5x User shared the Photon guidelines link; saved to docs/vendor/photon/README.md (page is JS-rendered, to be read headlessly in Phase 7). User asleep; machine is a Mac mini (no power concerns).
- 23:47 Claude worker finished Phase 3 fixes 2-5 → PR #9 merged (approved additive city.song_categories). main green:
  122 pytest, 33 web tests, build; worker reported e2e 14/14 three times and QA sweep 17/17 in kit and fixtures.
  Codex still rate-limited until ~02:43, so the post-merge review went to Antigravity.
- 00:0x Antigravity post-merge review of PR #9: pass, 0 findings (122 pytest, 33 web, 14 e2e). PHASE 3 DONE.
- 00:0x Phase 4 split: 4A Vexcel adapter/media/footprints (no AWS) started on Antigravity now; 4B prep deepagent on
  Bedrock waits for Codex (~02:51) with a hard in-app spend cap. Decisions: no LangSmith key -> tracing optional, agent_step
  always; no ElevenLabs -> no intro audio yet (subtitles only), Polly not used (budget); no Matterport zip -> kit model
  ids + captions only.
- 00:10 Phase 4A completed by Antigravity:
  - Vexcel adapter implemented in server/app/data/vexcel.py with X-API-KEY header (never logged, never in URLs), 429 exponential backoff with jitter, 60s timeout, typed fallbacks, and disk caching under server/cache/vexcel/<propertyId>/.
  - Matterport adapter stub in server/app/data/matterport.py returning kit model IDs and captions with fallback.
  - scripts/fetch_vexcel.py executed for heroes 233953 (Esperson) and 233899 (Wells Fargo Plaza):
    * 233953: footprint YES (primary structure), ortho YES, 4 obliques (N/S/E/W), detections: 31 cars.
    * 233899: footprint YES (primary structure), ortho YES, 4 obliques (N/S/E/W), detections: 8 cars, 2 trees.
  - Detections merged into dossiers as facts (source: "vexcel+vision", kind: "estimate", capture date in say_as); hero footprints merged with source: "vexcel"; floors.geojson regenerated with footprint_source="vexcel" for heroes.
  - All test suites green: 133 passed (1 skipped opt-in live test) in server pytest, 33 passed in pnpm test, 14 passed in Playwright e2e.
- 00:1x Phase 4A (Antigravity) PR #10 merged: Vexcel footprints, ortho + 4 obliques, detections for both heroes, disk
  cache, Matterport adapter (kit ids/captions only). No images or keys committed. Esperson 6-8 still dark 31,503; footprint
  now from Vexcel. 133 pytest, 33 web pass. Note for review: detection say_as reads "31 car detected" / "no parking lot
  detected" (grammar; negative detections should not become claims the building states as fact).
- 08:49 Scheduled resume fired late (the session was waiting out the Claude usage limit; nothing ran between ~00:15 and
  08:49). Phase 4B prep deepagent started on Codex (gpt-6.1-sol, high) in worktree phase4-prep-agent, with the extra
  instruction to fix Vexcel detection wording and keep negative detections out of citable facts.
- 09:0x User asked for reviews by strong models only. Started two read-only reviews of PR #9 + #10 (03e32e4..82f4f8f): Codex gpt-6.1-sol high and Claude Opus 5.5. Workflow doc updated: final reviews are always Codex high + Claude Opus.
- 09:3x Reviews of PR #9/#10: Claude Opus pass-with-issues, Codex fail (1 P1 + 6 P2: zero-count detections became negative facts, Vexcel cache keying/transient-failure caching, fallbacks, cache path traversal, projector text under 28 px, merge tests not exercising code) plus a light-up animation flake. All in one Codex high fix PR (phase4/vexcel-fixes); Phase 4B told to leave Vexcel files alone. Review/QA specs now require symlinking the kit (Codex review ran without it).
- 10:0x Phase 4B PR #11 ready: real Esperson prep cost $1.62 (all 3 subagents, refs resolved); Wells Fargo skipped to stay under the $3 cap. Waits for the Vexcel fix PR, then rebases.
- 10:2x PR #12 (Vexcel review fixes, Codex high) merged as f55d5d2: only positive detections become facts ("31 cars ... within about 30 m"), cache/fallback/traversal fixed, 28 px text restored, light-up flake fixed, configurable e2e ports. 185 pytest pass on main. Told 4B to rebase.
- Phase 4B implementation decisions (Codex, Nov 14): default AWS credential chain only; real prep limited to
  233953/233899, all other buildings use deterministic fiction. Added a process-safe persisted spend ledger with
  conservative pre-call reservations, actual response token accounting, no SDK retries and 10s connect / 60s read
  timeout; incomplete calls retain their reservation. Corrupt accounting and unpriced models fail closed. The cap
  cannot exceed $3, including when an environment override is present. Standard US geo inference list prices used:
  Sonnet 4.6 $3.30/$16.50 and Haiku 4.5 $1.10/$5.50 per million input/output tokens (Anthropic Nov 9 rate card).
- Persona grounding uses deterministic source wording for factual backstory, hard limits and factual intro clauses;
  uncited character lines come from an approved emotional-fiction vocabulary. This conservative choice prevents
  physical claims disguised as fiction without spending on a second model judge. Desire, voice, mood, motif and
  reactions are chosen by the persona_writer; no contract changes. Deepagents has a virtual filesystem rooted under
  each building's prep cache and no shell backend. It receives only scoped, allowlisted source evidence.
- LANGSMITH_API_KEY absent: tracing explicitly disabled even if LANGCHAIN_TRACING_V2 is set; actual public tool
  names/timings and named subagent calls are always written to agent_steps.json and emitted on HTTP prep. No private
  reasoning or tool arguments are logged. ELEVENLABS_API_KEY absent: audio_url stays null, intro subtitles work,
  and Polly is never called. Optional ElevenLabs adapter has a timed, logged silent fallback.
- Coordinator moved all Vexcel builder/dossier fixes into phase4/vexcel-fixes while this task was running; reverted
  the initial builder/dossier wording edits here. Prep tools independently keep only positive aerial estimates;
  negative detections are never research facts or eligible persona references. Rebase onto that fix after merge.
- Real Esperson prep succeeded in DATA_MODE=kit: three named subagents appear in the actual local agent_step trace;
  grounded dossier + persona cached under server/cache/prep/233953/, persona committed under server/fixtures/personas/,
  and floors.geojson rebuilt using the existing Vexcel footprint. Every factual backstory reference resolves, desire
  uses the fixed list and three neighbor reactions are present; intro audio is intentionally null without ElevenLabs.
  Response usage: 326,445 input / 32,794 output tokens, 27 completed calls, $1.6183695 total, no unconfirmed reservations.
  Wells Fargo Plaza real prep skipped: $1.3816305 remaining is below the observed complete Esperson run cost; it retains
  the normal fake-agent fallback. Re-running Esperson without --force is a cache hit and incurs zero model calls.
- Observed deepagents behavior: the supervisor requested supplementary /output reports and spatial_scout repeatedly
  hit the 4096-token output limit copying geometry before finishing. No generated research claims were accepted as
  facts: post-processing selected only known source IDs. Tightened subsequent prompts to write only assigned files,
  omit geometry coordinates, use short completion messages and start with write_todos; no additional real run was used.
- Applied deterministic speech formatting to source fact clauses after prep (for example, construction completion in
  1941); this changes presentation only and incurs no additional Bedrock calls. Canonical aerial estimate wording
  validates against source values and capture year across the independent Vexcel wording update.
- Preserved the real-run ledger in the original checkout's ignored server/state/bedrock_spend.json and symlinked this
  worker's ledger to it, so subsequent main-checkout prep/live adapters inherit tonight's $1.6183695 spent instead
  of resetting at merge. SpendLedger resolves symlinks before locking and atomically saving; a regression test
  verifies the link survives calls. No credentials, caches, state files or media are committed.
- Preserved the five validated prep JSON artifacts in the original checkout's ignored server/cache/prep/233953/
  as well, so the CLI/POST remain cache hits after merge. Supplementary model-written reports were not copied.
- Final Phase 4B checks: full Playwright 16/16 passed (including the new persona subtitles test in kit and fixtures),
  33 web tests + messaging typecheck passed; offline coverage also exercises forced prep, WebSocket agent_step delivery,
  concurrent spending at the cap and symlink-safe accounting. No additional paid calls were made during validation.
- Final Python validation: `cd server && uv run pytest -q` passed 153 tests, with only the opt-in Vexcel live test
  skipped; `uv run --project server python evals/run.py --quick` passed all 20 prep safety checks.
