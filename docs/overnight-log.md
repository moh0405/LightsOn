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
