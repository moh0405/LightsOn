"""Server-side source IDs, units, numbers and cheap structured claim checks."""
from __future__ import annotations

import math
from decimal import Decimal
import re
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

from .prompts import safe_facts
from .persona import fact_line

NUMBER = re.compile(r'(?<![\w])[-+]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:\s*[kK]\b)?')
NUMBER_WORDS = dict(zero=0, one=1, two=2, three=3, four=4, five=5, six=6, seven=7,
                    eight=8, nine=9, ten=10, eleven=11, twelve=12, thirteen=13, fourteen=14, fifteen=15,
                    sixteen=16, seventeen=17, eighteen=18, nineteen=19, twenty=20, thirty=30, forty=40,
                    fifty=50, sixty=60, seventy=70, eighty=80, ninety=90,
                    hundred=100, thousand=1000, million=1000000, billion=1000000000)
_WORD = '(?:' + '|'.join(sorted(NUMBER_WORDS, key=len, reverse=True)) + ')'
# Unit words that may follow a hyphenated number: "twenty-seven-story", "nine-million-square-foot".
_HYPHEN_UNIT = r'(?:square|sq\b|stor(?:y|ey|ies|eys)\b|floors?\b|foot\b|feet\b|ft\b|years?\b|percent\b)'
HYPHEN_NUMBER = re.compile(rf'\b{_WORD}(?:-{_WORD})+\b', re.I)
UNITS = {'sqft': r'(?:sq\.?\s*ft\.?|square\s+feet|square\s+foot)', 'ft': r'(?:ft\.?|feet|foot)',
         'stories': r'(?:stories|storeys|story|storey|floors)', 'year': r'(?:years?)',
         'percent': r'(?:%|percent\b|per\s+cent\b)',
         'spaces_per_1000_sqft': r'(?:spaces?\s+per\s+(?:1,?000|thousand)\s+(?:sq\.?\s*ft\.?|square\s+feet))'}


