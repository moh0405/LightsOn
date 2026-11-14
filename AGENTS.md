# Lights On — rules for the coding agent

You are building Lights On for HackPrinceton Fall 2026 (36 hours). The spec is docs/PRD.md. Follow the Build phases section in order; do not start a phase until the previous exit gate passes.

## Non-negotiables
1. Real data first, fakes for tests. The game runs on the CoStar kit in data/costar/ (DATA_MODE=kit). fixtures/ and fake_agent.py exist for unit tests and offline fallback.
2. Vertical slice before breadth: one complete ugly round beats five polished half-features.
3. The model proposes, the server decides. No model output may change game state without passing actions.py validation.
4. No invented facts anywhere: not in prompts, components, fixtures or tests. Building facts come only from the dossier. Missing = null.
5. Never say "vacant". Floors are dark / partial / occupied / unknown per the floor status rule in docs/PRD.md.
6. Filter the kit to propertyType 5 (Office). Decode integer enums with data/costar/schemas/enums.json. Read docs/costar/ before touching kit fields.
7. Never load a whole kit JSONL file into memory; stream it once into data/costar/index.sqlite.
8. Never display the kit's contacts (broker and owner names) or send them to a model.
9. Every external call (Vexcel, Matterport, Bedrock, ElevenLabs, Photon) goes through an adapter with a timeout, a fallback and a logged error. The UI shows a toast, never a crash.
10. Typed input, tap selection, tap-to-charge and subtitles must always work.
11. Physical feedback (pointer, hover, charge) never waits on an AI call.

## Secrets and data
- Keys live only in .env at the repo root; read them with python-dotenv / import.meta.env. Never print, log, commit or paste a key, and never put one in a URL.
- Never commit anything under data/, apps/web/public/media/ or .env. Run `git status` before every commit.
- Phone numbers: store only with consent, log last 4 digits only.

## Conventions
- Python 3.11, FastAPI, Pydantic v2; models in server/app/models.py are the source of truth; run scripts/gen_types.py after changing them.
- TypeScript strict; no `any` in game state code.
- Canonical names: phases, categories, commands and events exactly as in docs/PRD.md Contracts.
- Small commits after every working step: `phaseN: what changed`.
- Only edit the files your task names. If you need a contract change (models.py, an event, a command), stop and ask.

## Before every commit
- uv run pytest
- pnpm -r test
- If agent code changed: uv run python evals/run.py --quick

## Stop and ask the humans when
- A real API response differs from the PRD's assumptions.
- A P0 acceptance check cannot be met.
- A change would cut or weaken negotiation or the light-up moment.
- You need a new paid service or credentials.

## Definition of done for any feature
- Meets its acceptance check in docs/PRD.md Scope.
- Works with DATA_MODE=kit and with DATA_MODE=fixtures.
- Has a test or an eval case.
- No console errors on /screen during a full round.
