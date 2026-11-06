import pytest
from django.contrib.auth.models import Group
from equipment.models import Equipment, EquipmentType, EquipmentMoveLog
from plants.models import Plant, Zone

pytestmark = pytest.mark.django_db


@pytest.fixture
def equipment():
    zone = Zone.objects.create(plant=Plant.objects.create(code="p", name="Plant"), code="z", name="Zone", size_x=20, size_z=30)
    return Equipment.objects.create(code="e", name="Equipment", zone=zone, type=EquipmentType.objects.get(code="oven"), pos_y=2)


@pytest.mark.parametrize("role,status", [(None, 401), ("operator", 403), ("engineer", 403), ("admin", 200)])
def test_move_permissions_and_log(client, user, equipment, role, status):
    if role:
        user.groups.add(Group.objects.get_or_create(name=role)[0])
        client.force_authenticate(user)
    result = client.patch('/api/v1/equipment/e/', {"pos_x": 20, "pos_z": 30, "rotation_deg": 360}, format="json")
    assert result.status_code == status
    equipment.refresh_from_db()
    assert equipment.pos_y == 2
    assert EquipmentMoveLog.objects.count() == (1 if status == 200 else 0)
    if status == 200:
        log = EquipmentMoveLog.objects.get()
        assert log.actor == user and log.created_at
        assert log.old_values == {"pos_x": 0, "pos_z": 0, "rotation_deg": 0}
        assert log.new_values == {"pos_x": 20, "pos_z": 30, "rotation_deg": 360}
    assert client.get('/api/v1/plan/').data.get('can_edit_layout', False) == (role == 'admin')


@pytest.mark.parametrize("payload", [
    {"pos_x": -0.01}, {"pos_x": 20.01}, {"pos_z": -1}, {"pos_z": 30.01},
    {"rotation_deg": -1}, {"rotation_deg": 360.1}, {"pos_x": "NaN"},
    {"pos_z": "Infinity"}, {"pos_x": True}, {"pos_y": 3}, {"pos_x": None},
])
def test_invalid_move_is_atomic(client, user, equipment, payload):
    user.groups.add(Group.objects.get_or_create(name="admin")[0])
    client.force_authenticate(user)
    assert client.patch('/api/v1/equipment/e/', payload, format='json').status_code == 400
    equipment.refresh_from_db()
    assert (equipment.pos_x, equipment.pos_y, equipment.pos_z, equipment.rotation_deg) == (0, 2, 0, 0)
    assert not EquipmentMoveLog.objects.exists()


def test_missing_dimensions(client, user, equipment):
    user.groups.add(Group.objects.get_or_create(name="admin")[0])
    client.force_authenticate(user)
    equipment.zone.size_x = None
    equipment.zone.save()
    assert client.patch('/api/v1/equipment/e/', {"pos_x": 1}, format='json').status_code == 400


@pytest.mark.parametrize("coords,expected", [
    ({}, 201), ({"pos_x": 20, "pos_z": 30, "rotation_deg": 360}, 201),
    ({"pos_x": -1}, 400), ({"pos_z": 31}, 400), ({"rotation_deg": 361}, 400),
    ({"rotation_deg": -1}, 400), ({"pos_x": True}, 400), ({"pos_x": "Infinity"}, 400),
])
def test_create_validates_final_position(client, user, equipment, coords, expected):
    user.groups.add(Group.objects.get_or_create(name="admin")[0])
    client.force_authenticate(user)
    response = client.post('/api/v1/equipment/', {"code": "new", "name": "New", "zone": "z", "type": "oven", **coords}, format='json')
    assert response.status_code == expected
    assert Equipment.objects.filter(code="new").exists() == (expected == 201)


def test_zone_change_validates_existing_coordinates(client, user, equipment):
    user.groups.add(Group.objects.get_or_create(name="admin")[0])
    client.force_authenticate(user)
    equipment.pos_x = 15
    equipment.save()
    small = Zone.objects.create(plant=equipment.zone.plant, code="small", name="Small", size_x=10, size_z=10)
    url = '/api/v1/equipment/e/'
    assert client.patch(url, {"zone": small.code}, format='json').status_code == 400
    equipment.refresh_from_db()
    assert equipment.zone.code == "z" and equipment.pos_x == 15
    assert not EquipmentMoveLog.objects.exists()
    assert client.patch(url, {"zone": small.code, "pos_x": 10}, format='json').status_code == 200


def test_create_requires_zone_dimensions(client, user, equipment):
    user.groups.add(Group.objects.get_or_create(name="admin")[0])
    client.force_authenticate(user)
    equipment.zone.size_z = None
    equipment.zone.save()
    assert client.post('/api/v1/equipment/', {"code": "new", "name": "New", "zone": "z", "type": "oven"}, format='json').status_code == 400
