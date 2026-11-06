"""Живой статус: снимок для нового подписчика и события в группу Channels."""
import logging

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db import connection, transaction
from django.utils import timezone

from .models import Equipment
from .status import effective_status, offline_seconds

GROUP = "telemetry"
logger = logging.getLogger(__name__)


def signal_payload(signal):
    if signal.last_seen is None:
        value = None
    elif signal.kind == "state":
        value = signal.last_text
    elif signal.kind == "bool":
        value = None if signal.last_value is None else bool(signal.last_value)
    else:
        value = signal.last_value
    return value


def live_payload(equipment, now=None):
    signals = list(equipment.signals.all())
    return {
        "equipment": equipment.code,
        "status": effective_status(equipment, now),
        "condition": equipment.condition,
        "values": {signal.key: signal_payload(signal) for signal in signals},
        "faults": [signal.key for signal in signals if signal.sensor_fault],
        "signals": {signal.key: {"name": signal.name, "unit": signal.unit, "kind": signal.kind} for signal in signals},
        "ts": equipment.last_seen.timestamp() if equipment.last_seen else None,
        "last_seen": equipment.last_seen.timestamp() if equipment.last_seen else None,
        "offline_seconds": offline_seconds(equipment.type),
    }


def snapshot():
    now = timezone.now()
    items = Equipment.objects.filter(is_active=True).select_related("type").prefetch_related("signals")
    return [live_payload(item, now) for item in items]


def send(payload):
    layer = get_channel_layer()
    if layer is None:
        return
    try:
        async_to_sync(layer.group_send)(GROUP, {"type": "telemetry.update", "payload": payload})
    except Exception:  # Недоступный Redis не должен ронять приём данных.
        logger.exception("Не удалось опубликовать событие телеметрии")


def send_event(payload):
    """Событие не из телеметрии (осмотр, ТО): уходит подписчикам как есть, payload["type"] обязателен."""
    layer = get_channel_layer()
    if layer is None:
        return
    try:
        async_to_sync(layer.group_send)(GROUP, {"type": "live.event", "payload": payload})
    except Exception:
        logger.exception("Не удалось опубликовать событие %s", payload.get("type"))


def publish_equipment(equipment_id):
    item = Equipment.objects.select_related("type").prefetch_related("signals").filter(pk=equipment_id).first()
    if item is not None:
        send(live_payload(item))


def publish_after_commit(equipment_id):
    """Одно событие на оборудование за транзакцию, даже для пакета из сотен записей."""
    # Очередь on_commit очищается при откате, поэтому «залипших» отметок не бывает.
    if any(getattr(entry[1], "equipment_id", None) == equipment_id for entry in connection.run_on_commit):
        return

    def run():
        publish_equipment(equipment_id)

    run.equipment_id = equipment_id
    transaction.on_commit(run)
