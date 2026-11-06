import json

from django.core.management.base import BaseCommand, CommandError

from equipment.device_keys import issue_key
from equipment.models import Equipment


class Command(BaseCommand):
    help = ("Создаёт ключ X-Device-Key для устройства (или --all для всех с device_id). "
            "Ключи печатаются один раз как JSON device_id → ключ (формат DEVICE_API_KEYS симулятора).")

    def add_arguments(self, parser):
        parser.add_argument("device_ids", nargs="*")
        parser.add_argument("--all", action="store_true", help="Все активные устройства с device_id.")
        parser.add_argument("--name", default="", help="Описание ключа, например «симулятор».")

    def handle(self, *args, device_ids, all, name, **options):
        if all:
            items = list(Equipment.objects.filter(device_id__isnull=False, is_active=True))
        else:
            items = []
            for device_id in device_ids:
                item = Equipment.objects.filter(device_id=device_id).first()
                if item is None:
                    raise CommandError(f"Устройство «{device_id}» не привязано к оборудованию.")
                items.append(item)
        if not items:
            raise CommandError("Укажите device_id или --all (device_id назначается в админке).")
        keys = {item.device_id: issue_key(item, name)[1] for item in items}
        self.stdout.write(json.dumps(keys, ensure_ascii=False))
