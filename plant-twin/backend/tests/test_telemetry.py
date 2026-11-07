import hashlib
import json
import time
from contextlib import contextmanager
from datetime import timedelta
from io import StringIO

import pytest
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.core.exceptions import ValidationError
from django.core.management import call_command
from django.db import connection
from django.utils import timezone

from equipment.device_keys import issue_key
from equipment.ingest import IngestError, ingest
from equipment.live import GROUP, snapshot
from equipment.models import DeviceKey, Equipment, EquipmentType, IngestPacket, Reading
from equipment.offline import mark_offline
from plants.models import Plant, Zone
from tests.test_plan import authorize

pytestmark = pytest.mark.django_db
URL = "/api/v1/readings/"
TEMPLATES = [
    {"key": "state", "name": "Состояние", "unit": "", "kind": "state"},
    {"key": "power", "name": "Мощность", "unit": "кВт", "kind": "number"},
    {"key": "temp", "name": "Температура", "unit": "°C", "kind": "number"},
    {"key": "door", "name": "Дверь", "unit": "", "kind": "bool"},
]


@pytest.fixture
def zone():
    return Zone.objects.create(plant=Plant.objects.create(code="factory", name="Завод"), code="main", name="Цех",
                               size_x=100, size_z=100)


@pytest.fixture
def machine_type():
    return EquipmentType.objects.create(code="machine-t", name="Станок", signal_templates=TEMPLATES,
                                        status_rules={"alarm_if": [{"signal": "temp", "op": ">", "value": 300}]})


@pytest.fixture
def device(zone, machine_type):
    return Equipment.objects.create(code="m1", name="Станок 1", zone=zone, type=machine_type, device_id="dev-1")


@pytest.fixture
def key(device):
    return issue_key(device, "test")[1]


@pytest.fixture
def events():
    """Подписка на группу телеметрии через channel layer."""
    layer = get_channel_layer()
    channel = async_to_sync(layer.new_channel)()
    async_to_sync(layer.group_add)(GROUP, channel)

    # receive() блокирует на пустом канале — читаем только накопленное в InMemory-очереди.
    def drain():
        queue = layer.channels.get(channel)
        items = []
        while queue and not queue.empty():
            items.append(queue.get_nowait()[1]["payload"])
        return items
    yield drain
    async_to_sync(layer.group_discard)(GROUP, channel)


@pytest.fixture
def commit():
    """Имитация коммита: выполняет on_commit-колбэки блока и убирает их из очереди, как настоящий COMMIT."""
    @contextmanager
    def run():
        start = len(connection.run_on_commit)
        yield
        callbacks = connection.run_on_commit[start:]
        del connection.run_on_commit[start:]
        for _, callback, _ in callbacks:
            callback()
    return run


def now_ts(offset=0):
    return time.time() + offset


# --- ingest() ---

def test_signals_created_from_type_including_bool(device):
    assert {s.key: s.kind for s in device.signals.all()} == {"state": "state", "power": "number", "temp": "number", "door": "bool"}
    assert device.signals.get(key="door").value_type == "bool"


def test_ingest_writes_updates_status_and_publishes(device, events, commit):
    ts = now_ts(-5)
    with commit():
        result = ingest("dev-1", {"state": "run", "power": 12.5, "door": True}, ts=ts, seq=1, source="test")
    assert (result.duplicate, result.status, result.written) == (False, "run", 3)
    device.refresh_from_db()
    assert device.status == "run" and abs(device.last_seen.timestamp() - ts) < 0.01
    power = device.signals.get(key="power")
    assert power.last_value == 12.5 and power.last_seen == device.last_seen
    assert Reading.objects.filter(signal__equipment=device, source="test").count() == 3
    [event] = events()
    assert event["equipment"] == "m1" and event["status"] == "run"
    assert event["values"] == {"state": "run", "power": 12.5, "temp": None, "door": True}
    assert abs(event["ts"] - ts) < 0.01


def test_one_event_per_equipment_per_transaction(device, events, commit):
    from django.db import transaction
    with commit():
        with transaction.atomic():
            for seq in range(5):
                ingest("dev-1", {"power": seq}, ts=now_ts(seq - 10), seq=seq)
    assert len(events()) == 1


