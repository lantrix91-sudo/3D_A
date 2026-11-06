from django.core.exceptions import ValidationError
from django.core.validators import validate_slug


SIGNAL_KINDS = ("state", "number", "bool")
RULE_STATUSES = ("run", "stop", "alarm")
RULE_OPERATORS = (">", ">=", "<", "<=", "==", "!=")


def validate_photo_size(value):
    if value.size > 10 * 1024 * 1024:
        raise ValidationError("Фото не должно превышать 10 МБ.")


def validate_attachment_size(value):
    if value.size > 50 * 1024 * 1024:
        raise ValidationError("Документ не должен превышать 50 МБ.")


def validate_asset_size(value):
    if value.size > 20 * 1024 * 1024:
        raise ValidationError("Размер ассета GLB не должен превышать 20 МБ.")


def validate_signal_templates(value):
    if not isinstance(value, list):
        raise ValidationError("Шаблоны должны быть списком объектов.")
    keys = set()
    for template in value:
        if not isinstance(template, dict) or set(template) != {"key", "name", "unit", "kind"}:
            raise ValidationError("Шаблон должен содержать key, name, unit, kind.")
        if not all(isinstance(v, str) for v in template.values()):
            raise ValidationError("Значения шаблона должны быть строками.")
        validate_slug(template["key"])
        if not template["key"] or len(template["key"]) > 80 or template["key"] in keys:
            raise ValidationError("Ключи шаблонов должны быть непустыми и уникальными, до 80 символов.")
        if not template["name"] or len(template["name"]) > 200 or len(template["unit"]) > 30:
            raise ValidationError("Проверьте длину name (1–200) и unit (до 30).")
        if template["kind"] not in SIGNAL_KINDS:
            raise ValidationError("kind должен быть state, number или bool.")
        keys.add(template["key"])


def validate_conditions(value, name):
    if not isinstance(value, list):
        raise ValidationError(f"{name} должен быть списком условий.")
    for condition in value:
        if not isinstance(condition, dict) or set(condition) != {"signal", "op", "value"}:
            raise ValidationError(f"Условие {name} должно содержать signal, op, value.")
        if not isinstance(condition["signal"], str) or not condition["signal"]:
            raise ValidationError(f"{name}: signal должен быть ключом сигнала.")
        if condition["op"] not in RULE_OPERATORS:
            raise ValidationError(f"{name}: op должен быть одним из {' '.join(RULE_OPERATORS)}.")
        if not isinstance(condition["value"], (int, float, str, bool)):
            raise ValidationError(f"{name}: value должен быть числом, строкой или логическим.")


def validate_status_rules(value):
    """Правила статуса типа оборудования; формат описан в docs/TELEMETRY.md."""
    if not isinstance(value, dict):
        raise ValidationError("Правила статуса должны быть объектом.")
    extra = set(value) - {"state_signal", "state_map", "alarm_if", "run_if"}
    if extra:
        raise ValidationError(f"Неизвестные поля правил: {', '.join(sorted(extra))}.")
    if "state_signal" in value and (not isinstance(value["state_signal"], str) or not value["state_signal"]):
        raise ValidationError("state_signal должен быть ключом сигнала.")
    state_map = value.get("state_map", {})
    if not isinstance(state_map, dict) or any(
        not isinstance(raw, str) or status not in RULE_STATUSES for raw, status in state_map.items()
    ):
        raise ValidationError("state_map: значения устройства → run, stop или alarm.")
    for name in ("alarm_if", "run_if"):
        validate_conditions(value.get(name, []), name)
def validate_key_signals(value):
    from django.core.exceptions import ValidationError
    if not isinstance(value, list) or len(value) > 2 or any(not isinstance(key, str) or not key for key in value):
        raise ValidationError("Укажите список из 0–2 ключей сигналов.")
