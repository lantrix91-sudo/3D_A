from datetime import timedelta

import pytest
from django.utils import timezone

from equipment.models import Equipment, EquipmentType
from equipment.live import live_payload, snapshot
from plants.models import Plant, Zone
from tests.test_plan import authorize

pytestmark = pytest.mark.django_db


@pytest.mark.parametrize("timeout,age,expected", [
    (None, 181, "offline"), (None, 179, "run"), (30, 31, "offline"),
    (300, 181, "run"), (30, None, "unknown"),
])
def test_plan_card_ws_agree_without_watchdog(client, user, settings, timeout, age, expected):
    settings.STATUS_OFFLINE_SECONDS = 180
    kind = EquipmentType.objects.create(code="status-contract", name="Test", offline_seconds=timeout)
    zone = Zone.objects.create(plant=Plant.objects.create(code="p", name="P"), code="z", name="Z")
    last_seen = timezone.now() - timedelta(seconds=age) if age is not None else None
    item = Equipment.objects.create(code="e", name="E", zone=zone, type=kind, device_id="dev",
                                    last_seen=last_seen, status="run" if last_seen else "unknown")
    authorize(client, user)
    plan = client.get('/api/v1/plan/').json()['zones'][0]['equipment'][0]
    card = client.get('/api/v1/equipment/e/card/').json()
    for data in [plan, card, live_payload(item), snapshot()[0]]:
        assert data['status'] == expected
        assert data['last_seen'] == (last_seen.timestamp() if last_seen else None)
        assert data['offline_seconds'] == (timeout or 180)
    assert live_payload(item)['ts'] == plan['last_seen']


def test_no_device_card_matches_plan(client, user):
    kind = EquipmentType.objects.get(code="oven")
    zone = Zone.objects.create(plant=Plant.objects.create(code="p", name="P"), code="z", name="Z")
    Equipment.objects.create(code="e", name="E", zone=zone, type=kind)
    authorize(client, user)
    card = client.get('/api/v1/equipment/e/card/').json()
    assert card['status'] == 'unknown'
    assert card['last_seen'] is None and card['has_telemetry'] is False
