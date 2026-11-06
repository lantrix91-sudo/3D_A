import json
from io import StringIO
import pytest
from django.contrib.auth.models import Group
from django.core.management import call_command
from django.core.management.base import CommandError
from rest_framework_simplejwt.tokens import AccessToken
from equipment.models import Asset, Equipment, EquipmentType, Signal
from equipment.services import import_equipment
from plants.models import Plant, Zone
from plants.services import get_plan

pytestmark = pytest.mark.django_db


@pytest.fixture
def zone():
    return Zone.objects.create(plant=Plant.objects.create(code="factory", name="Завод"), code="main", name="Цех", size_x=100, size_z=100)


@pytest.fixture
def oven_type():
    return EquipmentType.objects.get(code="oven")


def row(code="oven-1", **extra):
    return {"code": code, "name": "Печь", "type": "oven", "asset": "oven", "zone": "main",
            "pos_x": 10, "pos_y": 0, "pos_z": 60.3, "rotation_deg": 90, "device_id": None, **extra}


def authorize(client, user, role="operator", staff=False):
    if role:
        user.groups.add(Group.objects.get_or_create(name=role)[0])
    user.is_staff = staff
    user.save()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(user)}")


def test_type_migration_and_automatic_signals(zone, oven_type):
    assert [t["key"] for t in oven_type.signal_templates] == ["state", "power", "temperature"]
    item = Equipment.objects.create(code="o1", name="Печь", zone=zone, type=oven_type)
    assert item.signals.count() == 3
    signal = item.signals.get(key="power")
    signal.device_key = "p_kw"
    signal.name = "Настроенная мощность"
    signal.save()
    item.save()
    assert item.signals.count() == 3
    signal.refresh_from_db()
    assert signal.device_key == "p_kw"
    assert signal.name == "Настроенная мощность"
    assert item.signals.get(key="state").device_key == "state"
    assert item.signals.get(key="temperature").kind == "number"


def test_plan_nested_staff_and_asset_fallback(client, user, zone, oven_type, django_assert_num_queries):
    item = Equipment.objects.create(code="o1", name="Печь", zone=zone, type=oven_type,
                                    pos_x=10, pos_y=2, pos_z=60.3, rotation_deg=90, device_id="plc-1")
    asset = oven_type.default_asset
    asset.glb_file = "assets/oven.glb"
    asset.save()
    zone.model_file = "models/hall.glb"
    zone.model_rotation_deg = 180
    zone.save()
    authorize(client, user)
    data = client.get("/api/v1/plan/").json()
    assert "equipment" not in data
    z = data["zones"][0]
    assert z["model_url"] == "http://testserver/media/models/hall.glb"
    assert z["model_rotation_deg"] == 180
    e = z["equipment"][0]
    assert e["pos"] == {"x": 10, "y": 2, "z": 60.3}
    assert e["rotation_deg"] == 90
    assert e["type"] == "oven"
    assert e["status"] == "unknown"
    assert e["asset"] == {"code": "oven", "url": "http://testserver/media/assets/oven.glb", "led_node_name": "led", "size": {"x": 1.85, "y": 1.9, "z": 1.55}, "rotation_speed_deg_s": 0, "animation_node_name": ""}
    assert "device_id" not in e
    assert "device_id" not in client.get("/api/v1/equipment/").json()[0]
    assert "device_id" not in client.get("/api/v1/equipment/o1/").json()
    authorize(client, user, staff=True)
    assert client.get("/api/v1/plan/").json()["zones"][0]["equipment"][0]["device_id"] == "plc-1"
    assert client.get("/api/v1/equipment/o1/").json()["device_id"] == "plc-1"
    with django_assert_num_queries(3):
        get_plan("factory", lambda url: url)
    item.is_active = False
    item.save()
    assert client.get("/api/v1/plan/").json()["zones"][0]["equipment"] == []


def test_plan_empty_and_missing_plant(client, user):
    authorize(client, user)
    assert client.get("/api/v1/plan/").json() == {"plant": None, "zones": [], "can_edit_layout": False, "can_edit_walls": False, "can_change_condition": False, "can_change_image": False}
    assert client.get("/api/v1/plan/?plant=missing").status_code == 404