class ClaimCheck(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    index: int = Field(ge=0)
    supported: bool
    reason: str


class ClaimChecks(BaseModel):
    # Malformed/missing entries are unsupported claims, not a malformed verdict.
    model_config = ConfigDict(extra='ignore', strict=True)
    checks: list[ClaimCheck] = Field(default_factory=list)

    @field_validator('checks', mode='before')
    @classmethod
    def parse_entries(cls, rows):
        if not isinstance(rows, list):
            return []
        parsed = []
        for row in rows:
            try:
                parsed.append(ClaimCheck.model_validate(row))
            except ValidationError:
                # Keep an identifiable malformed result so a duplicate valid one
                # cannot hide it. Unidentifiable entries cannot support any claim.
                index = row.get('index') if isinstance(row, dict) else None
                if type(index) is int and index >= 0:
                    parsed.append(ClaimCheck(index=index, supported=False, reason='Unparsed claim result'))
        return parsed


def number_value(text: str) -> float:
    text = text.replace(',', '').strip().lower()
    multiplier = 1000 if text.endswith('k') else 1
    return float(text[:-1] if multiplier != 1 else text) * multiplier


def number_unit(text: str) -> str | None:
    tail = text.lstrip(' -').casefold()
    return next((unit for unit, pattern in sorted(UNITS.items(), key=lambda item: -len(item[1]))
                 if re.match(pattern + r'(?!\w)', tail)), None)


def words_value(words: str) -> int:
    """Value of number words joined by hyphens or spaces: "twenty-seven" -> 27, "nine-million" -> 9000000."""
    total = current = 0
    for word in re.split(r'[-\s]+', words.strip().lower()):
        value = NUMBER_WORDS[word]
        if value == 100:
            current = (current or 1) * 100
        elif value >= 1000:
            total += (current or 1) * value
            current = 0
        else:
            current += value
    return total + current


def _compound(words: str) -> bool:
    """A real compound ("twenty-seven", "one-hundred-twenty"), not a phrase like "one-two"."""
    values = [NUMBER_WORDS[w] for w in words.lower().split('-')]
    return len(values) > 1 and all(not (a < 100 and b < 100) or (a % 10 == 0 and 20 <= a <= 90 and 1 <= b <= 9)
                                   for a, b in zip(values, values[1:]))


def hyphen_numbers(line: str) -> str:
    """Rewrite hyphenated number words as digits so they get the same check as "27 stories".
    Conversational hyphens ("one-of-a-kind", "one-two punch") are left alone."""
    line = HYPHEN_NUMBER.sub(lambda m: str(words_value(m[0])) if _compound(m[0]) else m[0], line)
    # "27-story" and "forty-story" read as "27 story" and "forty story"; a single word stays a word
    # so the plan rules below still treat "a one-floor pilot" as a proposal.
    line = re.sub(rf'(\d|\b{_WORD})-(?={_HYPHEN_UNIT})', r'\1 ', line, flags=re.I)
    return re.sub(r'\bsquare-(foot|feet)\b', r'square \1', line, flags=re.I)


MAGNITUDES = {'k': 1000, 'm': 1000000, 'b': 1000000000,
              'thousand': 1000, 'million': 1000000, 'billion': 1000000000}
MAGNITUDE = re.compile(
    rf'(?<![\w.])(?P<amount>[-+]?(?:\d{{1,3}}(?:,\d{{3}})+|\d+)(?:\.\d+)?|'
    rf'half(?:\s+a)?|{_WORD}(?:[ -]+{_WORD})*)'
    r'(?:(?:[ -]+)(?P<word>thousand|million|billion)|(?P<suffix>[kmb]))\b', re.I)


def normalize_magnitudes(line: str) -> str:
    """Expand whole quantities before any per-word or per-number checks."""
    def expand(match):
        amount = match['amount'].casefold()
        value = (Decimal('.5') if amount.startswith('half') else
                 Decimal(amount.replace(',', '')) if re.match(r'[-+]?\d', amount) else
                 Decimal(words_value(amount)))
        scale = MAGNITUDES[(match['word'] or match['suffix']).casefold()]
        return format(value * scale, 'f')
    return MAGNITUDE.sub(expand, hyphen_numbers(line))


SCORE_MAX = 40  # four 0-10 scores; the server clamps and totals them


def game_number(text: str, start: int, end: int, value: float, unit: str | None) -> bool:
    """Scores and player/pitch counts or labels are game dialogue, never building facts."""
    if unit is not None or value != int(value) or not 0 <= value <= SCORE_MAX:
        return False
    before, after = text[:start], text[end:]
    if re.match(r'\s*(?:/|out\s+of\b)\s*(?:10|40)\b', after, re.I):
        return True  # "9/10", "34 out of 40"
    if value in (10, SCORE_MAX) and re.search(r'(?:/|\bout\s+of)\s*$', before, re.I):
        return True  # the denominator
    if re.match(r'(?:st|nd|rd|th)?\s+(?:players?|pitch(?:es)?|candidates?|revisions?)\b', after, re.I):
        return True  # "2 pitches", "3 players", "your 2nd pitch"
    if re.search(r'\b(?:players?|pitch|candidate|revision)\s*#?\s*$', before, re.I):
        return True  # "player 2", "candidate 1"
    # A score word directly before the number, and nothing countable after it:
    # "scored 31 points", "a total of 33.", but never "a total of 30 elevators".
    return bool(re.search(r'\b(?:scor(?:e|es|ed|ing)|total(?:s|led)?|data\s+fit|neighborhood\s+fit|'
                          r'creativity|charm)\s+(?:of\s+|a\s+|an\s+|at\s+)?$', before, re.I)
                and re.match(r'(?:\s*$|\s*[,.;:!?)\u2014\u2013]|\s+points?\b|\s+(?:and|for|in|from|to|with)\b)', after, re.I))


def quoted_numbers(texts: list[str] | None) -> set[tuple[float, str | None]]:
    """(value, unit) pairs written in player pitches, normalized like dialogue."""
    found = set()
    for text in texts or []:
        text = normalize_magnitudes(text)
        text = re.sub(r'\b(' + '|'.join(NUMBER_WORDS) + r')\b', lambda m: str(NUMBER_WORDS[m[0].lower()]), text, flags=re.I)
        text = re.sub(r'(\d[\d,]*(?:\.\d+)?)\s+(1000|1000000)\b',
                      lambda m: str(float(m[1].replace(',', '')) * float(m[2])), text)
        found |= {(number_value(m[0]), number_unit(text[m.end():])) for m in NUMBER.finditer(text)}
    return found


def fact_number_matches(value: float, unit: str | None, fact: dict) -> bool:
    expected = fact['value']
    exact = (fact['key'].startswith('construction_') or fact['key'] in
             {'yearBuilt', 'yearRenovated', 'numStoriesAboveGrade', 'dark_floor_count'})
    fact_unit = fact['unit'] or {'numStoriesAboveGrade': 'stories', 'parkingRatio': 'spaces_per_1000_sqft'}.get(fact['key'])
    return (type(expected) in (int, float) and (unit is None or unit == fact_unit)
            and math.isclose(value, expected, rel_tol=0 if exact else .001, abs_tol=0 if exact else .005))


def repair_citations(line: str, fact_ids: list[str], dossier: dict, quoted: list[str]) -> list[str]:
    """Append only unambiguous number+unit evidence; never replace invalid IDs.

    Existing citations resolve ambiguity. Pitch quantities are not building evidence,
    and unitless labels cannot acquire citations by guessing. All checks still run.
    """
    refs = list(fact_ids)
    facts = safe_facts(dossier)
    pitched = quoted_numbers(quoted)
    for value, unit in sorted(quoted_numbers([line]), key=lambda pair: (pair[0], pair[1] or '')):
        if unit is None or (value, unit) in pitched:
            continue
        matches = [f['id'] for f in facts if fact_number_matches(value, unit, f)]
        if any(fid in refs for fid in matches):
            continue
        if len(matches) == 1:
            refs.append(matches[0])
    return refs


def pitch_quantity(value: float, unit: str | None, pitched: set[tuple[float, str | None]], before: str, after: str) -> bool:
    # A missing unit may borrow the player's unit; an explicit wrong unit may not.
    if not any(value == v and u is not None and (unit is None or unit == u) for v, u in pitched):
        return False
    # An unrecognized explicit unit (cars, meters, etc.) is not an omitted unit.
    if unit is None and not re.match(
            r"(?:\s*$|\s*[,.;:!?—–)]|\s+(?:is|are|was|were|would|could|should|will|won.t|can.t|seems?|looks?|sounds?|feels?|on|onto|into|for)\b)",
            after, re.I):
        return False
    clause = re.split(r'[.!?;:\u2014\u2013]', before)[-1]
    # Quoting a player never establishes building dimensions or inventory.
    return not re.search(r"\b(?:(?:my|our|this building.s)\s+(?:typical\s+)?(?:floor|building|height|area|space|capacity)|"
                         r"(?:i|we|this building)\s+(?:have|has|offer|contain|stand|rise|give))\b", clause, re.I)


def check_line(line: str, fact_ids: list[str], dossier: dict, impact: dict | None = None,
               quoted: list[str] | None = None) -> str | None:
    """quoted: relevant pitch texts (only this player for a challenge).
    Dialogue may repeat a pitched quantity with its unit or borrow an omitted unit;
    the pitch never supplies evidence of building dimensions or capacity.
    """
    facts = {f['id']: f for f in safe_facts(dossier)}
    if any(fid not in facts or facts[fid]['value'] is None for fid in fact_ids):
        return 'Unknown or null fact ID'
    if re.search(r'\bvacant\b', line, re.I):
        return 'Prohibited floor-status word'
    cited = [facts[fid] for fid in fact_ids]
    # Current status and a construction date do not prove a duration. Require
    # explicit matching duration wording in cited source evidence, in either order.
    durations = list(re.finditer(r'\b(?:for\s+(?:(?:many|several)\s+)?(?:years|decades|centuries)|'
                                r'(?:years|decades|centuries)\s+of|'
                                r'(?:spent|waited|waiting)\s+(?:years|decades|centuries)|'
                                r'(?:been|stayed|sat|stood|remained)\s+(?:dark|empty|unlit)\s+since\b)', line, re.I))
    if any(not any(d[0].casefold() in (f.get('say_as') or '').casefold() for f in cited) for d in durations):
        return 'Historical duration is not supported by cited facts'
    if any(f['kind'] == 'estimate' for f in cited) and 'looks like' not in line.casefold():
        return 'Estimate must say looks like'
    # Quantified physical claims use number words; conversational "one idea" or
    # "two of you" is game dialogue, left to the semantic claim check.
    line = normalize_magnitudes(line)
    def spoken_number(match):
        after = line[match.end():]
        before = line[:match.start()]
        clause = re.split(r'[.!?;:]', before)[-1]
        hypothetical = re.search(r'\b(?:start|propose|imagine|try|could|would|should|pitch|give\s+me|show\s+me|bring\s+me|fits?)\b', clause, re.I)
        asserted = re.search(r'\b(?:i|we|this building)\s+(?:have|has|had|own|contain|offer|rise|stand)\b', clause, re.I)
        # "a restaurant on one floor" restates a pitch's plan, like "fits one floor".
        placed = re.search(r'\b(?:on|onto|into)\s+$', before, re.I)
        pilot = (re.search(r'\ba\s+$', before, re.I)
                 and re.match(r'\s+floor\s+pilot\b', after, re.I))
        if (match[0].casefold() == 'one' and re.match(r'\s+floor\b', after, re.I)
                and (hypothetical or placed or pilot) and not asserted):
            return match[0]  # "start on one floor" proposes a plan, not an existing floor count
        physical = (number_unit(after) is not None
                    or re.match(r'\s+(?:dark\s+)?(?:floors?|trees?|cars?|entries|spaces?|thousand|million)\b', after, re.I)
                    or re.search(r'\bfloor\s*$', before, re.I))
        return str(NUMBER_WORDS[match[0].lower()]) if physical else match[0]
    normalized = re.sub(r'\b(' + '|'.join(NUMBER_WORDS) + r')\b',
                        spoken_number, line, flags=re.I)
    normalized = re.sub(r'(\d[\d,]*(?:\.\d+)?)\s+(1000|1000000)\b',
                        lambda m: str(float(m[1].replace(',', '')) * float(m[2])), normalized)
    pitched = quoted_numbers(quoted)
    for match in NUMBER.finditer(normalized):
        value = number_value(match[0])
        unit = number_unit(normalized[match.end():])
        supported = False
        for fact in cited:
            if fact_number_matches(value, unit, fact):
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
        if pitch_quantity(value, unit, pitched, normalized[:match.start()], normalized[match.end():]):
            supported = True
        if game_number(normalized, match.start(), match.end(), value, unit):
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


INTERNAL_LABEL = r'candidate[_ ]?\d+|p\d+'


def name_players(text: str, aliases: dict[str, str]) -> str | None:
    """Replace internal player labels (candidate_N, pN, player ids) with nicknames.
    Returns None when a label remains that maps to no player, so the line is rejected."""
    lookup = {' '.join(k.lower().replace('_', ' ').split()): v for k, v in aliases.items()}
    known = sorted((re.escape(k) for k in aliases), key=len, reverse=True)
    pattern = re.compile(r'\b(' + '|'.join([*known, INTERNAL_LABEL]) + r')\b', re.I)
    unknown = False
    def swap(match):
        nonlocal unknown
        name = lookup.get(' '.join(match.group(1).lower().replace('_', ' ').split()))
        if name is None:
            unknown = True
            return match.group(1)
        return name
    named = pattern.sub(swap, text)
    return None if unknown else named
