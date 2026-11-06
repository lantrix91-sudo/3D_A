"""Единая точка приёма телеметрии. HTTP, симулятор и будущие коллекторы вызывают только ingest()."""
import math
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone as dt_timezone

from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils import timezone

from .live import publish_after_commit
from .models import Equipment, IngestPacket, Reading
from .status import compute_status, effective_status

MAX_TEXT = 64


class IngestError(Exception):
    """Ошибка данных с машинным кодом; HTTP-слой превращает её в ответ."""

    def __init__(self, code, message, status=400):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status


@dataclass
class IngestResult:
    equipment: Equipment
    duplicate: bool
    status: str
    written: int


def parse_ts(ts, now):
    if ts is None:
        return now
    if isinstance(ts, bool) or not isinstance(ts, (int, float)) or not math.isfinite(ts):
        raise IngestError("invalid_format", "ts: ожидается Unix-время в секундах (число).")
    try:
        moment = datetime.fromtimestamp(ts, tz=dt_timezone.utc)
    except (OverflowError, OSError, ValueError):
        raise IngestError("ts_out_of_range", "ts: значение вне допустимого диапазона.") from None
    if moment > now + timedelta(seconds=settings.INGEST_MAX_FUTURE_SECONDS):
        raise IngestError("ts_out_of_range", "ts: время в будущем более чем на 5 минут. Проверьте часы устройства.")
    if moment < now - timedelta(seconds=settings.INGEST_MAX_AGE_SECONDS):
        raise IngestError("ts_out_of_range", "ts: данные старше 7 суток не принимаются.")
    return moment


def normalize(signal, raw):
    """Значение устройства → (число для истории, текст состояния)."""
    path = f"values.{signal.device_key}"
    if signal.kind == "number":
        if isinstance(raw, bool) or not isinstance(raw, (int, float)) or not math.isfinite(raw):
            raise IngestError("invalid_value", f"{path}: ожидается конечное число.")
        return float(raw), ""
    if signal.kind == "bool":
        if isinstance(raw, bool) or raw in (0, 1):
            return float(raw), ""
        raise IngestError("invalid_value", f"{path}: ожидается true/false или 0/1.")
    if isinstance(raw, bool):
        return float(raw), str(raw).lower()
    if isinstance(raw, int) or (isinstance(raw, float) and math.isfinite(raw) and raw.is_integer()):
        return float(raw), str(int(raw))
    if isinstance(raw, str) and 0 < len(raw) <= MAX_TEXT:
        return None, raw
    raise IngestError("invalid_value", f"{path}: состояние — строка до {MAX_TEXT} символов или целое число.")


def validate_shape(device_id, values, seq, faults):
    if not isinstance(device_id, str) or not device_id.strip():
        raise IngestError("invalid_format", "device_id: требуется непустая строка.")
    if not isinstance(values, dict):
        raise IngestError("invalid_format", "values: ожидается объект {ключ: значение}.")
    if seq is not None and (isinstance(seq, bool) or not isinstance(seq, int) or not 0 <= seq < 2 ** 63):
        raise IngestError("invalid_format", "seq: ожидается неотрицательное целое число.")
    if faults is not None and (not isinstance(faults, list) or not all(isinstance(key, str) for key in faults)):
        raise IngestError("invalid_format", "faults: ожидается список ключей сигналов.")


def previous_reading(signal, ts):
    """Последнее записанное значение до ts: для живых данных — из сигнала, для досылки — из истории."""
    if signal.last_seen is None or ts >= signal.last_seen:
        if signal.last_reading_at is None:
            return None
        return signal.last_value, signal.last_text, signal.sensor_fault, signal.last_reading_at
    reading = signal.readings.filter(ts__lte=ts).order_by("-ts").first()
    return reading and (reading.value, reading.value_text, reading.sensor_fault, reading.ts)


def is_duplicate(equipment, seq, ts):
    packets = IngestPacket.objects.filter(equipment=equipment)
    return (packets.filter(seq=seq) if seq is not None else packets.filter(ts=ts, seq__isnull=True)).exists()


@transaction.atomic
def ingest(device_id, values, ts=None, seq=None, faults=None, source="http"):
    validate_shape(device_id, values, seq, faults)
    now = timezone.now()
    moment = parse_ts(ts, now)
    equipment = Equipment.objects.select_related("type").filter(device_id=device_id.strip()).first()
    if equipment is None:
        raise IngestError("unknown_device", f"Устройство «{device_id}» не привязано к оборудованию.", status=404)
    signals = {signal.device_key: signal for signal in equipment.signals.all()}
    faults = set(faults or [])
    unknown = sorted((set(values) | faults) - set(signals))
    if unknown:
        raise IngestError("unknown_signal", f"Неизвестные ключи для {device_id}: {', '.join(unknown)}. "
                                            f"Доступны: {', '.join(sorted(signals)) or 'нет сигналов'}.")
    parsed = {key: normalize(signals[key], raw) for key, raw in values.items()}

    if is_duplicate(equipment, seq, moment):
        return IngestResult(equipment, True, effective_status(equipment, now), 0)
    try:
        with transaction.atomic():
            IngestPacket.objects.create(equipment=equipment, seq=seq, ts=moment)
    except IntegrityError:  # Параллельная доставка того же пакета.
        return IngestResult(equipment, True, effective_status(equipment, now), 0)

    interval = timedelta(seconds=settings.READING_MIN_INTERVAL_SECONDS)
    readings, changed = [], []
    for key in sorted(set(parsed) | faults):
        signal = signals[key]
        fault = key in faults
        value, text = parsed.get(key, (None, ""))
        previous = previous_reading(signal, moment)
        if (previous is None or previous[2] != fault or (not fault and previous[:2] != (value, text))
                or moment - previous[3] >= interval):
            readings.append(Reading(signal=signal, ts=moment, value=value, value_text=text,
                                    sensor_fault=fault, source=source))
            if signal.last_seen is None or moment >= signal.last_seen:
                signal.last_reading_at = moment
        if signal.last_seen is None or moment >= signal.last_seen:
            # Неисправный датчик не затирает последнее достоверное значение.
            if not fault:
                signal.last_value, signal.last_text = value, text
            signal.sensor_fault = fault
            signal.last_seen = moment
            changed.append(signal)
    Reading.objects.bulk_create(readings)
    if changed:
        type(changed[0]).objects.bulk_update(
            changed, ["last_value", "last_text", "sensor_fault", "last_seen", "last_reading_at"])

    if equipment.last_seen is None or moment >= equipment.last_seen:
        equipment.last_seen = moment
        status = compute_status(equipment, list(signals.values()))
        fields = ["last_seen"]
        if status != equipment.status:
            equipment.status, equipment.status_changed_at = status, now
            fields += ["status", "status_changed_at"]
        Equipment.objects.filter(pk=equipment.pk).update(**{field: getattr(equipment, field) for field in fields})
        publish_after_commit(equipment.pk)
    return IngestResult(equipment, False, effective_status(equipment, now), len(readings))
