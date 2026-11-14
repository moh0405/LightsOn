"""Server-side source IDs, units, numbers and cheap structured claim checks."""
from __future__ import annotations

import math
import re
from pydantic import BaseModel, ConfigDict

from .prompts import safe_facts
from .persona import fact_line

NUMBER = re.compile(r'(?<![\w])[-+]?\d[\d,]*(?:\.\d+)?')
NUMBER_WORDS = dict(zero=0, one=1, two=2, three=3, four=4, five=5, six=6, seven=7,
                    eight=8, nine=9, ten=10, eleven=11, twelve=12, twenty=20, hundred=100, thousand=1000, million=1000000)
UNITS = {'sqft': r'(?:sq\.?\s*ft\.?|square\s+feet|square\s+foot)', 'ft': r'(?:ft\.?|feet|foot)',
         'stories': r'(?:stories|storeys|floors)', 'year': r'(?:years?)',
         'spaces_per_1000_sqft': r'(?:spaces?\s+per\s+(?:1,?000|thousand)\s+(?:sq\.?\s*ft\.?|square\s+feet))'}


class ClaimCheck(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    supported: bool
    reason: str


class ClaimChecks(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    checks: list[ClaimCheck]


def check_line(line: str, fact_ids: list[str], dossier: dict, impact: dict | None = None) -> str | None:
    facts = {f['id']: f for f in safe_facts(dossier)}
    if any(fid not in facts or facts[fid]['value'] is None for fid in fact_ids):
        return 'Unknown or null fact ID'
    if re.search(r'\bvacant\b', line, re.I):
        return 'Prohibited floor-status word'
    cited = [facts[fid] for fid in fact_ids]
    if any(f['kind'] == 'estimate' for f in cited) and 'looks like' not in line.casefold():
        return 'Estimate must say looks like'
    # Normalise common spoken numbers and multipliers before checking each mention.
    normalized = re.sub(r'\b(' + '|'.join(NUMBER_WORDS) + r')\b',
                        lambda m: str(NUMBER_WORDS[m[0].lower()]), line, flags=re.I)
    normalized = re.sub(r'(\d[\d,]*(?:\.\d+)?)\s+(1000|1000000)\b',
                        lambda m: str(float(m[1].replace(',', '')) * float(m[2])), normalized)
    for match in NUMBER.finditer(normalized):
        value = float(match[0].replace(',', ''))
        tail = normalized[match.end():].lstrip().casefold()
        unit = next((u for u, pattern in sorted(UNITS.items(), key=lambda x: -len(x[1]))
                     if re.match(pattern + r'\b', tail)), None)
        supported = False
        for fact in cited:
            expected = fact['value']
            if type(expected) in (int, float) and math.isclose(value, expected, rel_tol=.001, abs_tol=.005):
                if unit is None or unit == fact['unit']:
                    supported = True
            # Floor labels, capture dates, and ratio denominator come from the cited source clause.
            if unit is None and (match[0] in NUMBER.findall(fact.get('say_as') or '')
                                 or re.match(r'floor_' + re.escape(match[0]) + '_', fact['key'])):
                supported = True
            if value == 1000 and fact['unit'] == 'spaces_per_1000_sqft' and re.search(r'per\s*$', normalized[:match.start()], re.I):
                supported = True
        if impact and 'looks like' in line.casefold() and value in [v for v in impact.values() if type(v) in (int, float)]:
            supported = True
        if not supported:
            return 'Number or unit is not supported by cited evidence'
    return None


def fallback_line(fact_ids: list[str], dossier: dict) -> str:
    facts = {f['id']: f for f in safe_facts(dossier) if f['value'] is not None}
    fact = next((facts[fid] for fid in fact_ids if fid in facts), None)
    if not fact:
        return 'Darling, give me a grounded plan and we can talk.'
    line = fact_line(fact) or fact['say_as']
    if fact['kind'] == 'estimate' and 'looks like' not in line.casefold():
        line = 'It looks like ' + line[0].lower() + line[1:]
    return line
