import json
from pathlib import Path
from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from equipment.services import import_equipment


class Command(BaseCommand):
    help = "Импорт оборудования из объекта {equipment: [...]}; --dry-run откатывает изменения."

    def add_arguments(self, parser):
        parser.add_argument("json_file")
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args, **options):
        path = Path(options["json_file"])
        # Поддерживаем data/... как от backend/, так и от корня проекта.
        if not path.is_absolute() and not path.exists():
            path = settings.BASE_DIR.parent / path
        try:
            document = json.loads(path.read_text(encoding="utf-8-sig"))
            result = import_equipment(document, options["dry_run"])
        except (OSError, ValueError, ValidationError) as exc:
            raise CommandError(f"Создано: 0; обновлено: 0; ошибок: 1. {exc}") from exc
        for error in result["errors"]:
            self.stderr.write(error)
        if result["errors"]:
            raise CommandError(f"Создано: 0; обновлено: 0; ошибок: {len(result['errors'])}. Весь импорт отменён.")
        prefix = "DRY-RUN (изменения отменены). " if options["dry_run"] else ""
        self.stdout.write(f"{prefix}Создано: {result['created']}; обновлено: {result['updated']}; ошибок: 0.")
