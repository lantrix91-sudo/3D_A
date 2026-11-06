import json
import time
import uuid
from contextlib import contextmanager
from datetime import timedelta, timezone as dt_timezone

import pytest
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import connection
from django.utils import timezone

from equipment.live import GROUP
from equipment.models import ConditionEvent, Equipment, EquipmentType
from plants.models import Plant, Zone
from rounds.models import ChecklistItem, Inspection, Round, Route, RouteStop
from tests.test_plan import authorize

pytestmark = pytest.mark.django_db
URL = "/api/v1/rounds/inspections/"


@pytest.mark.parametrize("raw", ['null', '[]', '1', 'true', '"text"', '{broken'])
def test_invalid_json_body_is_400(client, user, setup, raw):
    authorize(client, user, role="engineer")
    response = client.post(URL, raw, content_type="application/json")
    assert response.status_code == 400
    assert response.json()["error"]["message"]
    assert not Inspection.objects.exists()


@pytest.mark.parametrize("extra", [
    {"inspected_at": True}, {"inspected_at": []}, {"inspected_at": {}},
    {"inspected_at": 1e300}, {"inspected_at": -1e300}, {"inspected_at": "NaN"},
    {"inspected_at": "Infinity"}, {"inspected_at": None},
    {"answers": {}}, {"answers": [1]}, {"answers": [None]}, {"answers": [[1]]},
    {"answers": [{"item": [], "result": "ok"}]},
    {"answers": [{"item": {}, "result": "ok"}]},
    {"answers": [{"item": True, "result": "ok"}]},
    {"answers": [{"item": 1, "result": {}}]},
    {"answers": [{"item": 1, "result": "ok", "note": []}]},
    {"answers": [{"item": 1, "result": "ok", "text": {}}]},
    {"answers": [{"item": 1, "result": "ok"}, {"item": [], "result": "ok"}]},
    {"client_id": True}, {"client_id": 42},
    {"equipment": []}, {"result": []}, {"client_id": []}, {"comment": {}},
])
def test_malformed_fields_are_400_without_writes(client, user, setup, extra):
    authorize(client, user, role="engineer")
    response = client.post(URL, payload(**extra), format="json")
    assert response.status_code == 400
    assert response.json()["error"]["message"]
    assert not Inspection.objects.exists() and not Round.objects.exists()


@pytest.mark.parametrize("wire_format", ["json", "multipart"])
def test_mobile_queue_wire_format(client, user, setup, wire_format):
    authorize(client, user, role="engineer")
    _, checks = setup
    # offline/queue.js inspectionForm: String(inspected_at), JSON.stringify(answers).
    body = payload(inspected_at=str(time.time() - 60), result="ok", comment="",
                   answers=json.dumps([{"item": checks[0].pk, "text": checks[0].text, "result": "ok", "note": ""}]))
    first = client.post(URL, body, format=wire_format)
    assert first.status_code == 201
    assert first.json()["answers"][0]["item"] == checks[0].pk
    again = client.post(URL, body, format=wire_format)
    assert again.status_code == 200 and again.json()["duplicate"]


@pytest.mark.parametrize("offset,expected", [(-172800, 201), (-172801, 400), (300, 201), (301, 400)])
def test_inspection_time_window(client, user, setup, monkeypatch, offset, expected):
    now = timezone.now()
    monkeypatch.setattr(timezone, "now", lambda: now)
    authorize(client, user, role="engineer")
    assert client.post(URL, payload(inspected_at=now.timestamp() + offset), format="json").status_code == expected


@pytest.mark.parametrize("error", [OverflowError, OSError, ValueError])
def test_timestamp_conversion_errors_are_400(client, user, setup, monkeypatch, error):
    from rounds import serializers as inspection_serializers
    class InvalidDate:
        @staticmethod
        def fromtimestamp(*args, **kwargs):
            raise error("out of range")
    authorize(client, user, role="engineer")
    monkeypatch.setattr(inspection_serializers, "datetime", InvalidDate)
    response = client.post(URL, payload(), format="json")
    assert response.status_code == 400 and response.json()["error"]["code"] == "validation_error"
    assert not Inspection.objects.exists()


