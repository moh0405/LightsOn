"""Server-side source IDs, units, numbers and cheap structured claim checks."""
from __future__ import annotations

import math
import re
from pydantic import BaseModel, ConfigDict

from .prompts import safe_facts
from .persona import fact_line

NUMBER = re.compile(r'(?<![\w])[-+]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:\s*[kK]\b)?')
NUMBER_WORDS = dict(zero=0, one=1, two=2, three=3, four=4, five=5, six=6, seven=7,
                    eight=8, nine=9, ten=10, eleven=11, twelve=12, twenty=20, hundred=100, thousand=1000, million=1000000)
UNITS = {'sqft': r'(?:sq\.?\s*ft\.?|square\s+feet|square\s+foot)', 'ft': r'(?:ft\.?|feet|foot)',
         'stories': r'(?:stories|storeys|floors)', 'year': r'(?:years?)',
         'percent': r'(?:%|percent\b|per\s+cent\b)',
         'spaces_per_1000_sqft': r'(?:spaces?\s+per\s+(?:1,?000|thousand)\s+(?:sq\.?\s*ft\.?|square\s+feet))'}


class ClaimCheck(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    supported: bool
    reason: str


class ClaimChecks(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    checks: list[ClaimCheck]


def number_value(text: str) -> float:
    text = text.replace(',', '').strip().lower()
    multiplier = 1000 if text.endswith('k') else 1
    return float(text[:-1] if multiplier != 1 else text) * multiplier


def number_unit(text: str) -> str | None:
    tail = text.lstrip(' -').casefold()
    return next((unit for unit, pattern in sorted(UNITS.items(), key=lambda item: -len(item[1]))
                 if re.match(pattern + r'(?!\w)', tail)), None)


def check_line(line: str, fact_ids: list[str], dossier: dict, impact: dict | None = None) -> str | None:
    facts = {f['id']: f for f in safe_facts(dossier)}
    if any(fid not in facts or facts[fid]['value'] is None for fid in fact_ids):
        return 'Unknown or null fact ID'
    if re.search(r'\bvacant\b', line, re.I):
        return 'Prohibited floor-status word'
    cited = [facts[fid] for fid in fact_ids]
    duration = re.search(r'\b(?:been|stayed|sat|stood|remained)\s+(?:dark|empty|unlit)\s+(?:for|since)\b', line, re.I)
    if duration and not any(duration[0].casefold() in (f.get('say_as') or '').casefold() for f in cited):
        return 'Historical floor-status duration is not supported by current-status facts'
    if any(f['kind'] == 'estimate' for f in cited) and 'looks like' not in line.casefold():
        return 'Estimate must say looks like'
    # Quantified physical claims use number words; conversational "one idea" or
    # "two of you" is game dialogue, left to the semantic claim check.
    def spoken_number(match):
        after = line[match.end():]
        before = line[:match.start()]
        clause = re.split(r'[.!?;:]', before)[-1]
        hypothetical = re.search(r'\b(?:start|propose|imagine|try|could|would|should|pitch)\b', clause, re.I)
        asserted = re.search(r'\b(?:i|we)\s+(?:have|had|own|contain|offer|rise|stand)\b', clause, re.I)
        if (match[0].casefold() == 'one' and re.match(r'\s+floor\b', after, re.I)
                and hypothetical and not asserted):
            return match[0]  # "start on one floor" proposes a plan, not an existing floor count
        physical = (number_unit(after) is not None
                    or re.match(r'\s+(?:dark\s+)?(?:floors?|trees?|cars?|entries|spaces?|thousand|million)\b', after, re.I)
                    or re.search(r'\bfloor\s*$', before, re.I))
        return str(NUMBER_WORDS[match[0].lower()]) if physical else match[0]
    normalized = re.sub(r'\b(' + '|'.join(NUMBER_WORDS) + r')\b',
                        spoken_number, line, flags=re.I)
    normalized = re.sub(r'(\d[\d,]*(?:\.\d+)?)\s+(1000|1000000)\b',
                        lambda m: str(float(m[1].replace(',', '')) * float(m[2])), normalized)
    for match in NUMBER.finditer(normalized):
        value = number_value(match[0])
        unit = number_unit(normalized[match.end():])
        supported = False
        for fact in cited:
            expected = fact['value']
            exact = (fact['key'].startswith('construction_') or fact['key'] in
                     {'yearBuilt', 'yearRenovated', 'numStoriesAboveGrade', 'dark_floor_count'})
            if type(expected) in (int, float) and math.isclose(value, expected,
                    rel_tol=0 if exact else .001, abs_tol=0 if exact else .005):
                fact_unit = fact['unit'] or {'numStoriesAboveGrade': 'stories', 'parkingRatio': 'spaces_per_1000_sqft'}.get(fact['key'])
                if unit is None or unit == fact_unit:
                    supported = True
            # Floor IDs are labels only in floor context, never arbitrary counts.
            floor = re.match(r'floor_(-?\d+)_', fact['key'])
            if unit is None and floor and value == int(floor[1]) and (
                    re.search(r'\bfloor\s*$', normalized[:match.start()], re.I)
                    or re.match(r'(?:st|nd|rd|th)\s+floor\b', normalized[match.end():], re.I)):
                supported = True
            # Preserve quantities explicitly rendered by say_as, including percentages
            # inside aggregate text. Never convert unrelated values into percentages.
            source = fact.get('say_as') or ''
            if any(value == number_value(m[0]) and unit == number_unit(source[m.end():])
                   for m in NUMBER.finditer(source)):
                supported = True
            if value == 1000 and fact['key'] == 'parkingRatio' and re.search(r'per\s*$', normalized[:match.start()], re.I):
                supported = True
        if impact and 'looks like' in line.casefold() and value in [v for v in impact.values() if type(v) in (int, float)]:
            supported = True
        if not supported:
            return f'Number {match[0]} ({unit or "unspecified unit"}) is not supported by cited evidence; omit it or use a cited value'
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
