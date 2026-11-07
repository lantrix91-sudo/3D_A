import json
import os
from datetime import timedelta
from pathlib import Path

import dj_database_url
from django.core.exceptions import ImproperlyConfigured
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
# Переменные процесса имеют приоритет над локальным .env.
if os.getenv("DJANGO_READ_DOT_ENV", "true").lower() == "true":
    load_dotenv(BASE_DIR / ".env")

def env_bool(name, default=False):
    value = os.getenv(name, str(default)).strip().lower()
    if value not in {"true", "false", "1", "0", "yes", "no"}:
        raise ImproperlyConfigured(f"{name} must be true or false.")
    return value in {"true", "1", "yes"}


def env_list(name, default=""):
    return [value.strip() for value in os.getenv(name, default).split(",") if value.strip()]


# Старые DJANGO_* остаются совместимыми с существующим локальным .env.
SECRET_KEY = os.getenv("SECRET_KEY", os.getenv("DJANGO_SECRET_KEY", ""))
if len(SECRET_KEY) < 50:
    raise ImproperlyConfigured("Задайте SECRET_KEY длиной минимум 50 символов.")
DEBUG = env_bool("DEBUG", env_bool("DJANGO_DEBUG"))
ALLOWED_HOSTS = env_list("ALLOWED_HOSTS", os.getenv("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1" if DEBUG else ""))
CSRF_TRUSTED_ORIGINS = env_list("CSRF_TRUSTED_ORIGINS")
LOCAL_IP = os.getenv("LOCAL_IP", "").strip()
if DEBUG and LOCAL_IP:
    if LOCAL_IP not in ALLOWED_HOSTS:
        ALLOWED_HOSTS.append(LOCAL_IP)
    for origin in (f"http://{LOCAL_IP}:5173", f"http://{LOCAL_IP}:8000"):
        if origin not in CSRF_TRUSTED_ORIGINS:
            CSRF_TRUSTED_ORIGINS.append(origin)
if DEBUG:
    # Временный показ через cloudflared quick tunnel: Vite проксирует запросы с Host *.trycloudflare.com.
    # Только для разработки; при DEBUG=false хосты задаются явно в ALLOWED_HOSTS.
    ALLOWED_HOSTS.append(".trycloudflare.com")
    CSRF_TRUSTED_ORIGINS.append("https://*.trycloudflare.com")
try:
    DEVICE_API_KEYS = json.loads(os.getenv("DEVICE_API_KEYS", "{}"))
except json.JSONDecodeError as exc:
    raise ImproperlyConfigured("DEVICE_API_KEYS must be a JSON object.") from exc
if not isinstance(DEVICE_API_KEYS, dict) or any(
    not isinstance(key, str) or not key or not isinstance(value, str) or not value
    for key, value in DEVICE_API_KEYS.items()
):
    raise ImproperlyConfigured("DEVICE_API_KEYS must map device IDs to non-empty secret strings.")

# Телеметрия: таймаут offline можно переопределить в типе оборудования.
STATUS_OFFLINE_SECONDS = int(os.getenv("STATUS_OFFLINE_SECONDS", "180"))
READING_MIN_INTERVAL_SECONDS = int(os.getenv("READING_MIN_INTERVAL_SECONDS", "30"))
INGEST_MAX_BATCH = 500
INGEST_MAX_FUTURE_SECONDS = 5 * 60
INGEST_MAX_AGE_SECONDS = 7 * 24 * 3600
# Приём без X-Device-Key — только для локальной разработки.
ALLOW_UNAUTHENTICATED_DEVICES = env_bool("ALLOW_UNAUTHENTICATED_DEVICES", False)
if ALLOW_UNAUTHENTICATED_DEVICES and not DEBUG:
    raise ImproperlyConfigured("ALLOW_UNAUTHENTICATED_DEVICES допустим только при DEBUG=true.")

