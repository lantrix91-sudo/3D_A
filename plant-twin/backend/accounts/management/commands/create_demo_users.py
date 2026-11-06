import os

from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError

from accounts.services import create_demo_users


class Command(BaseCommand):
    help = "Создать demo_operator, demo_engineer, demo_admin и группы ролей."

    def handle(self, *args, **options):
        password = os.getenv("DEMO_USER_PASSWORD", "")
        if not password:
            raise CommandError("Задайте DEMO_USER_PASSWORD в backend/.env.")
        try:
            result = create_demo_users(password)
        except ValidationError as exc:
            raise CommandError("; ".join(exc.messages)) from exc
        for username, created in result:
            state = "создан" if created else "уже существует, без изменений"
            self.stdout.write(f"{username}: {state}")
