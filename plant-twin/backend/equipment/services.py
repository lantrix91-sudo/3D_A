from django.core.exceptions import ValidationError
from django.db import transaction

from plants.models import Zone
from .models import Asset, Equipment, EquipmentType, Signal
from .images import image_payload
from .status import effective_status, offline_seconds
from .validators import validate_signal_templates


def ensure_signals(equipment):
    templates = equipment.type.signal_templates
    validate_signal_templates(templates)
    for template in templates:
        Signal.objects.get_or_create(equipment=equipment, key=template["key"], defaults={
            "name": template["name"], "unit": template["unit"], "kind": template["kind"],
            "device_key": template["key"], "value_type": "float" if template["kind"] == "number" else "bool",
        })


def equipment_queryset():
    return Equipment.objects.select_related("zone", "asset", "type__default_asset")


def asset_payload(asset, absolute_url):
    if asset is None:
        return None
    return {"code": asset.code, "url": absolute_url(asset.glb_file.url) if asset.glb_file else None,
            "led_node_name": asset.led_node_name,
            "rotation_speed_deg_s": asset.rotation_speed_deg_s, "animation_node_name": asset.animation_node_name,
            "size": {"x": asset.size_x, "y": asset.size_y, "z": asset.size_z}}


def equipment_payload(item, absolute_url, staff=False):
    asset = asset_payload(item.effective_asset, absolute_url)
    result = {
        "code": item.code, "name": item.name, "type": item.type.code, "zone": item.zone.code,
        "asset": asset, "pos": {"x": item.pos_x, "y": item.pos_y, "z": item.pos_z},
        "rotation_deg": item.rotation_deg, "status": effective_status(item), "is_active": item.is_active,
        "last_seen": item.last_seen.timestamp() if item.last_seen else None,
        "offline_seconds": offline_seconds(item.type),
        "key_signals": item.type.key_signals,
        "condition": item.condition, "has_telemetry": item.device_id is not None,
        "size": asset["size"] if asset else {"x": item.size_w, "y": item.size_h, "z": item.size_d},
        **image_payload(item, absolute_url),
    }
    if staff:
        result["device_id"] = item.device_id
    return result


@transaction.atomic
def save_equipment(data, instance=None):
    item = instance or Equipment()
    for key, value in data.items():
        setattr(item, key, value)
    item.full_clean()
    item.save()
    return item


def resolve(model, code, label):
    if not isinstance(code, str) or not code:
        raise ValidationError(f"{label}: требуется непустой код.")
    try:
        return model.objects.get(code=code)
    except model.DoesNotExist as exc:
        raise ValidationError(f"{label} «{code}» не найден.") from exc
    except model.MultipleObjectsReturned as exc:
        raise ValidationError(f"{label} «{code}» неоднозначен.") from exc


@transaction.atomic
def import_equipment(document, dry_run=False):
    if not isinstance(document, dict) or not isinstance(document.get("equipment"), list):
        raise ValidationError('Ожидается объект с массивом "equipment".')
    result = {"created": 0, "updated": 0, "errors": []}
    seen = set()
    for number, row in enumerate(document["equipment"], start=1):
        try:
            with transaction.atomic():
                if not isinstance(row, dict):
                    raise ValidationError("Ожидается объект оборудования.")
                required = {"code", "name", "type", "zone", "pos_x", "pos_z"}
                if required - row.keys():
                    raise ValidationError(f"Не хватает полей: {', '.join(sorted(required - row.keys()))}.")
                code = row["code"]
                if not isinstance(code, str) or not code or code in seen:
                    raise ValidationError("Неверный или повторный code.")
                seen.add(code)
                zone = resolve(Zone, row["zone"], "Зона")
                kind = resolve(EquipmentType, row["type"], "Тип")
                item = Equipment.objects.filter(code=code).first()
                created = item is None
                item = item or Equipment(code=code)
                data = {"name": row["name"], "zone": zone, "type": kind}
                if "asset" in row:
                    data["asset"] = resolve(Asset, row["asset"], "Ассет") if row["asset"] is not None else None
                for field in ("pos_x", "pos_y", "pos_z", "rotation_deg"):
                    if field in row:
                        if isinstance(row[field], bool):
                            raise ValidationError(f"{field}: требуется число.")
                        data[field] = row[field]
                # Привязка — только в админке. Импорт разрешает null или уже существующий ID.
                if row.get("device_id") is not None and row["device_id"] != item.device_id:
                    raise ValidationError("device_id назначается только в админке; передайте null.")
                for field, value in data.items():
                    setattr(item, field, value)
                item.full_clean()
                item, created = Equipment.objects.update_or_create(code=code, defaults=data)
                result["created" if created else "updated"] += 1
        except (ValidationError, ValueError, TypeError) as exc:
            message = "; ".join(exc.messages) if isinstance(exc, ValidationError) else str(exc)
            result["errors"].append(f"Строка {number}: {message}")
    # Любая ошибка откатывает весь файл, dry-run также не оставляет сигналы.
    if dry_run or result["errors"]:
        transaction.set_rollback(True)
    return result