def test_ingest_deduplicates_by_seq_and_by_ts(device):
    ts = now_ts(-10)
    assert ingest("dev-1", {"power": 1}, ts=ts, seq=7).duplicate is False
    again = ingest("dev-1", {"power": 99}, ts=ts + 1, seq=7)
    assert again.duplicate is True and again.written == 0
    assert device.signals.get(key="power").last_value == 1
    assert ingest("dev-1", {"power": 2}, ts=ts + 2).duplicate is False
    assert ingest("dev-1", {"power": 2}, ts=ts + 2).duplicate is True
    assert IngestPacket.objects.filter(equipment=device).count() == 2


def test_reading_written_on_change_or_every_30_seconds(device):
    base = now_ts(-100)
    for offset, value in [(0, 5), (10, 5), (20, 5), (31, 5), (35, 6), (36, 6)]:
        ingest("dev-1", {"power": value}, ts=base + offset)
    values = list(Reading.objects.filter(signal__key="power").order_by("ts").values_list("value", flat=True))
    assert values == [5, 5, 6]  # первое, через 31 с, изменение


def test_status_rules_state_map_alarm_and_unknown(device):
    assert ingest("dev-1", {"state": "stop"}, ts=now_ts(-50)).status == "stop"
    assert ingest("dev-1", {"state": 1}, ts=now_ts(-40)).status == "run"
    assert ingest("dev-1", {"temp": 350}, ts=now_ts(-30)).status == "alarm"
    assert ingest("dev-1", {"temp": 200, "state": "weird"}, ts=now_ts(-20)).status == "unknown"
    device.type.status_rules = {"state_map": {"weird": "stop"}}
    device.type.save()
    assert ingest("dev-1", {"state": "weird"}, ts=now_ts(-10)).status == "stop"


def test_run_if_rules_without_state_signal(zone):
    kind = EquipmentType.objects.create(code="fan", name="Вентилятор", signal_templates=[
        {"key": "rpm", "name": "Обороты", "unit": "об/мин", "kind": "number"}],
        status_rules={"run_if": [{"signal": "rpm", "op": ">", "value": 100}]})
    Equipment.objects.create(code="f1", name="Вентилятор", zone=zone, type=kind, device_id="fan-1")
    assert ingest("fan-1", {"rpm": 1500}, ts=now_ts(-2)).status == "run"
    assert ingest("fan-1", {"rpm": 0}, ts=now_ts(-1)).status == "stop"


def test_status_rules_validation():
    kind = EquipmentType(code="bad", name="Плохой", status_rules={"alarm_if": [{"signal": "t", "op": "~", "value": 1}]})
    with pytest.raises(ValidationError):
        kind.full_clean()
    kind.status_rules = {"state_map": {"1": "broken"}}
    with pytest.raises(ValidationError):
        kind.full_clean()


def test_faults_flag_signal_and_skip_status(device):
    ingest("dev-1", {"state": "run", "temp": 200}, ts=now_ts(-20))
    result = ingest("dev-1", {"temp": 999}, faults=["temp"], ts=now_ts(-10))
    assert result.status == "run"  # 999 > 300, но датчик неисправен — не авария
    temp = device.signals.get(key="temp")
    assert temp.sensor_fault is True and temp.last_value == 200
    fault = Reading.objects.filter(signal=temp).order_by("-ts").first()
    assert fault.sensor_fault is True
    assert Reading.objects.filter(signal=temp, sensor_fault=False).count() == 1  # в график попадает только 200
    ingest("dev-1", {"temp": 210}, ts=now_ts(-5))
    temp.refresh_from_db()
    assert temp.sensor_fault is False and temp.last_value == 210


def test_backfill_keeps_current_state(device, events, commit):
    ingest("dev-1", {"state": "run", "power": 10}, ts=now_ts(-5), seq=10)
    with commit():
        ingest("dev-1", {"state": "stop", "power": 3}, ts=now_ts(-600), seq=5)
    device.refresh_from_db()
    assert device.status == "run" and device.signals.get(key="power").last_value == 10
    assert Reading.objects.filter(signal__key="power").count() == 2
    assert events() == []


@pytest.mark.parametrize("kwargs, code", [
    ({"device_id": "nope", "values": {"power": 1}}, "unknown_device"),
    ({"device_id": "dev-1", "values": {"pwr": 1}}, "unknown_signal"),
    ({"device_id": "dev-1", "values": {"power": 1}, "faults": ["ghost"]}, "unknown_signal"),
    ({"device_id": "dev-1", "values": {"power": "high"}}, "invalid_value"),
    ({"device_id": "dev-1", "values": {"door": 5}}, "invalid_value"),
    ({"device_id": "dev-1", "values": [1]}, "invalid_format"),
    ({"device_id": "dev-1", "values": {"power": 1}, "seq": -1}, "invalid_format"),
    ({"device_id": "dev-1", "values": {"power": 1}, "ts": True}, "invalid_format"),
])
def test_ingest_validation_errors(device, kwargs, code):
    with pytest.raises(IngestError) as error:
        ingest(**kwargs)
    assert error.value.code == code
    assert not Reading.objects.exists()