@pytest.mark.parametrize("role,expected", [(None,403),("operator",200),("engineer",200),("admin",200)])
def test_read_permissions(client, user, role, expected):
    for url in ("/api/v1/plan/", "/api/v1/equipment/", "/api/v1/assets/"):
        assert client.get(url).status_code == 401
    authorize(client, user, role)
    for url in ("/api/v1/plan/", "/api/v1/equipment/", "/api/v1/assets/"):
        assert client.get(url).status_code == expected


@pytest.mark.parametrize("role,allowed", [("operator",False),("engineer",False),("admin",True)])
def test_crud_permissions_and_device_binding(client, user, zone, oven_type, role, allowed):
    authorize(client, user, role)
    existing = Equipment.objects.create(code="existing", name="Существующая", zone=zone, type=oven_type, device_id="keep")
    payload = {"code":"new", "name":"Новая", "zone":"main", "type":"oven", "pos_z":65.5}
    assert client.post("/api/v1/equipment/", payload, format="json").status_code == (201 if allowed else 403)
    detail = "/api/v1/equipment/existing/"
    assert client.patch(detail, {"pos_x":42}, format="json").status_code == (200 if allowed else 403)
    assert client.put(detail, {**payload, "code":"existing"}, format="json").status_code == (200 if allowed else 403)
    if allowed:
        assert Signal.objects.filter(equipment__code="new").count() == 3
        for value in ("new-device", None, ""):
            assert client.patch(detail, {"device_id":value}, format="json").status_code == 400
        existing.refresh_from_db()
        assert existing.device_id == "keep"
        assert client.patch(detail, {"pos_x":"NaN"}, format="json").status_code == 400
        assert client.get("/api/v1/equipment/?zone=missing").json() == []
        assert len(client.get("/api/v1/equipment/?zone=main").json()) == 2
    assert client.delete(detail).status_code == (204 if allowed else 403)


def test_import_create_update_dry_run_and_preserve_device(zone, tmp_path):
    source = tmp_path / "ovens.json"
    source.write_text(json.dumps({"equipment":[row()]}), encoding="utf-8")
    out = StringIO()
    call_command("import_equipment", str(source), stdout=out)
    assert "Создано: 1" in out.getvalue()
    item = Equipment.objects.get(code="oven-1")
    item.device_id = "physical-1"
    item.save()
    source.write_text(json.dumps({"equipment":[row(name="Обновлена", pos_x=30)]}), encoding="utf-8")
    call_command("import_equipment", str(source), stdout=StringIO())
    item.refresh_from_db()
    assert (item.name, item.pos_x, item.device_id) == ("Обновлена",30,"physical-1")
    assert item.signals.count() == 3
    source.write_text(json.dumps({"equipment":[row(name="Не сохранять"),row("oven-2")]}), encoding="utf-8")
    call_command("import_equipment", str(source), dry_run=True, stdout=StringIO())
    item.refresh_from_db()
    assert item.name == "Обновлена"
    assert not Equipment.objects.filter(code="oven-2").exists()
    assert Signal.objects.count() == 3


@pytest.mark.parametrize("extra", [{"zone":"missing"},{"type":"missing"},{"asset":"missing"},{"device_id":"new-device"},{"pos_x":True},{"pos_z":float('nan')}])
def test_import_error_line_and_atomicity(zone, extra, tmp_path):
    source = tmp_path / "bad.json"
    source.write_text(json.dumps({"equipment":[row(),row("bad",**extra)]}), encoding="utf-8")
    err = StringIO()
    with pytest.raises(CommandError, match="ошибок: 1"):
        call_command("import_equipment", str(source), stderr=err)
    assert "Строка 2" in err.getvalue()
    assert Equipment.objects.count() == 0
    assert Signal.objects.count() == 0


def test_import_null_asset_and_duplicate_rows(zone):
    assert not import_equipment({"equipment":[row(asset=None)]})["errors"]
    item = Equipment.objects.get()
    assert item.asset is None
    assert item.effective_asset.code == "oven"
    result = import_equipment({"equipment":[row("dup"),row("dup")]})
    assert "Строка 2" in result["errors"][0]
    assert not Equipment.objects.filter(code="dup").exists()
