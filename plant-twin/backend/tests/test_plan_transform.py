"""Привязка зоны к чертежу двойника: параметры в плане и неизменность положения при сохранении."""
from importlib import import_module

import pytest
from django.apps import apps as django_apps

from equipment.models import Equipment, EquipmentType
from plants.models import Plant, Zone
from tests.test_plan import authorize

pytestmark = pytest.mark.django_db


@pytest.fixture
def zone():
    plant = Plant.objects.create(code="factory", name="Завод")
    return Zone.objects.create(plant=plant, code="main", name="Цех", size_x=100, size_z=100,
                               plan_offset_x=-0.68, plan_offset_z=-6.07, plan_rotation_deg=15)


@pytest.fixture
def item(zone):
    return Equipment.objects.create(code="o1", name="Печь", zone=zone, type=EquipmentType.objects.get(code="oven"),
                                    pos_x=32.5, pos_z=60.85, rotation_deg=270)


def plan_zone(client):
    return client.get("/api/v1/plan/").json()["zones"][0]


def test_plan_returns_zone_id_and_binding(client, user, zone, item):
    authorize(client, user)
    data = plan_zone(client)
    assert data["id"] == zone.pk
    assert data["plan_offset"] == {"x": -0.68, "z": -6.07}
    assert data["plan_rotation_deg"] == 15


def test_binding_defaults_to_zero():
    zone = Zone(code="z", name="Z")
    assert (zone.plan_offset_x, zone.plan_offset_z, zone.plan_rotation_deg) == (0, 0, 0)


def test_saved_position_is_the_same_after_reload(client, user, zone, item):
    """Сервер хранит координаты зоны как есть: привязка к чертежу на них не влияет."""
    authorize(client, user, "admin")
    saved = client.patch("/api/v1/equipment/o1/", {"pos_x": 12.34, "pos_z": 56.78, "rotation_deg": 180.5}, format="json")
    assert saved.status_code == 200
    entry = plan_zone(client)["equipment"][0]
    assert entry["pos"] == {"x": 12.34, "y": 0, "z": 56.78}
    assert entry["rotation_deg"] == 180.5
    # Повторная отправка тех же значений ничего не меняет
    client.patch("/api/v1/equipment/o1/", {"pos_x": 12.34, "pos_z": 56.78, "rotation_deg": 180.5}, format="json")
    assert plan_zone(client)["equipment"][0]["pos"] == entry["pos"]


def test_binding_is_not_applied_to_stored_position(item):
    item.refresh_from_db()
    assert (item.pos_x, item.pos_z) == (32.5, 60.85)


def test_data_migration_sets_measured_offset_only_for_koktal():
    plant = Plant.objects.create(code="K-1", name="Koktal_1")
    koktal = Zone.objects.create(plant=plant, code="K_1", name="Koktal_1")
    other = Zone.objects.create(plant=plant, code="other", name="Другая")
    custom = Zone.objects.create(plant=Plant.objects.create(code="p2", name="P2"), code="K_1", name="Настроенная", plan_offset_x=5)
    migration = import_module("plants.migrations.0005_koktal_plan_offset")
    migration.set_koktal_offset(django_apps, None)
    koktal.refresh_from_db()
    other.refresh_from_db()
    custom.refresh_from_db()
    assert (koktal.plan_offset_x, koktal.plan_offset_z, koktal.plan_rotation_deg) == (-0.68, -6.07, 0)
    assert (other.plan_offset_x, other.plan_offset_z) == (0, 0)
    # Уже настроенные вручную значения миграция не перезаписывает
    assert (custom.plan_offset_x, custom.plan_offset_z) == (5, 0)
