import json
from pathlib import Path

from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError

from plants.models import PlanWalls, Zone
from plants.walls import save_walls


def find_zone(value):
    """Зона по id или коду. Код может повторяться у разных заводов — тогда нужен id."""
    if value.isdigit() and Zone.objects.filter(pk=int(value)).exists():
        return Zone.objects.get(pk=int(value))
    zones = list(Zone.objects.filter(code=value))
    if not zones:
        raise CommandError(f"Зона «{value}» не найдена.")
    if len(zones) > 1:
        raise CommandError(f"Код «{value}» есть у нескольких заводов, укажите id зоны.")
    return zones[0]


def next_seq(walls):
    """Счётчик новых стен: следующий номер после самой большой N0001, N0002, …"""
    numbers = [int(w["id"][1:]) for w in walls if isinstance(w, dict) and str(w.get("id", ""))[1:].isdigit() and str(w["id"]).startswith("N")]
    return max(numbers, default=0) + 1


class Command(BaseCommand):
    help = "Загрузить стены и колонны из JSON, выгруженного кнопкой «Выгрузить JSON» в редакторе стен."

    def add_arguments(self, parser):
        parser.add_argument("file", help="Путь к JSON-файлу.")
        parser.add_argument("zone", help="id или код зоны.")

    def handle(self, *args, **options):
        zone = find_zone(options["zone"])
        path = Path(options["file"])
        if not path.is_file():
            raise CommandError(f"Файл не найден: {path}")
        try:
            document = json.loads(path.read_text(encoding="utf-8-sig"))
        except (UnicodeDecodeError, ValueError) as exc:
            raise CommandError(f"Файл не является JSON в UTF-8: {exc}") from exc
        if not isinstance(document, dict) or not isinstance(document.get("walls"), list):
            raise CommandError("В файле нет списка стен (walls).")

        current = PlanWalls.objects.filter(zone=zone).first()
        columns = document.get("columns")
        if columns is None:
            # В старых файлах колонн нет: как и в редакторе, они остаются как есть.
            if current is None:
                raise CommandError("В файле нет колонн (columns), а на сервере их тоже ещё нет.")
            columns = current.data["columns"]
        data = {"walls": document["walls"], "columns": columns,
                "seq": document["seq"] if "seq" in document else next_seq(document["walls"])}
        try:
            saved = save_walls(zone, data, current.version if current else 0)
        except ValidationError as exc:
            raise CommandError("; ".join(exc.messages)) from exc
        self.stdout.write(self.style.SUCCESS(
            f"Зона {zone.code}: загружено стен {len(data['walls'])}, колонн {len(data['columns'])}, версия {saved.version}."))
