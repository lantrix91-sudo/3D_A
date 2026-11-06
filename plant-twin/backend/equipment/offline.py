"""Перевод в offline по таймауту и очистка журнала дедупликации."""
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from .live import publish_after_commit
from .models import Equipment, IngestPacket
from .status import OFFLINE, is_stale


def mark_offline(now=None):
    """Возвращает коды оборудования, переведённого в offline; каждому рассылается событие."""
    now = now or timezone.now()
    changed = []
    candidates = Equipment.objects.select_related("type").filter(last_seen__isnull=False).exclude(status=OFFLINE)
    with transaction.atomic():
        for item in candidates:
            if not is_stale(item, now):
                continue
            # Условие по last_seen защищает от гонки со свежим пакетом.
            if Equipment.objects.filter(pk=item.pk, last_seen=item.last_seen).update(status=OFFLINE, status_changed_at=now):
                changed.append(item.code)
                publish_after_commit(item.pk)
    return changed


def purge_packets(now=None):
    """Пакеты старше окна приёма больше не могут прийти повторно — журнал можно чистить."""
    now = now or timezone.now()
    border = now - timedelta(seconds=settings.INGEST_MAX_AGE_SECONDS + 3600)
    return IngestPacket.objects.filter(ts__lt=border, received_at__lt=border).delete()[0]
