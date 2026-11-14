"""Read-only building access, chosen by DATA_MODE."""
import os
from pathlib import Path
from typing import Protocol

ROOT = Path(__file__).resolve().parents[3]
DEFAULT_DOSSIERS = ROOT / 'server/fixtures/dossiers'


class DataProvider(Protocol):
    def buildings(self) -> list[dict]: ...
    def dossier(self, property_id: str) -> dict | None: ...


def summary(dossier: dict, heroes: set[str]) -> dict:
    dark = [f for f in dossier['floors'] if f['source_status'] == 'dark']
    return {**{k: dossier[k] for k in ['id', 'name', 'lat', 'lng', 'stories']},
            'is_hero': dossier['id'] in heroes, 'dark_floors': len(dark),
            'dark_sqft': None if any(f['size_sqft'] is None for f in dark)
            else int(sum(f['size_sqft'] for f in dark))}


def get_provider() -> DataProvider:
    return provider_for_mode(os.getenv('DATA_MODE') or 'kit')


def provider_for_mode(mode: str) -> DataProvider:
    from .fixtures import FixtureProvider
    from .kit import KitProvider
    heroes = {x.strip() for x in os.getenv('HERO_PROPERTY_IDS', '233953,233899').split(',') if x.strip()}
    if mode == 'fixtures':
        return FixtureProvider(DEFAULT_DOSSIERS, heroes)
    if mode == 'kit':
        kit = Path(os.getenv('COSTAR_DATA_DIR') or 'data/costar')
        if not kit.is_absolute():
            kit = ROOT / kit
        return KitProvider(kit / 'index.sqlite', DEFAULT_DOSSIERS, heroes)
    raise ValueError(f'Unsupported DATA_MODE: {mode}')
