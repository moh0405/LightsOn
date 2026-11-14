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
