"""Техническое состояние оборудования: смена с историей и фото, данные карточки."""
from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from .images import image_payload
from .status import effective_status, offline_seconds
from .live import publish_after_commit
from .models import ConditionEvent, ConditionPhoto, Equipment

MAX_PHOTOS = 5


def user_name(user):
    if user is None:
        return None
    return user.get_full_name() or user.username


@transaction.atomic
def change_condition(equipment, condition, actor=None, comment="", photos=(), source=ConditionEvent.Source.MANUAL):
    """Записывает событие (даже без смены — как отметку с комментарием/фото) и обновляет оборудование."""
    if condition not in Equipment.Condition.values:
        raise ValidationError({"condition": f"Допустимо: {', '.join(Equipment.Condition.values)}."})
    if not isinstance(comment, str) or len(comment) > 2000:
        raise ValidationError({"comment": "Комментарий — строка до 2000 символов."})
    photos = list(photos)
    if len(photos) > MAX_PHOTOS:
        raise ValidationError({"photos": f"Не более {MAX_PHOTOS} фото за раз."})
    item = Equipment.objects.select_for_update().get(pk=equipment.pk)
    now = timezone.now()
    event = ConditionEvent.objects.create(equipment=item, previous=item.condition, condition=condition,
                                          comment=comment.strip(), source=source, actor=actor, created_at=now)
    for upload in photos:
        photo = ConditionPhoto(event=event, file=upload)
        # Строка — уже сохранённый и проверенный файл (например, фото обхода): ссылаемся без копии.
        if not isinstance(upload, str):
            photo.full_clean(exclude=["event"])
        photo.save()
    if item.condition != condition:
        Equipment.objects.filter(pk=item.pk).update(condition=condition, condition_changed_at=now)
        item.condition, item.condition_changed_at = condition, now
        publish_after_commit(item.pk)
    return event


def event_payload(event, absolute_url):
    return {
        "id": event.pk, "condition": event.condition, "previous": event.previous or None,
        "comment": event.comment, "source": event.source, "actor": user_name(event.actor),
        "created_at": event.created_at.timestamp(),
        "photos": [absolute_url(photo.file.url) for photo in event.photos.all()],
    }


def events_queryset(equipment):
    return equipment.condition_events.select_related("actor").prefetch_related("photos")


def card_payload(item, absolute_url):
    """Всё для карточки оборудования одним запросом: паспорт, состояние, документы, последние события."""
    signals = list(item.signals.all())
    return {
        "code": item.code, "name": item.name, "zone": {"code": item.zone.code, "name": item.zone.name},
        "type": {"code": item.type.code, "name": item.type.name},
        **image_payload(item, absolute_url),
        "condition": item.condition,
        "condition_changed_at": item.condition_changed_at.timestamp() if item.condition_changed_at else None,
        "status": effective_status(item),
        "is_active": item.is_active,
        "offline_seconds": offline_seconds(item.type),
        "has_telemetry": item.device_id is not None,
        "last_seen": item.last_seen.timestamp() if item.last_seen else None,
        "passport": {
            "manufacturer": item.manufacturer, "model": item.model_name, "serial_number": item.serial_number,
            "inventory_number": item.inventory_number,
            "commissioned_on": item.commissioned_on.isoformat() if item.commissioned_on else None,
            "service_contact": item.service_contact, "notes": item.notes,
        },
        "signals": [{"key": s.key, "name": s.name, "unit": s.unit, "kind": s.kind,
                     "min": s.min_value, "max": s.max_value, "nominal": s.nominal_value} for s in signals],
        "documents": [{"title": doc.title, "url": absolute_url(doc.file.url)} for doc in item.documents.all()],
        "events": [event_payload(event, absolute_url) for event in events_queryset(item)[:10]],
        "conditions": [{"value": value, "label": label} for value, label in Equipment.Condition.choices],
    }
