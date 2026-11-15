# Morning summary (updated 04:20, Sun Nov 15)

**Test link (unchanged):** https://chassis-practical-peace-underground.trycloudflare.com/screen (phones: /play, host: /admin).
Reload /screen to get the newest build. Server restarted 04:05 with everything below.

## Your 7 points
| # | Issue | Status |
|---|---|---|
| 1 | Audio lag | In progress (`audio-lag`, Claude Opus; Codex hit its limit mid-task). Not merged yet. |
| 2 | Start-screen 3D look | In progress (`visual-polish`, Claude Opus continuing Codex's work). Not merged yet. |
| 3 | Selecting a building / dive animation | Camera framing MERGED (PR #38): every building fully framed, 7 buildings x 3 screen sizes. Animation polish in `visual-polish`. |
| 4 | AI needs knowledge | MERGED (PR #39): replies go through LangChain on Bedrock with get_fact / search_facts tools and richer building knowledge. Each round now costs more (about $0.08-0.10). |
| 5 | Check CoStar / Vexcel / Matterport APIs | DONE (audit PR #40): all 23 Matterport tours load in real iframes, Vexcel answers, CoStar data correct for all 7 buildings. |
| 6 | Matterport disappears after 1 s | Walk-in MERGED (PR #41): press M or "Walk inside" on /screen, or the button on /admin. Re-verification on current main + autoplay without a click is in `audit-ui-fixes`. |
| 7 | Check every small thing | Audit found 13 defects (apps/web/e2e/audit-report.md). Fixes in progress across 3 workers. |

Also merged tonight: distinct personas and intros for all 7 buildings (PR #37), persona verdict/voice fixes (#35), speech
cut-off fix (#36).

## Still to do
- Merge `audio-lag`, `visual-polish`, `audit-ui-fixes` when green; then one final headless QA sweep of everything and a fix round.

## Budget
Bedrock ledger $3.14 of the $4.50 cap ($1.36 left, about 14 live rounds). For rehearsals use `./scripts/demo.sh --fixtures`
(free). If you want more live rounds at judging, raise BEDROCK_SPEND_CAP_USD (AWS budget is $5).

## Accounts
Codex (system account) hit its limit until 4:33 AM; unfinished Codex tasks were moved to Claude Opus on the new Claude account.