# --- offline ---

def test_offline_by_timeout_and_type_override(device, events, commit, settings):
    settings.STATUS_OFFLINE_SECONDS = 180
    with commit():
        ingest("dev-1", {"state": "run"}, ts=now_ts(-100))
    assert [event["status"] for event in events()] == ["run"]
    assert mark_offline() == []
    with commit():
        assert mark_offline(timezone.now() + timedelta(seconds=100)) == ["m1"]
    device.refresh_from_db()
    assert device.status == "offline"
    assert [event["status"] for event in events()] == ["offline"]
    assert mark_offline(timezone.now() + timedelta(seconds=100)) == []  # повторно не рассылается
    assert ingest("dev-1", {"state": "run"}, ts=now_ts()).status == "run"
    device.type.offline_seconds = 10
    device.type.save()
    assert mark_offline(timezone.now() + timedelta(seconds=11)) == ["m1"]


def test_plan_shows_offline_before_watchdog(client, user, device):
    ingest("dev-1", {"state": "run"}, ts=now_ts(-200))
    authorize(client, user)
    item = client.get("/api/v1/plan/").json()["zones"][0]["equipment"][0]
    assert item["status"] == "offline" and item["last_seen"] is not None


def test_packet_without_ts_is_not_offline_and_values_in_snapshot(client, zone):
    """Тип без правил статуса: статус не определён, но связь есть и значения отдаются."""
    numbers = [{"key": "t1", "name": "T1", "unit": "°C", "kind": "number"},
               {"key": "t2", "name": "T2", "unit": "°C", "kind": "number"}]
    plain = EquipmentType.objects.create(code="fridge-t", name="Холодильник", signal_templates=numbers, offline_seconds=180)
    fridge = Equipment.objects.create(code="f1", name="Холодильник 1", zone=zone, type=plain, device_id="fridge-01",
                                      require_device_key=False)
    Equipment.objects.filter(pk=fridge.pk).update(status="offline", last_seen=timezone.now() - timedelta(hours=1))

    response = post(client, {"device_id": "fridge-01", "values": {"t1": 5.4, "t2": 5.1}})
    assert response.status_code == 201 and response.json()["status"] == "unknown"

    assert mark_offline() == []  # Сторож не возвращает в offline сразу после пакета.
    fridge.refresh_from_db()
    assert fridge.status == "unknown"
    assert abs((timezone.now() - fridge.last_seen).total_seconds()) < 5

    item = next(entry for entry in snapshot() if entry["equipment"] == "f1")
    assert item["status"] == "unknown" and item["values"] == {"t1": 5.4, "t2": 5.1} and item["faults"] == []
    assert item["offline_seconds"] == 180 and abs(time.time() - item["last_seen"]) < 5


def test_check_offline_command(device):
    ingest("dev-1", {"state": "run"}, ts=now_ts(-200))
    out = StringIO()
    call_command("check_offline", stdout=out)
    assert "m1" in out.getvalue()
    device.refresh_from_db()
    assert device.status == "offline"


# --- HTTP и ключи ---

def post(client, body, key=None):
    headers = {"HTTP_X_DEVICE_KEY": key} if key else {}
    return client.post(URL, body, format="json", **headers)


def test_http_single_packet_and_duplicate(client, device, key):
    body = {"device_id": "dev-1", "ts": now_ts(-1), "seq": 1, "values": {"state": "run", "power": 4}}
    response = post(client, body, key)
    assert response.status_code == 201
    assert response.json() == {"equipment": "m1", "duplicate": False, "status": "run", "written": 2}
    again = post(client, body, key)
    assert again.status_code == 200 and again.json()["duplicate"] is True


def test_http_ts_defaults_to_receive_time(client, device, key):
    assert post(client, {"device_id": "dev-1", "values": {"power": 1}}, key).status_code == 201
    device.refresh_from_db()
    assert abs((timezone.now() - device.last_seen).total_seconds()) < 5


