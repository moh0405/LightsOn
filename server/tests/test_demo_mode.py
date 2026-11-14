"""Demo preset (DEMO_MODE=1) timers and the wake list rules."""
import pytest

from app.main import build_health
from app.rooms import DEFAULT_DURATIONS, Room, RoomError, phase_durations

HEROES = ['233953', '233899']  # Esperson (prepared persona), Wells Fargo Plaza (no persona)


def test_demo_preset_shortens_pitch_and_negotiate_only(monkeypatch):
    monkeypatch.delenv('DEMO_MODE', raising=False)
    assert phase_durations() == DEFAULT_DURATIONS
    monkeypatch.setenv('DEMO_MODE', '1')
    demo = phase_durations()
    assert demo['PITCH'] == 20 and demo['NEGOTIATE'] == 15
    assert {k: v for k, v in demo.items() if k not in ('PITCH', 'NEGOTIATE')} == \
        {k: v for k, v in DEFAULT_DURATIONS.items() if k not in ('PITCH', 'NEGOTIATE')}
    assert phase_durations(.5)['PITCH'] == 10 and phase_durations(.5)['LOBBY'] is None
    assert build_health()['demo_mode'] is True


async def test_unprepared_hero_is_not_wakeable(game_mode, monkeypatch):
    monkeypatch.delenv('DEMO_MODE', raising=False)
    room = Room(code='TEST', hero_ids=HEROES, durations={})
    ids = room.wakeable_ids()
    assert '233953' in ids and '233899' not in ids
    assert any(bid not in HEROES for bid in ids)  # context buildings with dark floors stay in normal play
    room.phase = 'EXPLORE'
    with pytest.raises(RoomError) as err:
        room.can_wake('233899')
    assert err.value.code == 'unknown_building'


async def test_demo_mode_wakes_esperson_only(game_mode, monkeypatch):
    monkeypatch.setenv('DEMO_MODE', '1')
    monkeypatch.delenv('DEMO_BUILDING_IDS', raising=False)
    room = Room(code='TEST', hero_ids=HEROES, durations={})
    assert room.wakeable_ids() == ['233953']
    assert room.snapshot()['hero_building_ids'] == ['233953']
    room.phase = 'EXPLORE'
    with pytest.raises(RoomError):
        room.can_wake('233905')
    # A demo list cannot smuggle in an unprepared building.
    monkeypatch.setenv('DEMO_BUILDING_IDS', '233953,233899,233905')
    assert room.wakeable_ids() == ['233953']
