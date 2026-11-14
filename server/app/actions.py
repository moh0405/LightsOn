"""Validate agent proposals; only the server computes scores and physical impact."""
from __future__ import annotations

from .agent.fake_agent import classify_use, desire, desire_met
from .city import City, housing_impact, needs_bonus
from .models import Pitch, Score, Verdict, VerdictProposal


class ActionError(ValueError):
    pass


def _floor_area(dossier: dict, floor: dict) -> int:
    if floor.get('source_status') != 'dark':
        return 0
    area = floor.get('available_sqft')
    if not isinstance(area, (int, float)) or isinstance(area, bool) or area <= 0:
        return 0
    if not any(f['id'] in floor.get('fact_ids', []) and f['kind'] == 'verified'
               and f['key'].endswith('_available_sqft') and f['value'] == area
               for f in dossier.get('facts', [])):
        return 0
    return int(area)


def select_target_floors(dossier: dict, revived: set[int] | None = None) -> list[int]:
    candidates = sorted(f['number'] for f in dossier.get('floors', [])
                        if isinstance(f.get('number'), int) and f['number'] not in (revived or set())
                        and _floor_area(dossier, f))
    result = []
    for number in candidates:
        if result and number != result[-1] + 1:
            break
        result.append(number)
        if len(result) == 4:
            break
    return result


def target_sqft(dossier: dict, floors: list[int]) -> int:
    return sum(_floor_area(dossier, f) for f in dossier.get('floors', []) if f.get('number') in set(floors))


def validate_verdict(batches: list[tuple[VerdictProposal, list[Pitch]]], *, dossier: dict,
                     player_ids: set[str], round_id: str, city: City, sqft: int) -> Verdict:
    if not batches or not batches[0][1]:
        raise ActionError('No pitches to score.')
    originals = {p.player_id for p in batches[0][1]}
    if not originals <= player_ids:
        raise ActionError('A pitch belongs to a player outside the room.')
    fact_ids = {f['id'] for f in dossier.get('facts', []) if f.get('value') is not None}
    best: dict[str, tuple[Score, Pitch, VerdictProposal, list[str]]] = {}
    final_at = {}
    for proposal, pitches in batches:
        expected = {p.player_id for p in pitches}
        actual = [s.player_id for s in proposal.scores]
        if (proposal.winner_player_id not in expected or not expected <= originals
                or len(actual) != len(set(actual)) or set(actual) != expected):
            raise ActionError('Proposal winner and scores must belong to the players who pitched.')
        cited = list(dict.fromkeys(fid for fid in proposal.fact_ids if fid in fact_ids))
        by_id = {p.player_id: p for p in pitches}
        for proposed in proposal.scores:
            p = by_id[proposed.player_id]
            final_at[p.player_id] = max(final_at.get(p.player_id, p.at), p.at)
            clamp = lambda value: min(10, max(0, value))
            bonus = needs_bonus(classify_use(p.text), city.needs)
            score = Score(player_id=p.player_id, data_fit=min(clamp(proposed.data_fit), 10 if cited else 5),
                neighborhood_fit=min(10, clamp(proposed.neighborhood_fit) + bonus),
                creativity=clamp(proposed.creativity), charm=clamp(proposed.charm), needs_bonus=bonus)
            score.total = score.data_fit + score.neighborhood_fit + score.creativity + score.charm
            previous = best.get(p.player_id)
            if previous is None or (score.total, score.creativity) >= (previous[0].total, previous[0].creativity):
                best[p.player_id] = (score, p, proposal, cited)
    winner = max(best, key=lambda pid: (best[pid][0].total, best[pid][0].creativity, -final_at[pid].timestamp()))
    _, pitch, proposal, cited = best[winner]
    category = classify_use(pitch.text)
    return Verdict(round_id=round_id, winner_player_id=winner, scores=[item[0] for item in best.values()],
        reason_line=proposal.reason_line, fact_ids=cited, category=category,
        desire_met=desire_met(pitch.text, dossier), desire_reveal=desire(dossier),
        impact=housing_impact(sqft) if category == 'housing' else None)
