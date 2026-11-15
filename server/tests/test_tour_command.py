import pytest
from app.commands import CommandService
from app.rooms import RoomManager, Conn, RoomError


async def test_host_tour_is_screen_only_without_round_mutation(tmp_path, monkeypatch):
    monkeypatch.setenv('HOST_PIN', '1234')
    monkeypatch.setenv('DATA_MODE', 'fixtures')
    manager = RoomManager(['233953'], tmp_path)
    room = manager.create()
    events, phone_events = [], []
    async def screen_send(event): events.append(event)
    async def phone_send(event): phone_events.append(event)
    room.conns.append(Conn(role='screen', send=screen_send))
    room.conns.append(Conn(role='play', send=phone_send))
    commands = CommandService(manager)
    command = {'type': 'host_action', 'room': room.code, 'pin': '1234', 'action': 'walk_inside',
               'building_id': '233953', 'model_id': 'Wtxv2Mp8uQE', 'open': True}
    before = room.snapshot()
    try:
        for overrides in [{'pin': 'wrong'}, {'open': 'yes'}, {'building_id': '999999999'}, {'model_id': '../bad'}]:
            with pytest.raises(RoomError):
                await commands.handle({**command, **overrides}, 'host')
        with pytest.raises(RoomError):
            await commands.handle(command, 'web')
        assert not events
        await commands.handle(command, 'host')
        assert events[-1] == {'type': 'tour_requested', 'building_id': '233953', 'model_id': 'Wtxv2Mp8uQE', 'open': True}
        assert room.snapshot() == before
        await commands.handle({**command, 'open': False}, 'host')
        assert events[-1] == {'type': 'tour_requested', 'building_id': None, 'model_id': None, 'open': False}
        assert not phone_events
        assert room.snapshot() == before
    finally:
        manager.close()