SECURE_PROXY_SSL_HEADER =("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = env_bool("SECURE_SSL_REDIRECT", not DEBUG)
SECURE_REDIRECT_EXEMPT = [r"^health/$"]
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG
SECURE_HSTS_SECONDS = int(os.getenv("SECURE_HSTS_SECONDS", "31536000" if not DEBUG else "0"))
SECURE_HSTS_INCLUDE_SUBDOMAINS = env_bool("SECURE_HSTS_INCLUDE_SUBDOMAINS", False)
SECURE_HSTS_PRELOAD = env_bool("SECURE_HSTS_PRELOAD", False)

INSTALLED_APPS = [
    "daphne",
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "corsheaders",
    "rest_framework",
    "rest_framework_simplejwt.token_blacklist",
    "drf_spectacular",
    "channels",
    "storages",
    "accounts",
    "plants",
    "equipment",
    "rounds",
]
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]
ROOT_URLCONF = "config.urls"
TEMPLATES = [{
    "BACKEND": "django.template.backends.django.DjangoTemplates",
    "DIRS": [],
    "APP_DIRS": True,
    "OPTIONS": {"context_processors": [
        "django.template.context_processors.request",
        "django.contrib.auth.context_processors.auth",
        "django.contrib.messages.context_processors.messages",
    ]},
}]
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"
REDIS_URL = os.getenv("REDIS_URL", "")
if REDIS_URL:
    CHANNEL_LAYERS = {"default": {
        "BACKEND": "channels_redis.core.RedisChannelLayer",
        # channels_redis ждёт сообщения командой BZPOPMIN по 5 с, а в redis-py 8 таймаут сокета тоже 5 с:
        # чтение обрывалось раньше ответа Redis, и WebSocket закрывался каждые ~6 с без событий.
        # socket_timeout должен быть заметно больше brpop_timeout (см. tests/test_deployment.py).
        "CONFIG": {"hosts": [{
            "address": REDIS_URL,
            "socket_timeout": 15,
            "socket_connect_timeout": 5,
            "socket_keepalive": True,
            "health_check_interval": 30,  # PING перед командой на соединении, простоявшем дольше 30 с
        }]},
    }}
elif DEBUG:
    CHANNEL_LAYERS = {"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}
else:
    raise ImproperlyConfigured("REDIS_URL is required when DEBUG=False; InMemory is development-only.")

DATABASES = {"default": dj_database_url.parse(os.getenv("DATABASE_URL", "sqlite:///db.sqlite3"))}
database = DATABASES["default"]
if database["ENGINE"] == "django.db.backends.sqlite3" and database["NAME"] != ":memory:":
    database["NAME"] = BASE_DIR / database["NAME"]

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]
LANGUAGE_CODE = "ru-ru"
TIME_ZONE = os.getenv("TIME_ZONE", "Asia/Qyzylorda")
USE_I18N = True
USE_TZ = True
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

MEDIA_URL = "/media/"
# Относительный путь считается от backend; абсолютный можно задать в .env.
MEDIA_ROOT = BASE_DIR / Path(os.getenv("MEDIA_ROOT", "media"))
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}
# Наличие bucket включает S3/R2; без него — локальные media для разработки.
AWS_STORAGE_BUCKET_NAME = os.getenv("AWS_STORAGE_BUCKET_NAME", "")
if AWS_STORAGE_BUCKET_NAME:
    STORAGES["default"] = {
        "BACKEND": "storages.backends.s3.S3Storage",
        "OPTIONS": {
            "bucket_name": AWS_STORAGE_BUCKET_NAME,
            "access_key": os.getenv("AWS_ACCESS_KEY_ID") or None,
            "secret_key": os.getenv("AWS_SECRET_ACCESS_KEY") or None,
            "endpoint_url": os.getenv("AWS_S3_ENDPOINT_URL") or None,
            "region_name": os.getenv("AWS_S3_REGION_NAME") or None,
            "custom_domain": os.getenv("AWS_S3_CUSTOM_DOMAIN") or None,
            "querystring_auth": env_bool("AWS_QUERYSTRING_AUTH", True),
            "querystring_expire": int(os.getenv("AWS_QUERYSTRING_EXPIRE", "3600")),
            "signature_version": "s3v4",
            "default_acl": None,
            "file_overwrite": False,
        },
    }
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
CORS_ALLOWED_ORIGINS = env_list("CORS_ALLOWED_ORIGINS", "http://localhost:5173" if DEBUG else "")
# Android-приложение «Обход» (mobile/, Capacitor): интерфейс открыт с http://localhost внутри APK,
# запросы идут прямо на backend. При DEBUG=false origin добавляется явно в CORS_ALLOWED_ORIGINS.
MOBILE_APP_ORIGINS = ["http://localhost", "https://localhost", "capacitor://localhost"]
if DEBUG:
    CORS_ALLOWED_ORIGINS += [origin for origin in MOBILE_APP_ORIGINS if origin not in CORS_ALLOWED_ORIGINS]
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["rest_framework_simplejwt.authentication.JWTAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "EXCEPTION_HANDLER": "config.exceptions.api_exception_handler",
}
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=int(os.getenv("JWT_ACCESS_MINUTES", "15"))),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=int(os.getenv("JWT_REFRESH_DAYS", "7"))),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "AUTH_HEADER_TYPES": ("Bearer",),
}
SPECTACULAR_SETTINGS = {
    "TITLE": "Plant Twin API",
    "DESCRIPTION": "Авторизация и план производства. Форматы описаны в docs/api-контракт.md.",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "SWAGGER_UI_SETTINGS": {"persistAuthorization": False},
}
