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
