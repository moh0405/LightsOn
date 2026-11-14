---
name: llm-council
description: Convene an LLM council (after karpathy/llm-council) to judge the Lights On idea, scope, demo or a design decision. Several models answer independently, rank each other's anonymized answers, and a chairman writes the final verdict. Use when the user says "council", "LLM council", "judge our idea", "is this scope right", "what should we cut", or wants independent multi-model opinions on what we are building.
---

# LLM council

Karpathy's llm-council (github.com/karpathy/llm-council) sends one question to several models via OpenRouter, has each
model rank the others' anonymized answers, then a chairman model synthesizes. We reproduce the same three stages with the
agent CLIs already on this machine, so no OpenRouter key or new paid service is needed.

## Run

```bash
python3 .claude/skills/llm-council/council.py "<question>" \
  [--members codex,claude-opus,grok,agy-gemini] [--chairman claude-opus] \
  [--context-file docs/overnight-log.md] [--timeout 900] [--dry-run]
```

Run it in the background (it takes several minutes); it prints the path of the report, written to
`docs/council/<timestamp>-<slug>.md`. Read the "Final answer" and "Aggregate ranking" sections first, then relay them.

## Members (read-only modes)

| name | CLI | notes |
| --- | --- | --- |
| codex | `codex exec -m gpt-6.1-sol -s read-only` | strongest coder; spends Codex quota |
| claude-opus | `claude -p --model claude-opus-5-5` | default chairman; spends Claude quota |
| grok | `grok -p` (grok-4.7, free tier) | short limits |
| agy-sonnet | `agy --model claude-sonnet-4-6 -p` | Antigravity |
| agy-gemini | `agy --model gemini-3.8-flash-high -p` | Antigravity; light model, adds diversity |

Default council: codex, claude-opus, grok, agy-gemini (four different model families). Before running, check quota:
if Codex or Antigravity is rate-limited (see docs/overnight-log.md and memory), drop that member with `--members`.
A failed member is reported in the file and skipped in ranking; the council still finishes with the rest.

## Good questions for Lights On

- "Given docs/PRD.md and what is built so far, what is the right scope for the remaining hours? What should we cut?"
- "Which prize tracks can this realistically win, and what single change most improves our odds in each?"
- "Rate the 2-minute demo in docs/PRD.md for a judge: what will land, what will confuse?"
- "Is the Esperson persona entertaining enough? Quote server/fixtures/personas/233953.json and suggest fixes."

## Rules

- Members only read the repo; they never edit, commit or call Bedrock/Vexcel.
- Never pass secrets in the question or context files (no .env, no data/ contents with contacts).
- The council advises; the human and the PRD decide. Record decisions in docs/overnight-log.md.
