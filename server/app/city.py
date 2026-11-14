"""Fictional game meters and deterministic shared progression."""
from __future__ import annotations

from dataclasses import dataclass, field
from math import floor

START_NEEDS = {'housing': 40, 'food_retail': 30, 'entertainment': 15, 'community': 35}
FEEDS = {'housing': 'housing', 'food_retail': 'food_retail', 'entertainment': 'entertainment',
         'culture': 'entertainment', 'community': 'community', 'health': 'community'}


def most_needed(needs: dict) -> str:
    return min(START_NEEDS, key=lambda key: needs[key])


def needs_bonus(category: str, needs: dict) -> int:
    return 2 if FEEDS.get(category) == most_needed(needs) else 0


def housing_impact(sqft: int) -> dict:
    units = floor(sqft * .75 / 850)
    return {'kind': 'housing_estimate', 'sqft': sqft, 'units': units, 'residents': round(units * 1.9),
            'label': 'rough game estimate, not a feasibility claim'}


def analyst_line(needs: dict) -> str:
    return {
        'housing': 'City needs (game simulation): bring me places to live.',
        'food_retail': 'City needs (game simulation): bring me food and shops.',
        'entertainment': 'City needs (game simulation): bring me something fun.',
        'community': 'City needs (game simulation): bring me places to connect.',
    }[most_needed(needs)]


@dataclass
class City:
    needs: dict = field(default_factory=lambda: dict(START_NEEDS))
    buildings_revived: int = 0
    sqft_reimagined: int = 0
    song_categories: list[str] = field(default_factory=list)
    counted: dict[str, list[int]] = field(default_factory=dict)

    def revive(self, building_id: str, floors: list[int], category: str, sqft: int) -> None:
        seen = self.counted.get(building_id, [])
        if not floors or all(number in seen for number in floors):
            return
        # The caller passes only fresh floors, with their server-verified area.
        if any(number in seen for number in floors):
            raise ValueError('Revival must contain only fresh floors.')
        self.buildings_revived += int(not seen)
        self.counted[building_id] = sorted(set(seen) | set(floors))
        self.sqft_reimagined += sqft
        if category not in self.song_categories and len(self.song_categories) < 8:
            self.song_categories.append(category)
        need = FEEDS.get(category)
        if need:
            self.needs[need] = min(100, self.needs[need] + min(30, sqft / 1000))

    @property
    def song_layers(self) -> int:
        return len(self.song_categories)

    def snapshot(self) -> dict:
        return {'buildings_revived': self.buildings_revived, 'sqft_reimagined': self.sqft_reimagined,
                'needs': dict(self.needs), 'most_needed': most_needed(self.needs), 'song_layers': self.song_layers,
                'song_categories': list(self.song_categories)}
