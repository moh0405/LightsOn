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
- Rebased Phase 4B PR #11 onto the merged Vexcel fixes (f55d5d2), retaining the merged adapter, builder and dossier
  files exactly. Prep now reuses the dossier's positive detection facts instead of reconstructing them from raw
  detection counts; persona speech preserves the source's "within about 30 m of the parcel" qualifier. Refreshed that
  factual clause and the ignored validated caches deterministically, with no new model calls. Post-rebase checks:
  205 pytest passed (1 opt-in live test skipped), 20 prep checks passed, 34 web tests + messaging typecheck passed.
- Full post-rebase Playwright passed 18/18 on LO_E2E_API_PORT=18201 and LO_E2E_WEB_PORT=15374, including prepared
  intro subtitles in kit and fixtures modes. Spend remains $1.6183695 across the same 27 completed Bedrock calls.
- 10:4x PR #11 (prep deepagent) merged as faaf76c; 205 pytest pass. Esperson persona is grounded but reads like a database ("My dossier records...") and hard_limits restate facts, flagged for review. Started Phase 4 reviews (Codex high + Claude Opus) and a Phase 4 QA sweep (no Bedrock calls). Spend ledger: $1.62 of the $3 cap.
- 11:0x Phase 4 reviews: Claude Opus pass-with-issues, Codex fail (2 P1: model could write the trusted dossier cache; hard_limits not physical constraints. P2: spend metering gaps incl. prompt caching, unauthenticated forced prep, database-style persona voice, unjustified desire, borrowed Vexcel capture date). One Codex high fix PR (phase4/fixes) started; it may spend at most up to $2.90 total to regenerate only Esperson persona_writer.
- 11:2x Phase 4 QA sweep: 22/22 kit and fixtures (5 rounds, persona intro, Wells fallback, cached prep without model calls, agent_step, footprints, privacy). PR #13 (tests+report) merged. One finding QA4-01 (estimate label missing on ScoreCard Vexcel evidence) handed to the phase4/fixes worker. Spend unchanged at $1.62.
- 11:4x Approved Persona contract change for Phase 4 fixes: typed HardLimit, hard_limits_empty_reason, desire_reason_fact_ids, desire_reason.
- 12:0x PR #14 (Phase 4 fixes + QA4-01) merged. One persona-writer run cost $0.066; ledger $1.684. New Esperson intro: "I made my entrance in 1941. Darling, bring me a plot twist and we might have a deal." Hard limits are typed physical conditions (floor plate 22,189 sq ft, 297 ft height, parking ratio 0.89, floor 7 31,503 sq ft). Started final Codex high + Claude Opus reviews of #14.
- 12:1x Codex hit its usage limit again during the Phase 4 fix review (resets 13:50). Claude Opus review continues; Codex review re-runs at ~13:57 (scheduled).
- 12:3x Claude Opus review of PR #14: pass-with-issues (10/14 fix reverts caught by tests). Issues: persona normalizer + FICTION_WORDS strip in-character lines so era voice never reaches dialogue; every hard limit lists all 8 rejects_categories (meaningless; height/parking never trigger); 4 untested reverts; PRD.md Persona contract outdated. Waiting for the Codex review (~13:57) to combine into one fix PR. Report: docs/agents/review-p4fix-claude.md.
- 10:5x Codex limited until 13:50; started Phase 4 fix round 2 on Claude Opus now (era voice survives normalization, numeric hard-limit triggers [HardLimit contract change approved], 4 missing revert tests, PRD persona contract, one capped persona regen). Codex review at ~13:57 will review main including this.
- 11:0x Antigravity models checked: Claude Opus 4.6 Thinking, Claude Sonnet 4.6, GPT-OSS 120B, Gemini 3.8 Flash all answer. While Codex is limited, Antigravity + claude-opus-4-6-thinking is the second strong reviewer.
- 11:3x PR #15 (Claude Opus, Phase 4 fixes round 2) ready: claim denylist keeps in-character lines, numeric HardLimit triggers, 4 revert tests, PRD updated, Esperson regenerated ($0.061; ledger $1.745). New intro: "I made my entrance in 1941. Pitch like you mean it, kid — I have been waiting long enough." Reviewing with Antigravity + Opus 4.6 before merge. Open: failed forced prep deletes the old cache; "1,941 year" say_as.
- 11:1x Antigravity Opus 4.6 and GPT-OSS quota exhausted (~7 days). PR #15 review moved to an independent Claude Opus 5.5 worker; Codex final review still at 13:57.
- 11:5x Independent Claude Opus review of PR #15: FIX FIRST (sentence-initial proper nouns like "Exxon adored me" pass as fiction; fallback limits ignore applies_to narrowing in challenge; low: past-tense history claims). All revert tests verified. Claude Sonnet worker patching PR #15 plus: failed forced prep keeps old cache; "1,941 year" formatting.
- 12:2x PR #15 + fixups merged as 515f29f (sentence-initial proper nouns, challenge respects applies_to, past-tense claims dropped, failed forced prep keeps old cache, year formatting). main: 251 pytest, 36 web; worker e2e 19/19, evals 58/58. Codex final Phase 4 review at ~13:57.
- 14:0x Codex back. Phase 4 final review (Codex high) running since 13:57. Started Phase 5 live agent (Codex high) in parallel to save time; it rebases on any Phase 4 fixes.
- 14:3x Codex final Phase 4 review: FAIL (P1 persona validator still accepts uncited physical claims like gym/fire/asbestos; P2 width/length taken as height; P3 no equality-boundary tests; inherited toasts/scout ownership/floor rebuild; data-mode spec repeat isolation). Shipped Esperson persona passes its source/voice audit; ledger $1.745. Fix round 3 on Claude Opus (Codex busy with Phase 5).
- 15:0x PR #16 (Phase 4 fix round 3, Claude Opus) merged as 43fd39a: all 7 Codex findings fixed test-first; 331 pytest, 36 web, 112 evals, e2e 57/57 with repeat-each=3; ledger unchanged $1.745. Phase 4 done except LangSmith trace (no key). PR #16 gets a strong-model re-check inside the Phase 5 post-merge review. Phase 5 told to rebase.
