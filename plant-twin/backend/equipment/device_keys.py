"""Ключи устройств: генерация, хэширование и проверка заголовка X-Device-Key."""
import hashlib
import secrets

from django.utils import timezone

from .models import DeviceKey

KEY_PREFIX = "ptd_"


def hash_key(raw):
    # Ключ — 256 бит случайности, поэтому быстрый SHA-256 достаточен (как для API-токенов).
    return hashlib.sha256(raw.encode()).hexdigest()


def generate(record):
    """Заполняет prefix/key_hash и возвращает открытый ключ. Открытый ключ больше нигде не сохраняется."""
    raw = KEY_PREFIX + secrets.token_urlsafe(32)
    record.prefix, record.key_hash = raw[:12], hash_key(raw)
    return raw


def issue_key(equipment, name=""):
    record = DeviceKey(equipment=equipment, name=name)
    raw = generate(record)
    record.save()
    return record, raw


def check_key(device_id, raw):
    """True, если ключ действующий и принадлежит оборудованию с этим device_id."""
    if not raw or not isinstance(device_id, str):
        return False
    record = DeviceKey.objects.filter(key_hash=hash_key(raw), revoked_at__isnull=True,
                                      equipment__device_id=device_id.strip()).first()
    if record is None:
        return False
    DeviceKey.objects.filter(pk=record.pk).update(last_used_at=timezone.now())
    return True


def revoke(queryset):
    return queryset.filter(revoked_at__isnull=True).update(revoked_at=timezone.now())
