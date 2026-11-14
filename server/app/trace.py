"""Read-only public projection of recorded prep; never export cached free text."""
import json
import logging
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
log = logging.getLogger(__name__)
STEPS = {'research', 'property_scout', 'spatial_scout', 'persona_writer',
         'complete', 'validation', 'fallback'}
TOOLS = {'write_todos', 'task', 'write_file', 'read_file', 'edit_file', 'ls', 'glob', 'grep',
         'kit_get_building', 'kit_get_floor_status', 'kit_get_tenant_history',
         'kit_get_matterport_models', 'vexcel_property', 'vexcel_imagery',
         'vexcel_detect', 'matterport_get_model', 'validate_persona', 'retry', 'fake_agent'}
FILES = ('facts_property.json', 'facts_spatial.json', 'persona.json', 'dossier.json')
SMART = 'us.anthropic.claude-sonnet-4-6'
FAST = 'us.anthropic.claude-haiku-4-5-20251001-v1:0'


def recorded_trace(property_id: str) -> dict:
    # IDs must be authorized by the route before filesystem access.
    directory = Path(os.getenv('PREP_TRACE_DIR') or ROOT / 'server/cache/prep') / property_id
    events = []
    try:
        path = directory / 'agent_steps.json'
        if path.stat().st_size > 1_000_000:
            raise ValueError('Oversized trace')
        raw = json.loads(path.read_text())
        rows = raw.get('events', []) if isinstance(raw, dict) else []
        if not isinstance(rows, list):
            raise ValueError('Invalid trace')
        for row in rows[:2000]:
            if not isinstance(row, dict):
                continue
            step, tool, duration = row.get('step'), row.get('tool'), row.get('duration_ms')
            if (not isinstance(step, str) or step not in STEPS
                    or not isinstance(tool, str) or tool not in TOOLS
                    or type(duration) is not int or not 0 <= duration <= 86_400_000):
                continue
            events.append(dict(step=step, tool=tool, summary=f'{step}: {tool}', duration_ms=duration))
    except (OSError, ValueError):
        log.warning('Recorded prep trace unavailable')
    # No raw prompts, artifact contents, user-controlled summaries, or env values.
    return dict(building_id=property_id, available=bool(events), events=events,
                files=[name for name in FILES if (directory / name).is_file()],
                plan_recorded=any(e['tool'] == 'write_todos' for e in events),
                model_ids=[], configured_model_ids=[model for model in dict.fromkeys([
                    os.getenv('BEDROCK_SMART_MODEL_ID') or SMART,
                    os.getenv('BEDROCK_FAST_MODEL_ID') or FAST]) if model in {SMART, FAST}],
                notes=['Only recorded tool names and durations are replayed.',
                       'Model IDs and todo contents were not captured in this recording.',
                       'Files listed are cached artifacts; file paths were not captured per tool call.',
                       'validate_persona is a recorded completion marker for deterministic merge/validation; '
                       'this endpoint does not revalidate a historical persona against the current schema.'])
