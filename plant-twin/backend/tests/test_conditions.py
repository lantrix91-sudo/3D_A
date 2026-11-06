from contextlib import contextmanager
from datetime import date

import pytest
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import connection

from equipment.live import GROUP
from equipment.models import ConditionEvent, ConditionPhoto, Equipment, EquipmentDocument, EquipmentType
from plants.models import Plant, Zone
from tests.test_plan import authorize

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def media(settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path


@pytest.fixture
def item():
    zone = Zone.objects.create(plant=Plant.objects.create(code="f", name="Завод"), code="bake", name="Выпечка")
    kind = EquipmentType.objects.create(code="mixer", name="Миксер", signal_templates=[])
    return Equipment.objects.create(code="mx-1", name="Миксер 1", zone=zone, type=kind,
                                    manufacturer="Sancassiano", serial_number="SN-42", commissioned_on=date(2021, 5, 1))


@pytest.fixture
def events():
    layer = get_channel_layer()
    channel = async_to_sync(layer.new_channel)()
    async_to_sync(layer.group_add)(GROUP, channel)

    def drain():
        queue = layer.channels.get(channel)
        items = []
        while queue and not queue.empty():
            items.append(queue.get_nowait()[1]["payload"])
        return items
    yield drain
    async_to_sync(layer.group_discard)(GROUP, channel)


@contextmanager
def committed():
    """Выполняет on_commit-колбэки запроса, как настоящий COMMIT."""
    start = len(connection.run_on_commit)
    yield
    callbacks = connection.run_on_commit[start:]
    del connection.run_on_commit[start:]
    for _, callback, _ in callbacks:
        callback()


def photo(name="p.jpg", size=100):
    return SimpleUploadedFile(name, b"\xff\xd8" + b"0" * size, content_type="image/jpeg")


URL = "/api/v1/equipment/mx-1/conditions/"


def test_default_condition_in_plan_without_telemetry(client, user, item):
    authorize(client, user)
    entry = client.get("/api/v1/plan/").json()["zones"][0]["equipment"][0]
    assert (entry["condition"], entry["has_telemetry"]) == ("working", False)


def test_engineer_changes_condition_with_history_and_event(client, user, item, events):
    authorize(client, user, role="engineer")
    with committed():
        response = client.post(URL, {"condition": "faulty", "comment": "Стук в редукторе"}, format="json")
    assert response.status_code == 201
    body = response.json()
    assert (body["previous"], body["condition"], body["comment"], body["actor"]) == ("working", "faulty", "Стук в редукторе", "test_operator")
    item.refresh_from_db()
    assert item.condition == "faulty" and item.condition_changed_at is not None
    [event] = events()
    assert (event["equipment"], event["condition"]) == ("mx-1", "faulty")


def test_same_condition_is_logged_without_broadcast(client, user, item, events):
    authorize(client, user, role="engineer")
    with committed():
        assert client.post(URL, {"condition": "working", "comment": "Осмотрен, норма"}, format="json").status_code == 201
    assert ConditionEvent.objects.filter(equipment=item).count() == 1
    assert events() == []


def test_photos_multipart(client, user, item):
    authorize(client, user, role="admin")
    response = client.post(URL, {"condition": "repair", "photos": [photo("a.jpg"), photo("b.png")]}, format="multipart")
    assert response.status_code == 201
    urls = response.json()["photos"]
    assert len(urls) == 2 and all(url.startswith("http://testserver/media/condition-photos/") for url in urls)


@pytest.mark.parametrize("data", [
    {"condition": "broken"},
    {"condition": "faulty", "photos": [photo("doc.exe")]},
    {"condition": "faulty", "photos": [photo(f"{index}.jpg") for index in range(6)]},
    {"condition": "faulty", "comment": "x" * 2001},
])
def test_invalid_change_rejected_atomically(client, user, item, data):
    authorize(client, user, role="engineer")
    response = client.post(URL, data, format="multipart")
    assert response.status_code == 400 and response.json()["error"]["message"]
    item.refresh_from_db()
    assert item.condition == "working"
    assert not ConditionEvent.objects.exists() and not ConditionPhoto.objects.exists()


def test_operator_reads_but_cannot_change(client, user, item):
    authorize(client, user, role="operator")
    assert client.post(URL, {"condition": "faulty"}, format="json").status_code == 403
    assert client.get(URL).status_code == 200
    assert client.get("/api/v1/equipment/mx-1/card/").status_code == 200
    client.credentials()
    assert client.get("/api/v1/equipment/mx-1/card/").status_code == 401


def test_history_order_and_limit(client, user, item):
    authorize(client, user, role="engineer")
    for condition in ("idle", "maintenance", "working"):
        client.post(URL, {"condition": condition}, format="json")
    history = client.get(URL).json()
    assert [entry["condition"] for entry in history] == ["working", "maintenance", "idle"]
    assert [entry["previous"] for entry in history] == ["maintenance", "idle", "working"]
    assert len(client.get(URL + "?limit=1").json()) == 1


def test_card_contains_passport_documents_and_events(client, user, item):
    EquipmentDocument.objects.create(equipment=item, title="Инструкция", file=SimpleUploadedFile("manual.pdf", b"%PDF"))
    authorize(client, user, role="engineer")
    for index in range(12):
        client.post(URL, {"condition": "idle" if index % 2 else "working", "comment": str(index)}, format="json")
    card = client.get("/api/v1/equipment/mx-1/card/").json()
    assert card["passport"]["manufacturer"] == "Sancassiano"
    assert card["passport"]["serial_number"] == "SN-42"
    assert card["passport"]["commissioned_on"] == "2021-05-01"
    assert card["zone"] == {"code": "bake", "name": "Выпечка"}
    assert card["status"] == "unknown" and card["has_telemetry"] is False
    assert card["documents"][0]["title"] == "Инструкция"
    assert card["documents"][0]["url"].startswith("http://testserver/media/equipment-docs/")
    assert len(card["events"]) == 10 and card["events"][0]["comment"] == "11"
    assert {"value": "repair", "label": "В ремонте"} in card["conditions"]
