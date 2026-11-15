"""Demo preset (DEMO_MODE=1) timers and the wake list rules."""
import pytest

from app.main import build_health
from app.rooms import DEFAULT_DURATIONS, Room, RoomError, phase_durations

HEROES = ['233953', '233899']  # Esperson and Wells Fargo Plaza, both with prepared personas


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


async def test_prepared_heroes_are_wakeable(game_mode, monkeypatch):
    monkeypatch.delenv('DEMO_MODE', raising=False)
    room = Room(code='TEST', hero_ids=HEROES, durations={})
    ids = room.wakeable_ids()
    assert '233953' in ids and '233899' in ids
    assert any(bid not in HEROES for bid in ids)  # context buildings with dark floors stay in normal play


async def test_unprepared_hero_is_not_wakeable(game_mode, monkeypatch):
    from app.data.fixtures import FixtureProvider
    monkeypatch.delenv('DEMO_MODE', raising=False)
    original = FixtureProvider.dossier
    def without_persona(self, bid):
        d = original(self, bid)
        if d is not None and bid == '233899':
            d.pop('persona', None)
        return d
    monkeypatch.setattr(FixtureProvider, 'dossier', without_persona)
    room = Room(code='TEST', hero_ids=HEROES, durations={})
    assert '233899' not in room.wakeable_ids()
    room.phase = 'EXPLORE'
    with pytest.raises(RoomError) as err:
        room.can_wake('233899')
    assert err.value.code == 'unknown_building'


async def test_demo_mode_wakes_prepared_demo_buildings_only(game_mode, monkeypatch):
    monkeypatch.setenv('DEMO_MODE', '1')
    monkeypatch.delenv('DEMO_BUILDING_IDS', raising=False)
    room = Room(code='TEST', hero_ids=HEROES, durations={})
    assert room.wakeable_ids() == ['233953', '233899']
    assert room.snapshot()['hero_building_ids'] == ['233953', '233899']
    room.phase = 'EXPLORE'
    with pytest.raises(RoomError):
        room.can_wake('233905')
    monkeypatch.setenv('DEMO_BUILDING_IDS', '233953')
    assert room.wakeable_ids() == ['233953']


@pytest.mark.parametrize('bid', ['233953', '233899'])
def test_parking_pitch_is_challenged_with_vexcel_evidence(game_mode, bid):
    """A6: at least one challenge cites a spatial fact from the dossier."""
    from datetime import datetime, timezone
    from app.agent import fake_agent
    from app.agent.grounding import check_line
    from app.data.provider import provider_for_mode
    from app.models import Pitch
    dossier = provider_for_mode(game_mode).dossier(bid)
    p = Pitch(player_id='p1', text='A drive-in movie night where neighbors park their cars nearby.',
              origin='web', at=datetime.now(timezone.utc))
    c = fake_agent.challenge(p, dossier)
    assert c.fact_ids == [f'F_{bid}_vexcel_detection_car']
    assert 'looks like' in c.line and c.line.endswith('Where would your crowd park?')
    assert check_line(c.line + ' ' + c.counteroffer, c.fact_ids, dossier) is None
    # Without cars or parking, the challenge keeps using area evidence.
    plain = fake_agent.challenge(p.model_copy(update={'text': 'A public community studio.'}), dossier)
    assert not any('vexcel' in fid for fid in plain.fact_ids)
