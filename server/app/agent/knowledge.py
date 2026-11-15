"""Grounded live knowledge: every prepared dossier fact, real neighbors and lookup tools.

Nothing here invents a fact. Added rows are copies of real source values: a neighbor's
own derived dark-floor facts (keeping their ids) and the count of the kit's Matterport
model ids. Contacts never enter a fact row, so they never reach a prompt or a tool result.
"""
from __future__ import annotations

import copy
import json
import logging
import re

from .persona import fact_line

log = logging.getLogger(__name__)
NEIGHBOR_KEYS = {'dark_floor_count': 'neighbor_dark_floor_count', 'dark_sqft': 'neighbor_dark_sqft'}
KNOWLEDGE_KEYS = set(NEIGHBOR_KEYS.values()) | {'matterport_tour_count'}
FLOOR = re.compile(r'floor_(-?\d+|id_\d+)_(size|available|occupied)_sqft')
_cache: dict[tuple, list[dict]] = {}


def _neighbor_facts(dossier: dict) -> list[dict]:
    key = (dossier.get('id'), dossier.get('data_mode'), tuple(dossier.get('neighbors') or ()))
    if key in _cache:
        return _cache[key]
    rows = []
    try:
        from ..data.provider import get_provider
        provider = get_provider()
        for pid in dossier.get('neighbors') or []:
            other = provider.dossier(str(pid))
            if not other:
                continue
            for fact in other.get('facts', []):
                spoken = NEIGHBOR_KEYS.get(fact.get('key'))
                if spoken is None or type(fact.get('value')) not in (int, float):
                    continue
                say = (f"nearby {other['name']} has {fact['say_as'].replace(' floors', '')} dark floors"
                       if spoken == 'neighbor_dark_floor_count'
                       else f"nearby {other['name']} has {fact['say_as']} of dark space")
                rows.append(dict(id=fact['id'], key=spoken, say_as=say, value=fact['value'], unit=fact.get('unit'),
                                 source=fact.get('source'), kind=fact.get('kind'), building=other['name']))
    except Exception as exc:  # A missing neighbor never blocks a live turn.
        log.error('Neighbor knowledge unavailable (%s)', type(exc).__name__)
    _cache[key] = rows
    return rows


def knowledge_dossier(dossier: dict) -> dict:
    """A copy of the dossier with citable neighbor and tour-count facts appended."""
    if dossier.get('_knowledge'):
        return dossier
    result = copy.copy(dossier)
    facts = list(dossier.get('facts', []))
    have = {f.get('id') for f in facts}
    facts += [dict(f) for f in _neighbor_facts(dossier) if f['id'] not in have]
    tours = (dossier.get('media') or {}).get('matterport') or []
    if tours:
        facts.append(dict(id=f"F_{dossier['id']}_matterport_tour_count", key='matterport_tour_count',
                          say_as=f'{len(tours)} Matterport interior tours', value=len(tours), unit=None,
                          source='costar', kind='verified'))
    result['facts'] = facts
    result['_knowledge'] = True
    return result


def _row(fact: dict) -> dict:
    return {k: fact.get(k) for k in ('id', 'key', 'say_as', 'value', 'unit', 'kind')} | {'spoken': fact_line(fact)}


def knowledge_text(dossier: dict) -> str:
    """Compact, per-building (cacheable) knowledge section for live prompts."""
    from .prompts import safe_facts
    facts = [f for f in safe_facts(dossier) if f['value'] is not None]
    by_key = {f['key']: f for f in facts}
    floor_rows, other = [], []
    for f in facts:
        (floor_rows if FLOOR.fullmatch(f['key']) else other).append(f)
    def num(f):
        return None if f is None else f"{f['value']:,.0f}"
    floors = []
    for floor in dossier.get('floors', []):
        n = floor.get('number')
        if n is None:
            continue
        cells = [num(by_key.get(f'floor_{n}_{field}_sqft')) or 'null' for field in ('size', 'available', 'occupied')]
        floors.append(f"{n}|{floor.get('source_status')}|" + '|'.join(cells))
    dark = [f"floor {floor['number']} ({num(by_key.get(f'''floor_{floor['number']}_available_sqft''')) or 'unknown'} sq ft available)"
            for floor in dossier.get('floors', []) if floor.get('source_status') == 'dark' and floor.get('number') is not None]
    tours = (dossier.get('media') or {}).get('matterport') or []
    captions = [t.get('caption') for t in tours]
    estimates = [f for f in other if f['kind'] == 'estimate']
    neighbors = [f for f in other if f['key'] in KNOWLEDGE_KEYS - {'matterport_tour_count'}]
    plain = [f for f in other if f not in estimates and f not in neighbors]
    def table(rows):
        return '\n'.join(json.dumps([f['id'], f['say_as'], fact_line(f), f['value'], f['unit'], f['kind']],
                                    ensure_ascii=False) for f in rows)
    bid = dossier['id']
    return f'''BUILDING KNOWLEDGE (all from the source dossier; cite the id of every fact you use).
Tools: get_fact(id) returns one fact row; search_facts(query) finds fact rows by topic. Use them when you need a fact
not shown below or want the exact wording; never cite an id you have not seen. Unknown stays unknown.
Dark floors ({by_key.get('dark_floor_count', {}).get('say_as', 'unknown')}, {by_key.get('dark_sqft', {}).get('say_as', 'unknown')} total): {', '.join(dark) or 'none listed'}.
Tenant history: {by_key.get('tenant_records', {}).get('say_as', 'unknown')} total, {by_key.get('current_tenants', {}).get('say_as', 'unknown')} current, {by_key.get('former_tenancy_records', {}).get('say_as', 'unknown')} former; top former industries: {'; '.join(f"{by_key[f'top_former_industry_{i}']['say_as']} ({by_key.get(f'top_former_industry_{i}_records', {}).get('say_as', 'unknown')})" for i in range(1, 4) if f'top_former_industry_{i}' in by_key) or 'unknown'}.
Matterport interior tours: {len(tours)}; tour names/captions: {json.dumps(captions)} (null = unknown name; never describe rooms you have not seen).
Aerial estimates (Vexcel imagery + vision; ALWAYS say "looks like"): {'; '.join(f['say_as'] for f in estimates) or 'none'}.
Nearby neighbors (real office buildings near you; cite their fact ids, speak of them as neighbors): {'; '.join(f['say_as'] for f in neighbors) or 'none prepared'}.
FACTS [id, exact say_as, spoken wording, value, unit, kind]:
{table(plain + estimates + neighbors)}
FLOORS: number|status|size sq ft|available sq ft|occupied sq ft. Cite F_{bid}_floor_<number>_<size|available|occupied>_sqft (null = unknown, do not cite).
{chr(10).join(floors)}
'''


