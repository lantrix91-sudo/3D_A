"""Расчёт статуса оборудования по правилам типа. Конкретные типы в коде не упоминаются."""
import operator
from datetime import timedelta

from django.conf import settings
from django.utils import timezone

RUN, STOP, ALARM, OFFLINE, UNKNOWN = "run", "stop", "alarm", "offline", "unknown"
# Общая карта по умолчанию; тип может задать свою в status_rules.state_map.
DEFAULT_STATE_MAP = {
    "run": RUN, "stop": STOP, "alarm": ALARM,
    "1": RUN, "0": STOP, "2": ALARM, "true": RUN, "false": STOP,
}
OPERATORS = {">": operator.gt, ">=": operator.ge, "<": operator.lt, "<=": operator.le,
             "==": operator.eq, "!=": operator.ne}


def offline_seconds(equipment_type):
    return equipment_type.offline_seconds or settings.STATUS_OFFLINE_SECONDS


def is_stale(equipment, now=None):
    if equipment.last_seen is None:
        return False
    now = now or timezone.now()
    return now - equipment.last_seen > timedelta(seconds=offline_seconds(equipment.type))


def effective_status(equipment, now=None):
    """Сохранённый статус с учётом таймаута — корректен и до запуска watchdog."""
    return OFFLINE if is_stale(equipment, now) else equipment.status


def signal_value(signal):
    """Значение сигнала для правил; None, если данных нет или датчик неисправен."""
    if signal.sensor_fault or signal.last_seen is None:
        return None
    if signal.kind == "state":
        return signal.last_text
    if signal.kind == "bool":
        return None if signal.last_value is None else bool(signal.last_value)
    return signal.last_value


def check(condition, values):
    current = values.get(condition["signal"])
    if current is None:
        return False
    expected = condition["value"]
    if isinstance(current, str) or isinstance(expected, str):
        current, expected = str(current), str(expected)
    try:
        return OPERATORS[condition["op"]](current, expected)
    except TypeError:
        return False


def compute_status(equipment, signals):
    """Статус по свежим значениям сигналов: alarm_if → state-сигнал → run_if → unknown."""
    if equipment.last_seen is None:
        return UNKNOWN
    rules = equipment.type.status_rules or {}
    values = {signal.key: signal_value(signal) for signal in signals}
    if any(check(condition, values) for condition in rules.get("alarm_if", [])):
        return ALARM
    state_key = rules.get("state_signal") or next((s.key for s in signals if s.kind == "state"), None)
    if state_key is not None and values.get(state_key) is not None:
        raw = values[state_key]
        raw = str(raw).lower() if isinstance(raw, bool) else str(raw)
        return {**DEFAULT_STATE_MAP, **rules.get("state_map", {})}.get(raw, UNKNOWN)
    if rules.get("run_if"):
        conditions = rules["run_if"]
        if any(values.get(condition["signal"]) is None for condition in conditions):
            return UNKNOWN
        return RUN if all(check(condition, values) for condition in conditions) else STOP
    return UNKNOWN
