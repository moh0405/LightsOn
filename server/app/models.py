"""Core models. Source of truth for types; run scripts/gen_types.py after changing."""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel

Phase = Literal["LOBBY", "EXPLORE", "INTRO", "PITCH", "CHALLENGE", "NEGOTIATE", "VERDICT", "POWER_UP", "REVIVED"]
Category = Literal["housing", "food_retail", "entertainment", "community", "culture", "health", "work", "wildcard"]


class Fact(BaseModel):
    id: str
    key: str
    value: str | float | int | bool | None
    unit: str | None
    source: Literal["costar", "matterport", "vexcel+vision", "osm", "derived"]
    source_field: str
    kind: Literal["verified", "estimate"]
    say_as: str


class HardLimit(BaseModel):
    fact_ref: str
    constraint: Literal['floor_plate', 'dark_area', 'height', 'parking']
    rejects_categories: list[Category]
    text: str


class Persona(BaseModel):
    building_id: str
    name: str
    voice_style: str
    voice_id: str
    mood_baseline: Literal["lonely", "proud", "bitter", "anxious", "hopeful"]
    desire_key: str
    desire_text: str
    hard_limits: list[HardLimit]
    hard_limits_empty_reason: str | None
    backstory: list[dict]  # {text, fact_ref | None, fiction: bool}
    catchphrase: str
    intro_line: str
    signature_sound: str
    neighbor_lines: dict[str, str]


class Pitch(BaseModel):
    player_id: str
    text: str
    origin: Literal["web", "voice", "imessage"]
    revision: bool = False
    at: datetime


class Challenge(BaseModel):
    player_id: str
    line: str
    fact_ids: list[str]
    counteroffer: str
    category_guess: Category


class Score(BaseModel):
    player_id: str
    data_fit: int
    neighborhood_fit: int
    creativity: int
    charm: int
    needs_bonus: int = 0
    total: int = 0  # computed by server


class Verdict(BaseModel):
    round_id: str
    winner_player_id: str
    scores: list[Score]
    reason_line: str
    fact_ids: list[str]
    category: Category
    desire_met: bool
    desire_reveal: str
    impact: dict | None  # housing only, labeled estimate


class ProposalScore(BaseModel):
    player_id: str
    data_fit: int
    neighborhood_fit: int
    creativity: int
    charm: int


class VerdictProposal(BaseModel):
    winner_player_id: str
    scores: list[ProposalScore]
    reason_line: str
    fact_ids: list[str]
    category: Category
    desire_met: bool
    desire_reveal: str
