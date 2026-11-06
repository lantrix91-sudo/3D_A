"""Картинка станка: снимок 3D-модели из frontend или фото с телефона/веба. Уменьшают клиенты."""
from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from .models import Equipment


def image_payload(item, absolute_url):
    return {
        "image": absolute_url(item.image.url) if item.image else None,
        "image_source": item.image_source or None,
        "image_updated_at": item.image_updated_at.timestamp() if item.image_updated_at else None,
    }


@transaction.atomic
def set_image(equipment, upload, source):
    """Заменяет картинку. Старый файл удаляется из хранилища только после COMMIT."""
    if source not in Equipment.ImageSource.values:
        raise ValidationError({"source": f"Допустимо: {', '.join(Equipment.ImageSource.values)}."})
    if upload is None:
        raise ValidationError({"image": "Приложите файл изображения."})
    item = Equipment.objects.select_for_update().get(pk=equipment.pk)
    old = item.image.name if item.image else None
    field = Equipment._meta.get_field("image")
    for validator in field.validators:
        try:
            validator(upload)
        except ValidationError as exc:
            raise ValidationError({"image": exc.messages}) from exc
    storage = item.image.storage
    item.image.save(upload.name, upload, save=False)
    item.image_source, item.image_updated_at = source, timezone.now()
    Equipment.objects.filter(pk=item.pk).update(image=item.image.name, image_source=source,
                                                image_updated_at=item.image_updated_at)
    if old and old != item.image.name:
        transaction.on_commit(lambda: storage.delete(old))
    return item
