import time
import uuid
from contextlib import contextmanager

import pytest
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db import connection
from django.db.migrations.executor import MigrationExecutor

from equipment.live import GROUP
from equipment.models import Equipment, EquipmentType
from plants.models import Plant, Zone
from rounds.models import Inspection, Route, RouteStop
from tests.test_plan import authorize

ROUTES = "/api/v1/rounds/routes/"


@pytest.fixture
def items(db):
    zone = Zone.objects.create(plant=Plant.objects.create(code="f", name="Завод"), code="z", name="Цех")
    kind = EquipmentType.objects.create(code="ov", name="Печь", signal_templates=[])
    return {code: Equipment.objects.create(code=code, name=code.upper(), zone=zone, type=kind) for code in ("a", "b", "c", "d")}


@pytest.fixture
def engineer(client, user):
    authorize(client, user, role="engineer")
    return client


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


def codes(route_json):
    return [stop["equipment"] for stop in route_json["stops"]]


@pytest.mark.django_db
def test_create_with_stops_in_order_and_today_by_route(engineer, items, events):
    with committed():
        response = engineer.post(ROUTES, {"name": "Печи A→D", "stops": ["d", "a", "c"]}, format="json")
    assert response.status_code == 201
    route = response.json()
    assert codes(route) == ["d", "a", "c"] and [s["position"] for s in route["stops"]] == [0, 1, 2]
    assert events() == [{"type": "route_changed", "route": route["id"]}]
    today = engineer.get(f"/api/v1/rounds/today/?route={route['id']}").json()
    assert [s["equipment"] for s in today["stops"]] == ["d", "a", "c"]
    assert today["route"] == {"id": route["id"], "name": "Печи A→D"}
    assert (today["total"], today["done"]) == (3, 0)


@pytest.mark.django_db
def test_reorder_replaces_stops_atomically(engineer, items, events):
    with committed():
        route = engineer.post(ROUTES, {"name": "R", "stops": ["a", "b", "c"]}, format="json").json()
    assert len(events()) == 1  # маршрут и шаги в одном запросе — одно событие
    url = f"{ROUTES}{route['id']}/stops/"
    with committed():
        assert codes(engineer.put(url, {"equipment": ["c", "a"]}, format="json").json()) == ["c", "a"]
    assert events()[-1] == {"type": "route_changed", "route": route["id"]}
    assert codes(engineer.put(url, ["b", "c", "a"], format="json").json()) == ["b", "c", "a"]  # и просто список
    for bad, message in [(["a", "zzz"], "zzz"), (["a", "a"], "только один раз"), ("a", "список"), ([1], "список")]:
        response = engineer.put(url, {"equipment": bad}, format="json")
        assert response.status_code == 400 and message in response.json()["error"]["message"]
    assert codes(engineer.get(f"{ROUTES}{route['id']}/").json()) == ["b", "c", "a"]  # ошибка ничего не испортила


@pytest.mark.django_db
def test_rename_deactivate_and_delete_keep_inspections(engineer, items):
    route = engineer.post(ROUTES, {"name": "R", "stops": ["a"]}, format="json").json()
    url = f"{ROUTES}{route['id']}/"
    assert engineer.patch(url, {"name": "  Утренний  "}, format="json").json()["name"] == "Утренний"
    assert engineer.patch(url, {"name": ""}, format="json").status_code == 400
    engineer.post("/api/v1/rounds/inspections/", {"client_id": str(uuid.uuid4()), "equipment": "a",
                                                   "inspected_at": time.time() - 60}, format="multipart")
    assert engineer.delete(url).status_code == 204
    assert not Route.objects.exists() and not RouteStop.objects.exists()
    assert Inspection.objects.count() == 1
    assert engineer.get(url).status_code == 404


@pytest.mark.django_db
def test_deleted_equipment_disappears_from_route(engineer, items):
    route = engineer.post(ROUTES, {"name": "R", "stops": ["a", "b", "c"]}, format="json").json()
    items["b"].delete()
    assert codes(engineer.get(f"{ROUTES}{route['id']}/").json()) == ["a", "c"]
    assert [s["equipment"] for s in engineer.get(f"/api/v1/rounds/today/?route={route['id']}").json()["stops"]] == ["a", "c"]


