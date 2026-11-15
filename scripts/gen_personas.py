"""Write deterministic, grounded personas for buildings without a prepared one. No model calls.

    uv run --project server python scripts/gen_personas.py [--force] [ID ...]

Without IDs, every fixture dossier lacking a persona file gets one. Existing files (such as a
model-prepared persona) are kept unless --force is given.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'server'))

from app.agent.persona import validate_persona  # noqa: E402
from app.agent.persona_gen import generate_persona  # noqa: E402

DOSSIERS = ROOT / 'server/fixtures/dossiers'
PERSONAS = ROOT / 'server/fixtures/personas'


def main(argv: list[str]) -> None:
    force = '--force' in argv
    ids = [a for a in argv if not a.startswith('--')] or sorted(p.stem for p in DOSSIERS.glob('*.json'))
    for bid in ids:
        path = PERSONAS / f'{bid}.json'
        if path.exists() and not force:
            print(f'{bid}: kept existing persona')
            continue
        dossier = json.loads((DOSSIERS / f'{bid}.json').read_text())
        persona = generate_persona(dossier).model_dump()
        validate_persona(persona, dossier)
        path.write_text(json.dumps(persona, indent=2) + '\n')
        print(f'{bid}: {persona["intro_line"]}')


if __name__ == '__main__':
    main(sys.argv[1:])
