"""Deterministic source status; marketing availability is distinct from occupancy."""
from typing import Literal

FloorStatus = Literal['dark', 'partial', 'occupied', 'unknown']


def floor_status(available: float, occupied: float, size: float | None, name: str) -> FloorStatus:
    if name in {'Unknown', 'UnknownFloor'}:
        return 'unknown'
    if available > 0 and size is not None and available >= .9 * size and occupied == 0:
        return 'dark'
    if available > 0:
        return 'partial'
    if occupied > 0:
        return 'occupied'
    return 'unknown'


def floor_numbers(enums: dict) -> dict[str, int]:
    """Ordinal floor names in the enum, excluding mezzanine and other special levels."""
    names = [name for _, name in sorted(enums['FloorName'].items(), key=lambda x: int(x[0]))
             if name.endswith('Floor') and name not in {'UnknownFloor', 'PrincipalFloor'}]
    return {name: n for n, name in enumerate(names, 1)}