def test_duplicate_after_time_window_remains_idempotent(client, user, setup, monkeypatch):
    authorize(client, user, role="engineer")
    body = payload()
    assert client.post(URL, body, format="json").status_code == 201
    later = timezone.now() + timedelta(days=3)
    monkeypatch.setattr(timezone, "now", lambda: later)
    response = client.post(URL, body, format="json")
    assert response.status_code == 200 and response.json()["duplicate"]


@pytest.fixture(autouse=True)
def media(settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path


@pytest.fixture
def setup():
    zone = Zone.objects.create(plant=Plant.objects.create(code="f", name="Завод"), code="z", name="Цех")
    oven = EquipmentType.objects.create(code="ov", name="Печь", signal_templates=[])
    mixer = EquipmentType.objects.create(code="mx", name="Миксер", signal_templates=[])
    items = {
        "o1": Equipment.objects.create(code="o1", name="Печь 1", zone=zone, type=oven),
        "o2": Equipment.objects.create(code="o2", name="Печь 2", zone=zone, type=oven),
        "m1": Equipment.objects.create(code="m1", name="Миксер", zone=zone, type=mixer),
    }
    checks = [ChecklistItem.objects.create(equipment_type=oven, order=i, text=text)
              for i, text in enumerate(["Нет посторонних шумов", "Уплотнитель двери цел"])]
    ChecklistItem.objects.create(equipment_type=oven, order=9, text="Старый пункт", is_active=False)
    return items, checks


@pytest.fixture
def events():
    layer = get_channel_layer()
    channel = async_to_sync(layer.new_channel)()
    async_to_sync(layer.group_add)(GROUP, channel)

    def drain():
        queue = layer.channels.get(channel)
        result = []
        while queue and not queue.empty():
            result.append(queue.get_nowait()[1]["payload"])
        return result
    yield drain
    async_to_sync(layer.group_discard)(GROUP, channel)


@contextmanager
def committed():
    start = len(connection.run_on_commit)
    yield
    callbacks = connection.run_on_commit[start:]
    del connection.run_on_commit[start:]
    for _, callback, _ in callbacks:
        callback()


def payload(equipment="o1", **extra):
    return {"client_id": str(uuid.uuid4()), "equipment": equipment, "inspected_at": time.time() - 60, **extra}


def test_today_route_defaults_to_active_equipment(client, user, setup):
    items, checks = setup
    Equipment.objects.filter(code="m1").update(condition="decommissioned")
    authorize(client, user)
    data = client.get("/api/v1/rounds/today/").json()
    assert data["date"] == timezone.localdate().isoformat()
    assert data["time_zone"] == "Asia/Qyzylorda"
    assert (data["total"], data["done"]) == (2, 0)
    assert [stop["equipment"] for stop in data["stops"]] == ["o1", "o2"]
    assert data["stops"][0]["checklist"] == [{"id": checks[0].pk, "text": "Нет посторонних шумов"},
                                             {"id": checks[1].pk, "text": "Уплотнитель двери цел"}]
    assert data["stops"][0]["inspection"] is None


def test_configured_route_order(client, user, setup):
    items, _ = setup
    route = Route.objects.create(name="Основной")
    RouteStop.objects.create(route=route, equipment=items["m1"], position=0)
    RouteStop.objects.create(route=route, equipment=items["o1"], position=1)
    authorize(client, user)
    assert [stop["equipment"] for stop in client.get("/api/v1/rounds/today/").json()["stops"]] == ["m1", "o1"]


def test_ok_inspection_with_photos_marks_done_and_broadcasts(client, user, setup, events):
    _, checks = setup
    authorize(client, user, role="engineer")
    body = payload(answers=json.dumps([{"item": checks[0].pk, "result": "ok"}, {"item": checks[1].pk, "result": "ok"}]),
                   comment="Всё в норме",
                   photos=[SimpleUploadedFile("a.jpg", b"\xff\xd8x", content_type="image/jpeg")])
    with committed():
        response = client.post(URL, body, format="multipart")
    assert response.status_code == 201
    data = response.json()
    assert (data["result"], data["duplicate"], data["inspector"]) == ("ok", False, "test_operator")
    assert data["answers"][1] == {"item": checks[1].pk, "text": "Уплотнитель двери цел", "result": "ok", "note": ""}
    assert len(data["photos"]) == 1
    [event] = events()
    assert (event["type"], event["equipment"], event["result"]) == ("inspection", "o1", "ok")
    today = client.get("/api/v1/rounds/today/").json()
    stop = next(stop for stop in today["stops"] if stop["equipment"] == "o1")
    assert today["done"] == 1 and stop["inspection"]["comment"] == "Всё в норме"
    assert not ConditionEvent.objects.exists()  # норма не трогает состояние


def test_resend_with_same_client_id_is_idempotent(client, user, setup):
    authorize(client, user, role="engineer")
    body = payload()
    assert client.post(URL, body, format="multipart").status_code == 201
    again = client.post(URL, body, format="multipart")
    assert again.status_code == 200 and again.json()["duplicate"] is True
    assert Inspection.objects.count() == 1


def test_fault_sets_faulty_with_photos_in_history(client, user, setup):
    items, checks = setup
    authorize(client, user, role="engineer")
    answers = [{"item": checks[0].pk, "result": "fault", "note": "Стук"}, {"item": checks[1].pk, "result": "ok"}]
    response = client.post(URL, payload(result="ok", answers=json.dumps(answers),
                                        photos=[SimpleUploadedFile("s.jpg", b"\xff\xd8x")]), format="multipart")
    data = response.json()
    assert data["result"] == "fault"  # итог не мягче худшего пункта
    assert data["condition"] == "faulty"
    event = ConditionEvent.objects.get(equipment=items["o1"])
    assert (event.previous, event.condition, event.source) == ("working", "faulty", "round")
    assert "Нет посторонних шумов: Стук" in event.comment
    assert event.photos.get().file.name == Inspection.objects.get().photos.get().file.name  # без копии файла
    assert Inspection.objects.get().condition_event == event


def test_fault_on_equipment_in_repair_only_notes(client, user, setup):
    items, _ = setup
    Equipment.objects.filter(code="o1").update(condition="repair")
    authorize(client, user, role="engineer")
    client.post(URL, payload(result="fault", comment="Течь масла"), format="multipart")
    event = ConditionEvent.objects.get()
    assert (event.previous, event.condition) == ("repair", "repair")
    items["o1"].refresh_from_db()
    assert items["o1"].condition == "repair"


def test_late_offline_upload_goes_to_inspection_day(client, user, setup):
    authorize(client, user, role="engineer")
    yesterday = timezone.now() - timedelta(hours=30)
    client.post(URL, payload(inspected_at=yesterday.timestamp()), format="multipart")
    assert Round.objects.get().date == timezone.localdate(yesterday)
    assert client.get("/api/v1/rounds/today/").json()["done"] == 0


def test_removed_checklist_item_keeps_client_text(client, user, setup):
    authorize(client, user, role="engineer")
    answers = [{"item": 999999, "text": "Удалённый пункт", "result": "remark", "note": "Царапина"}]
    data = client.post(URL, payload(answers=json.dumps(answers)), format="multipart").json()
    assert data["answers"][0]["text"] == "Удалённый пункт" and data["result"] == "remark"


@pytest.mark.parametrize("extra", [
    {"client_id": "nope"},
    {"equipment": "ghost"},
    {"inspected_at": time.time() + 3600},
    {"inspected_at": time.time() - 3 * 24 * 3600},
    {"inspected_at": "вчера"},
    {"result": "great"},
    {"answers": "not json"},
    {"answers": json.dumps([{"item": 1, "result": "bad"}])},
    {"photos": [SimpleUploadedFile("x.exe", b"MZ")]},
    {"photos": [SimpleUploadedFile(f"{i}.jpg", b"\xff\xd8") for i in range(6)]},
])
def test_validation(client, user, setup, extra):
    authorize(client, user, role="engineer")
    response = client.post(URL, {**payload(), **extra}, format="multipart")
    assert response.status_code == 400 and response.json()["error"]["message"]
    assert not Inspection.objects.exists() and not Round.objects.exists()


def test_permissions_and_equipment_history(client, user, setup):
    authorize(client, user, role="operator")
    assert client.post(URL, payload(), format="multipart").status_code == 403
    assert client.get("/api/v1/rounds/today/").status_code == 200
    authorize(client, user, role="engineer")
    for minutes in (120, 60):
        client.post(URL, payload(inspected_at=time.time() - minutes * 60, comment=str(minutes)), format="multipart")
    history = client.get(URL + "?equipment=o1").json()
    assert [entry["comment"] for entry in history] == ["60", "120"]
    assert client.get(URL).status_code == 400
    client.credentials()
    assert client.get("/api/v1/rounds/today/").status_code == 401


def test_stale_offline_fault_does_not_override_repaired_equipment(client, user, setup):
    """9:00 офлайн «Неисправность», 14:00 починили → «Работает», 16:00 телефон досылает утренний осмотр."""
    items, _ = setup
    now = timezone.now()
    Equipment.objects.filter(pk=items["o1"].pk).update(condition="working", condition_changed_at=now - timedelta(minutes=30))
    ConditionEvent.objects.create(equipment=items["o1"], previous="repair", condition="working",
                                  created_at=now - timedelta(minutes=30))
    authorize(client, user, role="engineer")
    response = client.post(URL, payload(result="fault", comment="Течь", inspected_at=(now - timedelta(hours=1)).timestamp()),
                           format="multipart")
    assert response.status_code == 201
    assert (response.json()["result"], response.json()["condition"]) == ("fault", "working")
    items["o1"].refresh_from_db()
    assert items["o1"].condition == "working"
    note = ConditionEvent.objects.filter(equipment=items["o1"], source="round").get()
    assert (note.previous, note.condition) == ("working", "working")
    assert "не применена" in note.comment and "Течь" in note.comment
    assert Inspection.objects.get().condition_event == note  # сам осмотр сохранён как обычно


def test_fresh_fault_after_old_change_sets_faulty(client, user, setup):
    items, _ = setup
    ConditionEvent.objects.create(equipment=items["o1"], previous="repair", condition="working",
                                  created_at=timezone.now() - timedelta(days=3))
    # Отметка без смены после осмотра не считается сменой состояния.
    ConditionEvent.objects.create(equipment=items["o1"], previous="working", condition="working",
                                  created_at=timezone.now() + timedelta(seconds=1))
    authorize(client, user, role="engineer")
    data = client.post(URL, payload(result="fault", inspected_at=time.time()), format="multipart").json()
    assert data["condition"] == "faulty"
    items["o1"].refresh_from_db()
    assert items["o1"].condition == "faulty"
    assert "не применена" not in ConditionEvent.objects.filter(source="round").get().comment


def test_duplicate_fault_resend_does_not_touch_condition(client, user, setup):
    items, _ = setup
    authorize(client, user, role="engineer")
    body = payload(result="fault")
    assert client.post(URL, body, format="multipart").status_code == 201
    # После осмотра станок починили; повтор того же client_id из очереди ничего не меняет.
    client.post("/api/v1/equipment/o1/conditions/", {"condition": "working", "comment": "Отремонтирован"}, format="json")
    events_before = ConditionEvent.objects.count()
    again = client.post(URL, body, format="multipart")
    assert again.status_code == 200 and again.json()["duplicate"] is True
    items["o1"].refresh_from_db()
    assert items["o1"].condition == "working"
    assert ConditionEvent.objects.count() == events_before


def test_day_boundary_uses_plant_timezone(client, user, setup, settings):
    """00:30 по Кызылорде — это 19:30 UTC накануне; осмотр должен попасть в новый местный день."""
    assert settings.TIME_ZONE == "Asia/Qyzylorda" and settings.USE_TZ
    local_midnight = timezone.localtime().replace(hour=0, minute=0, second=0, microsecond=0)
    moment = local_midnight + timedelta(minutes=30)
    if moment > timezone.now():
        moment -= timedelta(days=1)
    assert moment.astimezone(dt_timezone.utc).date() < timezone.localdate(moment)  # UTC ещё «вчера»
    authorize(client, user, role="engineer")
    client.post(URL, payload(inspected_at=moment.timestamp()), format="multipart")
    assert Round.objects.get().date == timezone.localdate(moment)


@pytest.mark.parametrize("client_id", ["00000000-0000-4000-8000-000000000000", "ffffffff-ffff-4fff-bfff-ffffffffffff"])
def test_accepts_frontend_uuid_format(client, user, setup, client_id):
    """Крайние значения uuid() из frontend/src/offline/queue.js (getRandomValues + биты версии/варианта)."""
    authorize(client, user, role="engineer")
    response = client.post(URL, payload(client_id=client_id), format="multipart")
    assert response.status_code == 201 and response.json()["client_id"] == client_id
    assert client.post(URL, payload(client_id=client_id), format="multipart").json()["duplicate"] is True
