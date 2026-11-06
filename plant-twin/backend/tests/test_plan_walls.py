"""Стены плана на сервере: чтение, запись с проверкой версии, права ролей, история, импорт."""
import json
from io import StringIO

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError

from plants.models import PlanWalls, PlanWallsVersion, Plant, Zone
from plants.walls import HISTORY_LIMIT, save_walls
from tests.test_plan import authorize

pytestmark = pytest.mark.django_db

WALL = {"id": "W0001", "x1": 0, "z1": 0, "x2": 5.5, "z2": 0, "t": 0.25, "kind": "outer"}
COLUMN = {"id": "C0001", "x": 6, "z": 0}


def walls_data(**extra):
    return {"walls": [WALL], "columns": [COLUMN], "seq": 1, **extra}


@pytest.fixture
def zone():
    return Zone.objects.create(plant=Plant.objects.create(code="factory", name="Завод"), code="main", name="Цех")


def url(zone):
    return f"/api/v1/plan-walls/?zone={zone.pk}"


def put(client, zone, base_version=0, data=None):
    return client.put(url(zone), {"base_version": base_version, "data": data or walls_data()}, format="json")


@pytest.mark.parametrize("role", ["operator", "engineer", "admin"])
def test_all_roles_read(client, user, zone, role):
    save_walls(zone, walls_data(), 0, user)
    authorize(client, user, role)
    response = client.get(url(zone))
    assert response.status_code == 200
    body = response.json()
    assert body["zone"] == zone.pk and body["version"] == 1 and body["data"] == walls_data()
    assert body["updated_by"] == user.username and body["updated_at"] > 0


def test_read_empty_zone_has_version_zero(client, user, zone):
    authorize(client, user)
    assert client.get(url(zone)).json() == {"zone": zone.pk, "version": 0, "data": None, "updated_by": None, "updated_at": None}


def test_read_requires_login_and_role(client, user, zone):
    assert client.get(url(zone)).status_code == 401
    authorize(client, user, None)
    assert client.get(url(zone)).status_code == 403


@pytest.mark.parametrize("query, status", [("", 400), ("?zone=abc", 400), ("?zone=999999", 404)])
def test_read_bad_zone(client, user, zone, query, status):
    authorize(client, user)
    assert client.get(f"/api/v1/plan-walls/{query}").status_code == status


def test_write_with_actual_version(client, user, zone):
    authorize(client, user, "engineer")
    first = put(client, zone, 0)
    assert first.status_code == 200 and first.json()["version"] == 1
    assert first.json()["updated_by"] == user.username
    changed = walls_data(seq=2, walls=[{**WALL, "x2": 9}])
    second = put(client, zone, 1, changed)
    assert second.status_code == 200 and second.json()["version"] == 2
    assert client.get(url(zone)).json()["data"] == changed


@pytest.mark.parametrize("stale", [0, 2, 7])
def test_write_with_stale_version_is_rejected(client, user, zone, stale):
    authorize(client, user, "engineer")
    put(client, zone, 0)
    response = put(client, zone, stale, walls_data(seq=9))
    assert response.status_code == 409
    error = response.json()["error"]
    assert error["code"] == "version_conflict" and user.username in error["message"]
    record = PlanWalls.objects.get(zone=zone)
    assert record.version == 1 and record.data["seq"] == 1
    assert record.versions.count() == 1


def test_first_write_with_non_zero_version_is_rejected(client, user, zone):
    authorize(client, user, "admin")
    assert put(client, zone, 3).status_code == 409
    assert not PlanWalls.objects.exists()


@pytest.mark.parametrize("role, status", [("operator", 403), ("engineer", 200), ("admin", 200)])
def test_write_permissions(client, user, zone, role, status):
    authorize(client, user, role)
    assert put(client, zone).status_code == status


def test_superuser_without_groups_writes(client, user, zone):
    user.is_superuser = True
    authorize(client, user, None)
    assert put(client, zone).status_code == 200
    assert client.get("/api/v1/plan/").json()["can_edit_walls"] is True


def test_anonymous_cannot_write(client, zone):
    assert put(client, zone).status_code == 401


def test_plan_flag_matches_write_permission(client, user, zone):
    authorize(client, user, "operator")
    assert client.get("/api/v1/plan/").json()["can_edit_walls"] is False
    user.groups.clear()
    authorize(client, user, "engineer")
    plan = client.get("/api/v1/plan/").json()
    assert plan["can_edit_walls"] is True and plan["can_edit_layout"] is False