class FactTools:
    """Building-scoped, read-only lookups over the (knowledge) dossier for the live model."""
    SPECS = [
        {'type': 'function', 'function': {'name': 'get_fact', 'description':
            'Return one fact row from this building dossier by its exact fact id.',
            'parameters': {'type': 'object', 'properties': {'id': {'type': 'string'}}, 'required': ['id']}}},
        {'type': 'function', 'function': {'name': 'search_facts', 'description':
            'Search this building dossier (and its prepared neighbors) for fact rows about a topic, '
            'such as "parking", "floor 7", "tenant history", "trees" or "neighbors". Returns up to eight rows.',
            'parameters': {'type': 'object', 'properties': {'query': {'type': 'string'}}, 'required': ['query']}}},
    ]
    SYNONYMS = {'tall': 'height', 'high': 'height', 'old': 'construction', 'built': 'construction', 'year': 'construction',
                'renovated': 'renovation', 'history': 'tenant', 'tenants': 'tenant', 'industries': 'industry',
                'cars': 'parking', 'car': 'parking', 'empty': 'dark', 'neighbor': 'neighbor', 'neighbors': 'neighbor',
                'nearby': 'neighbor', 'tour': 'matterport', 'tours': 'matterport', 'interior': 'matterport',
                'aerial': 'vexcel', 'roof': 'rooftop', 'size': 'area', 'big': 'area', 'floors': 'floor'}

    def __init__(self, dossier: dict):
        from .prompts import safe_facts
        self.facts = {f['id']: f for f in safe_facts(dossier)}

    def get_fact(self, id: str) -> dict:
        fact = self.facts.get(str(id))
        if fact is None:
            return {'id': str(id)[:80], 'error': 'unknown fact id; do not cite it'}
        if fact['value'] is None:
            return {'id': fact['id'], 'key': fact['key'], 'value': None, 'error': 'value unknown; do not cite it'}
        return _row(fact)

    def search_facts(self, query: str) -> dict:
        words = [self.SYNONYMS.get(w, w) for w in re.findall(r'[a-z]+|\d+', str(query).casefold()[:200])]
        words = [w for w in words if w not in {'the', 'a', 'of', 'and', 'my', 'is', 'how', 'what', 'many', 'much'}]
        if not words:
            return {'facts': []}
        scored = []
        for fact in self.facts.values():
            if fact['value'] is None:
                continue
            key = fact['key']
            tokens = set(re.findall(r'[a-z]+|\d+', re.sub(r'([a-z])([A-Z])', r'\1 \2', key).casefold()))
            text = ' '.join([fact.get('say_as') or '', fact_line(fact) or '', fact.get('source') or '']).casefold()
            score = 0.0
            for w in words:
                if w.isdigit():
                    floor = FLOOR.fullmatch(key)
                    score += 3 if floor and floor[1] == w else 0
                elif w in tokens:
                    score += 2
                elif len(w) > 3 and (w in text or any(t.startswith(w) or w.startswith(t) for t in tokens if len(t) > 3)):
                    score += 1
            if score:
                scored.append((-score, key, fact['id'], fact))
        return {'facts': [_row(f) for *_, f in sorted(scored, key=lambda r: r[:3])[:8]]}

    def run(self, name: str, args: dict) -> dict:
        args = args if isinstance(args, dict) else {}
        if name == 'get_fact':
            return self.get_fact(args.get('id', ''))
        if name == 'search_facts':
            return self.search_facts(args.get('query', ''))
        return {'error': 'unknown tool'}
