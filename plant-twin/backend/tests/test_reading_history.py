from datetime import timedelta
import pytest
from django.contrib.auth.models import Group
from django.utils import timezone
from equipment.models import Equipment, EquipmentType, Reading
from plants.models import Plant, Zone
from django.core.exceptions import ValidationError
from equipment.models import Asset

pytestmark = pytest.mark.django_db


@pytest.fixture
def equipment():
    zone = Zone.objects.create(plant=Plant.objects.create(code='p', name='P'), code='z', name='Z')
    return Equipment.objects.create(code='e', name='E', zone=zone, type=EquipmentType.objects.get(code='oven'))


@pytest.mark.parametrize('role,status', [(None, 401), ('unrelated', 403), ('operator', 200), ('engineer', 200), ('admin', 200)])
def test_history_permissions(client, user, equipment, role, status):
    if role:
        user.groups.add(Group.objects.get_or_create(name=role)[0]); client.force_authenticate(user)
    assert client.get('/api/v1/equipment/e/readings/?hours=1').status_code == status


def test_history_window_buckets_and_faults(client, user, equipment):
    user.groups.add(Group.objects.get_or_create(name='operator')[0]); client.force_authenticate(user)
    signal = equipment.signals.get(key='power')
    minute = (timezone.now() - timedelta(minutes=2)).replace(second=0, microsecond=0)
    for seconds, value, fault in [(0, 10, False), (10, 20, False), (20, 999, True)]:
        Reading.objects.create(signal=signal, ts=minute + timedelta(seconds=seconds), value=value, sensor_fault=fault)
    Reading.objects.create(signal=signal, ts=minute - timedelta(hours=2), value=100)
    response = client.get('/api/v1/equipment/e/readings/?hours=1')
    series = next(row for row in response.data['series'] if row['key'] == 'power')
    assert series['points'] == [{'x': minute.timestamp(), 'y': 15, 'min': 10, 'max': 20}]
    assert all(row['key'] != 'state' for row in response.data['series'])
    assert client.get('/api/v1/equipment/missing/readings/').status_code == 404
    for hours in ['0', '25', 'nan', '1.5']:
        assert client.get(f'/api/v1/equipment/e/readings/?hours={hours}').status_code == 400


@pytest.mark.parametrize('keys', [{}, ['a', 'b', 'c'], [12], ['']])
def test_key_signals_validation(keys):
    with pytest.raises(ValidationError):
        EquipmentType(code='invalid', name='Invalid', key_signals=keys).full_clean()


def test_asset_speed_and_seeded_key_signals():
    with pytest.raises(ValidationError):
        Asset(code='invalid', name='Invalid', rotation_speed_deg_s=float('nan')).full_clean()
    assert EquipmentType.objects.get(code='oven').key_signals == ['temperature', 'power']
