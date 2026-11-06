import uuid

import pytest
from django.utils import timezone

from equipment.models import Equipment, EquipmentType, Reading, ConditionEvent
from plants.models import Plant, Zone
from rounds.models import Round, Inspection, Route, RouteStop
from tests.test_plan import authorize

pytestmark = pytest.mark.django_db


@pytest.fixture
def item():
    zone = Zone.objects.create(plant=Plant.objects.create(code="p", name="P"), code="z", name="Z", size_x=10, size_z=10)
    return Equipment.objects.create(code="archive-test", name="Test", zone=zone, type=EquipmentType.objects.get(code="oven"))


def add_history(item, kind, user):
    if kind == "reading":
        return Reading.objects.create(signal=item.signals.first(), ts=timezone.now(), value=1)
    if kind == "condition":
        return ConditionEvent.objects.create(equipment=item, condition="working", actor=user)
    return Inspection.objects.create(equipment=item, round=Round.objects.create(date=timezone.localdate()),
                                     inspector=user, client_id=uuid.uuid4(), inspected_at=timezone.now(), result="ok")


@pytest.mark.parametrize("kind", ["reading", "inspection", "condition"])
def test_archive_restore_preserves_history_and_route(client, user, item, kind):
    history = add_history(item, kind, user)
    route = Route.objects.create(name="Route")
    stop = RouteStop.objects.create(route=route, equipment=item)
    authorize(client, user, "admin")
    url = f"/api/v1/equipment/{item.code}/"
    assert client.delete(url).status_code == 204
    assert client.delete(url).status_code == 204
    item.refresh_from_db()
    assert not item.is_active
    assert type(history).objects.filter(pk=history.pk).exists()
    assert RouteStop.objects.filter(pk=stop.pk).exists()
    assert client.get("/api/v1/rounds/today/").json()["stops"] == []
    assert client.get(f"/api/v1/rounds/routes/{route.pk}/").json()["stops"] == []
    assert client.get("/api/v1/plan/").json()["zones"][0]["equipment"] == []
    assert client.get(url + "card/").json()["is_active"] is False
    assert client.patch(url, {"is_active": True}, format="json").status_code == 200
    assert client.get("/api/v1/rounds/today/").json()["stops"][0]["equipment"] == item.code
    assert client.get(f"/api/v1/rounds/routes/{route.pk}/").json()["stops"][0]["equipment"] == item.code
    assert RouteStop.objects.get(pk=stop.pk).position == 0


@pytest.mark.parametrize("role", ["operator", "engineer"])
def test_archive_restore_permissions(client, user, item, role):
    authorize(client, user, role)
    url = f"/api/v1/equipment/{item.code}/"
    assert client.delete(url).status_code == 403
    item.is_active = False
    item.save()
    assert client.patch(url, {"is_active": True}, format="json").status_code == 403
    item.refresh_from_db()
    assert not item.is_active


@pytest.mark.parametrize("kind", [None, "reading", "inspection", "condition"])
@pytest.mark.parametrize("bulk", [False, True])
def test_admin_delete_history_guard(client, user, item, kind, bulk, settings):
    settings.STORAGES = {**settings.STORAGES, "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"}}
    user.is_staff = user.is_superuser = True
    user.save()
    client.force_login(user)
    if kind:
        add_history(item, kind, user)
    if bulk:
        response = client.post("/admin/equipment/equipment/", {
            "action": "delete_without_history", "_selected_action": [item.pk], "post": "yes",
        }, follow=True)
    else:
        response = client.post(f"/admin/equipment/equipment/{item.pk}/delete/", {"post": "yes"}, follow=True)
    assert response.status_code == 200
    assert Equipment.objects.filter(pk=item.pk).exists() == bool(kind)
    if kind:
        assert "архивирование" in response.content.decode().lower()
