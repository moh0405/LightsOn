"""Committed, real-data dossiers for deterministic offline use."""
import json
from pathlib import Path

from .provider import summary


class FixtureProvider:
    def __init__(self, directory: Path, heroes: set[str]):
        self.directory = directory
        self.heroes = heroes

    def dossier(self, property_id: str) -> dict | None:
        # Exact filename matching also prevents path traversal.
        if not property_id.isdecimal():
            return None
        path = self.directory / f'{property_id}.json'
        if not path.is_file():
            return None
        result = json.loads(path.read_text())
        result['data_mode'] = 'fixtures'
        return result

    def buildings(self) -> list[dict]:
        return [summary(d, self.heroes) for path in sorted(self.directory.glob('*.json'))
                if (d := self.dossier(path.stem)) is not None]
