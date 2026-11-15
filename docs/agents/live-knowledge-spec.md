# Task: make the building's live replies knowledgeable (LangChain on Bedrock)
Human playtest: the building's replies feel unknowledgeable/generic. Keep Amazon Bedrock (Amazon track; no Gemini key exists)
but run the live challenge/verdict steps through LangChain (langchain-aws ChatBedrockConverse, already a dependency for the
deepagents prep) with the PRD's one tool get_fact(id) plus search_facts(query) over the building's dossier, so the model can
look up the right fact instead of only seeing a trimmed list. Give it richer, still-grounded knowledge: all dossier facts with
say_as, dark floors and sq ft, tenant-history aggregates and top former industries, Vexcel estimates (labelled), Matterport
tour names, real neighbors and their dark floors, current city needs, the persona (voice, desire hint, hard limits), and the
round memory (earlier pitches/challenges). Every published line still passes grounding.py (fact ids, numbers, claim check) and
the voice filter; all calls metered by spend.py; the 8 s/12 s step budgets and fallbacks unchanged; trace panel shows the tool
calls as live agent_step events. Setup: symlink /Users/momossss/Documents/GitHub/LightsOn/data, .env and apps/web/public/media into the worktree (gitignored; never commit/print); PREP_TRACE_DIR=/Users/momossss/Documents/GitHub/LightsOn/server/cache/prep. Spend ledger = the main checkout server/state/bedrock_spend.json (BEDROCK_SPEND_LEDGER). Small commits, failing test first, push after each. Run commands in the foreground; end with worker_done. Ports LO_E2E_API_PORT=21601 LO_E2E_WEB_PORT=18674. Branch live/knowledge. Tests with
a fake chat model (tool-call round trips, grounding, budget). Then ONE paid check: a 2-player round on Esperson and one on
another building, total <= $0.15 (stop if the ledger would pass $3.30); quote every line verbatim and the tool calls used.
Gates: pytest (cap 3.00 and real .env), pnpm -r test, evals --quick, full e2e, build. PR label agent:claude, footer
"🤖 Generated with Claude Code (Opus), coordinated by Claude Code".
