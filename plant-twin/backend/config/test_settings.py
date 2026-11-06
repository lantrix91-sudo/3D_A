import os

# pytest загружает настройки до conftest; рабочий .env для тестовой БД не нужен.
os.environ["DJANGO_READ_DOT_ENV"] = "false"
os.environ["SECRET_KEY"] = "test-only-secret-key-" * 4
os.environ["DEBUG"] = "true"
os.environ["REDIS_URL"] = ""
os.environ["AWS_STORAGE_BUCKET_NAME"] = ""
os.environ["DEVICE_API_KEYS"] = "{}"
os.environ["ALLOWED_HOSTS"] = "localhost,127.0.0.1,testserver"
os.environ["CORS_ALLOWED_ORIGINS"] = "http://localhost:5173"
os.environ["SECURE_SSL_REDIRECT"] = "false"
os.environ["DATABASE_URL"] = "sqlite:///:memory:"

from .settings import *  # noqa: F403

DEBUG = False
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