def test_device_key_required_invalid_revoked_and_foreign(client, device, key, zone, machine_type):
    body = {"device_id": "dev-1", "values": {"power": 1}}
    for sent, code in [(None, "device_key_missing"), ("ptd_wrong", "device_key_invalid")]:
        response = post(client, body, sent)
        assert response.status_code == 401 and response.json()["error"]["code"] == code
    other = Equipment.objects.create(code="m2", name="Станок 2", zone=zone, type=machine_type, device_id="dev-2")
    foreign = issue_key(other)[1]
    assert post(client, body, foreign).status_code == 401
    DeviceKey.objects.filter(equipment=device).update(revoked_at=timezone.now())
    assert post(client, body, key).json()["error"]["code"] == "device_key_invalid"
    assert not Reading.objects.exists()


def test_key_stored_only_as_hash_and_last_used(client, device, key):
    record = DeviceKey.objects.get(equipment=device)
    assert record.key_hash == hashlib.sha256(key.encode()).hexdigest()
    assert key not in {record.prefix, record.key_hash, record.name}
    assert record.prefix == key[:12]
    post(client, {"device_id": "dev-1", "values": {"power": 1}}, key)
    record.refresh_from_db()
    assert record.last_used_at is not None


def test_unauthenticated_devices_flag(client, device, settings):
    settings.ALLOW_UNAUTHENTICATED_DEVICES = True
    assert post(client, {"device_id": "dev-1", "values": {"power": 1}}).status_code == 201


def test_key_not_required_accepts_packet_without_header(client, device):
    Equipment.objects.filter(pk=device.pk).update(require_device_key=False)
    response = post(client, {"device_id": "dev-1", "ts": now_ts(-1), "values": {"power": 1}})
    assert response.status_code == 201
    assert Reading.objects.count() == 1


def test_key_not_required_accepts_batch_without_header(client, device):
    Equipment.objects.filter(pk=device.pk).update(require_device_key=False)
    body = {"device_id": "dev-1", "readings": [{"ts": now_ts(-2), "seq": 1, "values": {"power": 1}},
                                               {"ts": now_ts(-1), "seq": 2, "values": {"power": 2}}]}
    response = post(client, body)
    assert response.status_code == 201 and response.json()["accepted"] == 2


def test_key_not_required_still_rejects_invalid_key(client, device, key):
    Equipment.objects.filter(pk=device.pk).update(require_device_key=False)
    body = {"device_id": "dev-1", "values": {"power": 1}}
    response = post(client, body, "ptd_wrong")
    assert response.status_code == 401 and response.json()["error"]["code"] == "device_key_invalid"
    DeviceKey.objects.filter(equipment=device).update(revoked_at=timezone.now())
    response = post(client, body, key)
    assert response.status_code == 401 and response.json()["error"]["code"] == "device_key_invalid"
    assert not Reading.objects.exists()


def test_key_required_by_default_rejects_missing_header(client, device):
    assert device.require_device_key is True
    body = {"device_id": "dev-1", "values": {"power": 1}}
    response = post(client, body)
    assert response.status_code == 401 and response.json()["error"]["code"] == "device_key_missing"
    batch = post(client, {"device_id": "dev-1", "readings": [{"values": {"power": 1}}]})
    assert batch.status_code == 401 and batch.json()["error"]["code"] == "device_key_missing"
    assert not Reading.objects.exists()


def test_unknown_device_without_header_is_404(client, device):
    response = post(client, {"device_id": "ghost", "values": {"power": 1}})
    assert response.status_code == 404 and response.json()["error"]["code"] == "unknown_device"


def test_unauthenticated_flag_rejected_in_production(monkeypatch):
    import subprocess
    import sys
    env = {"DJANGO_READ_DOT_ENV": "false", "SECRET_KEY": "x" * 60, "DEBUG": "false", "REDIS_URL": "redis://r:6379/0",
           "ALLOW_UNAUTHENTICATED_DEVICES": "true", "DJANGO_SETTINGS_MODULE": "config.settings", "SYSTEMROOT": "C:\\Windows"}
    result = subprocess.run([sys.executable, "-c", "import django; django.setup()"], env=env, capture_output=True, text=True)
    assert result.returncode != 0 and "ALLOW_UNAUTHENTICATED_DEVICES" in result.stderr


