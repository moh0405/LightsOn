"""Use the local office index to authorize prepared kit dossiers."""
import sqlite3
from pathlib import Path

from .fixtures import FixtureProvider


class KitProvider(FixtureProvider):
    def __init__(self, index: Path, directory: Path, heroes: set[str]):
        super().__init__(directory, heroes)
        self.index = index

    def dossier(self, property_id: str) -> dict | None:
        if not property_id.isdecimal():
            return None
        with sqlite3.connect(f'file:{self.index}?mode=ro', uri=True) as db:
            if db.execute('SELECT 1 FROM properties WHERE id=?', (property_id,)).fetchone() is None:
                return None
        result = super().dossier(property_id)
        if result is not None:
            result['data_mode'] = 'kit'
        return result