@pytest.mark.parametrize("body", [
    {"data": walls_data()},
    {"base_version": "1", "data": walls_data()},
    {"base_version": True, "data": walls_data()},
    {"base_version": -1, "data": walls_data()},
    {"base_version": 0},
    {"base_version": 0, "data": {"walls": []}},
    {"base_version": 0, "data": {"walls": [], "columns": [], "seq": 1, "extra": 1}},
    {"base_version": 0, "data": {"walls": "x", "columns": [], "seq": 1}},
    {"base_version": 0, "data": walls_data(seq=-1)},
    {"base_version": 0, "data": walls_data(walls=[{**WALL, "x1": "1"}])},
    {"base_version": 0, "data": walls_data(walls=[{**WALL, "t": 0}])},
    {"base_version": 0, "data": walls_data(walls=[{**WALL, "kind": "glass"}])},
    {"base_version": 0, "data": walls_data(walls=[WALL, WALL])},
    {"base_version": 0, "data": walls_data(walls=[{k: v for k, v in WALL.items() if k != "t"}])},
    {"base_version": 0, "data": walls_data(columns=[{"id": "C1", "x": True, "z": 0}])},
])
def test_invalid_body_is_rejected(client, user, zone, body):
    authorize(client, user, "admin")
    response = client.put(url(zone), body, format="json")
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "validation_error"
    assert not PlanWalls.objects.exists()


def test_empty_lists_are_allowed(client, user, zone):
    authorize(client, user, "admin")
    assert put(client, zone, 0, {"walls": [], "columns": [], "seq": 1}).status_code == 200


def test_history_keeps_last_versions(client, user, zone):
    authorize(client, user, "engineer")
    total = HISTORY_LIMIT + 5
    for number in range(total):
        assert put(client, zone, number, walls_data(seq=number)).status_code == 200
    record = PlanWalls.objects.get(zone=zone)
    assert record.version == total
    versions = list(record.versions.values_list("version", flat=True))
    assert versions == list(range(total, total - HISTORY_LIMIT, -1))

    history = client.get(f"/api/v1/plan-walls/history/?zone={zone.pk}").json()
    assert [row["version"] for row in history] == versions
    assert history[0] == {"version": total, "walls": 1, "columns": 1, "updated_by": user.username, "updated_at": history[0]["updated_at"]}


def test_read_old_version_from_history(client, user, zone):
    authorize(client, user, "operator")
    save_walls(zone, walls_data(seq=1), 0, user)
    save_walls(zone, walls_data(seq=2), 1, user)
    old = client.get(url(zone) + "&version=1")
    assert old.status_code == 200 and old.json()["version"] == 1 and old.json()["data"]["seq"] == 1
    assert client.get(url(zone)).json()["data"]["seq"] == 2
    assert client.get(url(zone) + "&version=77").status_code == 404
    assert client.get(url(zone) + "&version=x").status_code == 400


def test_deleting_zone_removes_walls(zone):
    save_walls(zone, walls_data(), 0)
    zone.delete()
    assert not PlanWalls.objects.exists() and not PlanWallsVersion.objects.exists()


def exported(tmp_path, **fields):
    """Файл как после кнопки «Выгрузить JSON»: лишние поля format, stats и т. п. допустимы."""
    path = tmp_path / "steny.json"
    path.write_text(json.dumps({"format": "bakery-twin/walls@1", "stats": {"total": 1}, **fields}, ensure_ascii=False), encoding="utf-8")
    return str(path)


def test_import_walls_by_code_and_id(tmp_path, zone):
    new_wall = {**WALL, "id": "N0007"}
    out = StringIO()
    call_command("import_walls", exported(tmp_path, walls=[WALL, new_wall], columns=[COLUMN]), zone.code, stdout=out)
    assert "версия 1" in out.getvalue()
    record = PlanWalls.objects.get(zone=zone)
    assert record.updated_by is None and record.data["seq"] == 8
    call_command("import_walls", exported(tmp_path, walls=[WALL], columns=[], seq=3), str(zone.pk), stdout=StringIO())
    record.refresh_from_db()
    assert record.version == 2 and record.data == {"walls": [WALL], "columns": [], "seq": 3}
    assert record.versions.count() == 2


def test_import_walls_keeps_columns_when_file_has_none(tmp_path, zone):
    save_walls(zone, walls_data(), 0)
    call_command("import_walls", exported(tmp_path, walls=[{**WALL, "x2": 9}]), zone.code, stdout=StringIO())
    record = PlanWalls.objects.get(zone=zone)
    assert record.data["columns"] == [COLUMN] and record.data["walls"][0]["x2"] == 9


@pytest.mark.parametrize("content, message", [
    ("{not json", "JSON"),
    ('{"columns": []}', "walls"),
    (json.dumps({"walls": [{**WALL, "kind": "glass"}], "columns": []}), "kind"),
    (json.dumps({"walls": [WALL]}), "columns"),
])
def test_import_walls_rejects_bad_files(tmp_path, zone, content, message):
    path = tmp_path / "bad.json"
    path.write_text(content, encoding="utf-8")
    with pytest.raises(CommandError, match=message):
        call_command("import_walls", str(path), zone.code, stdout=StringIO())
    assert not PlanWalls.objects.exists()


def test_import_walls_unknown_zone_and_file(tmp_path, zone):
    with pytest.raises(CommandError, match="Зона"):
        call_command("import_walls", exported(tmp_path, walls=[], columns=[]), "nope", stdout=StringIO())
    with pytest.raises(CommandError, match="Файл"):
        call_command("import_walls", str(tmp_path / "none.json"), zone.code, stdout=StringIO())
