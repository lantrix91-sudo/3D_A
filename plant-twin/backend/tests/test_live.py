import time

import pytest
from asgiref.sync import async_to_sync
from channels.db import database_sync_to_async
from channels.testing import WebsocketCommunicator
from django.contrib.auth.models import Group
from rest_framework_simplejwt.tokens import AccessToken

from config.asgi import application
from equipment.ingest import ingest
from equipment.models import Equipment, EquipmentType
from plants.models import Plant, Zone

# Consumer читает БД из другого потока — нужны настоящие коммиты.
pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture
def device():
    zone = Zone.objects.create(plant=Plant.objects.create(code="p", name="Завод"), code="z", name="Цех")
    kind = EquipmentType.objects.create(code="press", name="Пресс", signal_templates=[
        {"key": "state", "name": "Состояние", "unit": "", "kind": "state"},
        {"key": "force", "name": "Усилие", "unit": "кН", "kind": "number"}])
    return Equipment.objects.create(code="press-1", name="Пресс", zone=zone, type=kind, device_id="press-dev")


def token_for(user, role="operator"):
    if role:
        user.groups.add(Group.objects.get_or_create(name=role)[0])
    return str(AccessToken.for_user(user))


async def open_socket(token):
    communicator = WebsocketCommunicator(application, f"/ws/v1/live/?token={token}")
    connected, _ = await communicator.connect()
    assert connected
    return communicator


def test_snapshot_then_live_updates(user, device):
    ingest("press-dev", {"state": "stop", "force": 1.5}, ts=time.time() - 5)
    token = token_for(user)

    async def scenario():
        socket = await open_socket(token)
        snapshot = await socket.receive_json_from(timeout=5)
        assert snapshot["type"] == "snapshot"
        [item] = snapshot["equipment"]
        assert (item["equipment"], item["status"], item["values"]) == ("press-1", "stop", {"state": "stop", "force": 1.5})
        assert item["signals"]["force"] == {"name": "Усилие", "unit": "кН", "kind": "number"}
        assert item["last_seen"] == item["ts"] and item["offline_seconds"] == 180
        await database_sync_to_async(ingest)("press-dev", {"state": "run", "force": 9}, ts=time.time())
        update = await socket.receive_json_from(timeout=5)
        assert update["type"] == "update"
        assert (update["equipment"], update["status"], update["values"]["force"]) == ("press-1", "run", 9)
        assert isinstance(update["ts"], float)
        assert update["last_seen"] == update["ts"] and update["offline_seconds"] == 180
        await socket.send_json_to({"type": "ping"})
        assert await socket.receive_json_from(timeout=5) == {"type": "pong"}
        await socket.disconnect()

    async_to_sync(scenario)()


@pytest.mark.parametrize("make_token, code", [
    (lambda user: "", 4401),
    (lambda user: "not-a-jwt", 4401),
    (lambda user: token_for(user, role=None), 4403),
])
def test_rejects_without_valid_token_or_role(user, device, make_token, code):
    token = make_token(user)

    async def scenario():
        socket = await open_socket(token)
        message = await socket.receive_output(timeout=5)
        assert message == {"type": "websocket.close", "code": code}

    async_to_sync(scenario)()


def test_expired_token_closes_on_next_event(user, device, monkeypatch):
    from types import SimpleNamespace
    from equipment import consumers
    token = token_for(user)

    async def scenario():
        socket = await open_socket(token)
        await socket.receive_json_from(timeout=5)
        # Токен истёк, пока соединение открыто: следующее событие закрывает сокет с 4401.
        monkeypatch.setattr(consumers, "time", SimpleNamespace(time=lambda: 10 ** 12))
        await database_sync_to_async(ingest)("press-dev", {"force": 2}, ts=time.time())
        assert await socket.receive_output(timeout=5) == {"type": "websocket.close", "code": 4401}

    async_to_sync(scenario)()