@pytest.mark.django_db
def test_one_equipment_in_several_routes_and_rings(engineer, items):
    first = engineer.post(ROUTES, {"name": "1", "order": 1, "stops": ["a", "b"]}, format="json").json()
    engineer.post(ROUTES, {"name": "2", "order": 2, "stops": ["b", "c"]}, format="json")
    engineer.post(ROUTES, {"name": "Старый", "order": 3, "is_active": False, "stops": ["d"]}, format="json")
    engineer.post("/api/v1/rounds/inspections/", {"client_id": str(uuid.uuid4()), "equipment": "b",
                                                   "inspected_at": time.time() - 60}, format="multipart")
    today = engineer.get("/api/v1/rounds/today/").json()
    assert today["route"]["id"] == first["id"]  # без параметра — первый активный, как раньше единый маршрут
    assert today["route_equipment"] == ["a", "b", "c"]  # d только в неактивном маршруте — кольца нет
    assert today["inspected"] == ["b"]


@pytest.mark.django_db
def test_without_routes_behaves_as_before(engineer, items):
    Equipment.objects.filter(code="d").update(condition="decommissioned")
    today = engineer.get("/api/v1/rounds/today/").json()
    assert today["route"] is None
    assert [s["equipment"] for s in today["stops"]] == ["a", "b", "c"]
    assert today["route_equipment"] == ["a", "b", "c"]
    assert engineer.get("/api/v1/rounds/today/?route=999").status_code == 404


@pytest.mark.django_db
def test_operator_reads_but_cannot_change(client, user, items):
    route = Route.objects.create(name="R")
    authorize(client, user, role="operator")
    assert client.get(ROUTES).status_code == 200
    assert client.get(f"{ROUTES}{route.pk}/").status_code == 200
    assert client.post(ROUTES, {"name": "X"}, format="json").status_code == 403
    assert client.patch(f"{ROUTES}{route.pk}/", {"name": "X"}, format="json").status_code == 403
    assert client.put(f"{ROUTES}{route.pk}/stops/", ["a"], format="json").status_code == 403
    assert client.delete(f"{ROUTES}{route.pk}/").status_code == 403
    client.credentials()
    assert client.get(ROUTES).status_code == 401


@pytest.mark.django_db(transaction=True)
def test_migration_turns_single_route_into_main():
    executor = MigrationExecutor(connection)
    latest = executor.loader.graph.leaf_nodes()
    # Остальные приложения — последнее состояние, rounds — до маршрутов.
    old = [node for node in latest if node[0] != "rounds"] + [("rounds", "0001_initial")]
    try:
        executor.migrate(old)
        apps = executor.loader.project_state(old).apps
        plant = apps.get_model("plants", "Plant").objects.create(code="mig", name="Завод")
        zone = apps.get_model("plants", "Zone").objects.create(plant=plant, code="z", name="Цех")
        kind = apps.get_model("equipment", "EquipmentType").objects.create(code="mig-t", name="Тип")
        Equipment_ = apps.get_model("equipment", "Equipment")
        made = [Equipment_.objects.create(code=f"m{i}", name=f"M{i}", zone=zone, type=kind) for i in range(3)]
        Stop = apps.get_model("rounds", "RouteStop")
        for equipment, order in zip(made, (20, 5, 10)):
            Stop.objects.create(equipment=equipment, order=order)
        Round_ = apps.get_model("rounds", "Round").objects.create(date="2026-10-30")
        apps.get_model("rounds", "Inspection").objects.create(
            round=Round_, equipment=made[0], client_id=uuid.uuid4(), inspected_at="2026-10-30T09:00:00Z", result="ok")
        executor = MigrationExecutor(connection)
        executor.migrate(latest)
        apps = executor.loader.project_state(latest).apps
        [route] = apps.get_model("rounds", "Route").objects.all()
        assert route.name == "Основной" and route.is_active
        stops = apps.get_model("rounds", "RouteStop").objects.filter(route=route).order_by("position")
        assert [(s.equipment.code, s.position) for s in stops] == [("m1", 0), ("m2", 1), ("m0", 2)]
        assert apps.get_model("rounds", "Inspection").objects.count() == 1
    finally:
        MigrationExecutor(connection).migrate(latest)


@pytest.mark.django_db(transaction=True)
def test_migration_without_old_route_creates_nothing():
    executor = MigrationExecutor(connection)
    latest = executor.loader.graph.leaf_nodes()
    try:
        executor.migrate([("rounds", "0001_initial")])
        executor = MigrationExecutor(connection)
        executor.migrate(latest)
        assert not executor.loader.project_state(latest).apps.get_model("rounds", "Route").objects.exists()
    finally:
        MigrationExecutor(connection).migrate(latest)
