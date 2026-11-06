"""Стены и колонны плана зоны: проверка формата walls.v1 и сохранение с контролем версии."""
import math

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction

from .models import PlanWalls, PlanWallsVersion

HISTORY_LIMIT = 20
MAX_ITEMS = 5000
MAX_COORDINATE = 10000
MAX_THICKNESS = 5
WALL_KINDS = ("outer", "inner", "new", "partition")
WALL_FIELDS = {"id", "x1", "z1", "x2", "z2", "t", "kind"}
COLUMN_FIELDS = {"id", "x", "z"}
DATA_FIELDS = {"walls", "columns", "seq"}


class VersionConflict(Exception):
    """Стены уже изменил кто-то другой: base_version устарела."""
    def __init__(self, current):
        self.current = current
        super().__init__("Версия устарела.")


def is_number(value):
    return not isinstance(value, bool) and isinstance(value, (int, float)) and math.isfinite(value)


def check_id(item, seen, label):
    identifier = item.get("id")
    if not isinstance(identifier, str) or not 0 < len(identifier) <= 32:
        raise ValidationError(f"{label}: id — непустая строка до 32 символов.")
    if identifier in seen:
        raise ValidationError(f"{label}: повторяется id {identifier}.")
    seen.add(identifier)


def check_coordinates(item, fields, label):
    for field in fields:
        if not is_number(item[field]) or abs(item[field]) > MAX_COORDINATE:
            raise ValidationError(f"{label} {item['id']}: {field} — число в пределах ±{MAX_COORDINATE} м.")


def validate_walls_data(data):
    """Формат walls.v1: {"walls": [...], "columns": [...], "seq": 1}. Координаты — в системе чертежа двойника."""
    if not isinstance(data, dict) or set(data) != DATA_FIELDS:
        raise ValidationError("data: ожидается объект с полями walls, columns, seq.")
    walls, columns, seq = data["walls"], data["columns"], data["seq"]
    if not isinstance(walls, list) or not isinstance(columns, list):
        raise ValidationError("data: walls и columns должны быть списками.")
    if len(walls) > MAX_ITEMS or len(columns) > MAX_ITEMS:
        raise ValidationError(f"data: не более {MAX_ITEMS} стен и {MAX_ITEMS} колонн.")
    if isinstance(seq, bool) or not isinstance(seq, int) or seq < 0:
        raise ValidationError("data: seq — неотрицательное целое число.")
    seen = set()
    for wall in walls:
        if not isinstance(wall, dict) or set(wall) != WALL_FIELDS:
            raise ValidationError(f"Стена: нужны поля {', '.join(sorted(WALL_FIELDS))}.")
        check_id(wall, seen, "Стена")
        check_coordinates(wall, ("x1", "z1", "x2", "z2"), "Стена")
        if not is_number(wall["t"]) or not 0 < wall["t"] <= MAX_THICKNESS:
            raise ValidationError(f"Стена {wall['id']}: толщина t — от 0 до {MAX_THICKNESS} м.")
        if wall["kind"] not in WALL_KINDS:
            raise ValidationError(f"Стена {wall['id']}: kind — одно из {', '.join(WALL_KINDS)}.")
    seen = set()
    for column in columns:
        if not isinstance(column, dict) or set(column) != COLUMN_FIELDS:
            raise ValidationError(f"Колонна: нужны поля {', '.join(sorted(COLUMN_FIELDS))}.")
        check_id(column, seen, "Колонна")
        check_coordinates(column, ("x", "z"), "Колонна")


def save_walls(zone, data, base_version, user=None):
    """Сохраняет новую версию, если base_version совпадает с текущей; иначе VersionConflict."""
    validate_walls_data(data)
    try:
        with transaction.atomic():
            # Блокировка строки: два одновременных PUT не получат один и тот же номер версии.
            current = PlanWalls.objects.select_for_update().filter(zone=zone).first()
            if (current.version if current else 0) != base_version:
                raise VersionConflict(current)
            version = base_version + 1
            if current is None:
                current = PlanWalls.objects.create(zone=zone, data=data, version=version, updated_by=user)
            else:
                current.data, current.version, current.updated_by = data, version, user
                current.save()
            PlanWallsVersion.objects.create(plan_walls=current, version=version, data=data, updated_by=user)
            current.versions.filter(version__lte=version - HISTORY_LIMIT).delete()
            return current
    except IntegrityError as exc:
        # Первое сохранение зоны: параллельный запрос успел создать запись раньше.
        raise VersionConflict(PlanWalls.objects.filter(zone=zone).first()) from exc


def user_name(user):
    return user.username if user else None


def walls_payload(zone, record):
    """Ответ API. record=None — на сервере стен ещё нет: клиент показывает стены проекта."""
    if record is None:
        return {"zone": zone.pk, "version": 0, "data": None, "updated_by": None, "updated_at": None}
    return {"zone": zone.pk, "version": record.version, "data": record.data,
            "updated_by": user_name(record.updated_by), "updated_at": record.updated_at.timestamp()}
