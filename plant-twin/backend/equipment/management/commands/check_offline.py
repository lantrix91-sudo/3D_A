import time

from django.core.management.base import BaseCommand
from django.db import close_old_connections

from equipment.offline import mark_offline, purge_packets


class Command(BaseCommand):
    help = "Переводит в offline оборудование без свежих данных и рассылает событие. --loop N — повторять каждые N секунд."

    def add_arguments(self, parser):
        parser.add_argument("--loop", type=int, default=0, metavar="SECONDS",
                            help="Работать постоянно с этим интервалом (фоновая задача).")

    def handle(self, *args, loop, **options):
        while True:
            close_old_connections()
            try:
                changed = mark_offline()
                purged = purge_packets()
            except Exception as exc:  # В режиме --loop временный сбой БД не должен останавливать проверку.
                if not loop:
                    raise
                self.stderr.write(f"check_offline: {exc}")
            else:
                if changed or not loop:
                    self.stdout.write(f"offline: {', '.join(changed) or 'нет изменений'}; очищено пакетов: {purged}")
            if not loop:
                return
            time.sleep(loop)