@pytest.mark.parametrize("body, status, code", [
    ({"device_id": "ghost", "values": {"power": 1}}, 404, "unknown_device"),
    ({"device_id": "dev-1", "values": {"bad": 1}}, 400, "unknown_signal"),
    ({"device_id": "dev-1", "values": {"power": 1}, "ts": "yesterday"}, 400, "invalid_format"),
    ({"device_id": "dev-1", "values": {"power": 1}, "extra": 1}, 400, "invalid_format"),
    ({"device_id": "dev-1"}, 400, "invalid_format"),
    ({"values": {"power": 1}}, 400, "invalid_format"),
])
def test_http_errors(client, device, key, body, status, code):
    response = post(client, body, key)
    assert response.status_code == status
    assert response.json()["error"]["code"] == code and response.json()["error"]["message"]


@pytest.mark.parametrize("offset", [6 * 60, -8 * 24 * 3600])
def test_ts_limits(client, device, key, offset):
    response = post(client, {"device_id": "dev-1", "ts": now_ts(offset), "values": {"power": 1}}, key)
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "ts_out_of_range"


def test_ts_within_limits_accepted(client, device, key):
    for offset in (4 * 60, -6 * 24 * 3600):
        assert post(client, {"device_id": "dev-1", "ts": now_ts(offset), "values": {"power": 1}}, key).status_code == 201


def test_batch_out_of_order_with_duplicates(client, device, key):
    base = now_ts(-100)
    records = [{"ts": base + 60, "seq": 3, "values": {"state": "run", "power": 3}},
               {"ts": base, "seq": 1, "values": {"state": "stop", "power": 1}},
               {"ts": base + 30, "seq": 2, "values": {"power": 2}, "faults": ["temp"]}]
    response = post(client, {"device_id": "dev-1", "readings": records}, key)
    assert response.status_code == 201
    data = response.json()
    assert (data["accepted"], data["duplicates"], data["status"]) == (3, 0, "run")
    assert device.signals.get(key="power").last_value == 3
    again = post(client, {"device_id": "dev-1", "readings": records + [{"seq": 4, "values": {"power": 4}}]}, key)
    assert again.status_code == 201
    assert [item["duplicate"] for item in again.json()["results"]] == [True, True, True, False]


def test_batch_is_atomic_and_limited(client, device, key):
    records = [{"ts": now_ts(-10), "seq": 1, "values": {"power": 1}}, {"ts": now_ts(-5), "seq": 2, "values": {"nope": 1}}]
    response = post(client, {"device_id": "dev-1", "readings": records}, key)
    assert response.status_code == 400
    assert response.json()["error"]["message"].startswith("readings[1]:")
    assert not Reading.objects.exists() and not IngestPacket.objects.exists()
    big = [{"seq": index, "values": {"power": index}} for index in range(501)]
    response = post(client, {"device_id": "dev-1", "readings": big}, key)
    assert response.json()["error"]["code"] == "batch_too_large"
    assert post(client, {"device_id": "dev-1", "readings": []}, key).status_code == 400


def test_batch_of_500_accepted(client, device, key):
    base = now_ts(-1000)
    records = [{"ts": base + index, "seq": index, "values": {"power": index % 7}} for index in range(500)]
    assert post(client, {"device_id": "dev-1", "readings": records}, key).json()["accepted"] == 500


def test_admin_shows_key_once_and_revokes(client, device, django_user_model, settings):
    settings.STORAGES = {**settings.STORAGES, "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"}}
    admin = django_user_model.objects.create_superuser("root", "root@example.test", "Strong-Test-Pass-492!")
    client.force_login(admin)
    response = client.post("/admin/equipment/devicekey/add/", {"equipment": device.pk, "name": "контроллер"}, follow=True)
    message = next(str(m) for m in response.context["messages"])
    raw = next(word for word in message.split() if word.startswith("ptd_"))
    record = DeviceKey.objects.get(equipment=device)
    assert record.key_hash == hashlib.sha256(raw.encode()).hexdigest()
    page = client.get(f"/admin/equipment/devicekey/{record.pk}/change/").content.decode()
    assert raw not in page
    client.post("/admin/equipment/devicekey/", {"action": "revoke_keys", "_selected_action": [record.pk]})
    record.refresh_from_db()
    assert record.revoked_at is not None


def test_issue_device_key_command(device):
    out = StringIO()
    call_command("issue_device_key", "dev-1", "--name", "sim", stdout=out)
    keys = json.loads(out.getvalue())
    assert list(keys) == ["dev-1"]
    assert DeviceKey.objects.get(equipment=device).key_hash == hashlib.sha256(keys["dev-1"].encode()).hexdigest()
