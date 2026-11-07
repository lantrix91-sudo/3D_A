"""Production settings are loaded in a fresh process, without local .env or DB."""
import json
import os
from pathlib import Path
import subprocess
import sys

import pytest


BACKEND = Path(__file__).resolve().parents[1]


def production_env(**changes):
    env = {key: value for key, value in os.environ.items() if not key.startswith((
        "DJANGO_", "AWS_", "SECURE_", "JWT_",
    ))}
    env.update({
        "DJANGO_SETTINGS_MODULE": "config.settings",
        "DJANGO_READ_DOT_ENV": "false",
        "SECRET_KEY": "production-smoke-test-only-not-a-real-secret-1234567890abcdef",
        "DEBUG": "false",
        "DATABASE_URL": "sqlite:///:memory:",
        "REDIS_URL": "redis://127.0.0.1:6379/0",
        "DEVICE_API_KEYS": "{}",
        "ALLOWED_HOSTS": "testserver,healthcheck.railway.app",
        "CORS_ALLOWED_ORIGINS": "https://frontend.example.test",
        "CSRF_TRUSTED_ORIGINS": "https://backend.example.test",
    })
    env.update(changes)
    return env


def run_python(code, **env):
    return subprocess.run(
        [sys.executable, "-c", code], cwd=BACKEND, env=production_env(**env),
        capture_output=True, text=True, timeout=60,
    )


def test_production_asgi_health_security_and_static(tmp_path):
    result = run_python("""
import asyncio
import json
from pathlib import Path
from django.conf import settings
from django.core.management import call_command
from channels.testing import HttpCommunicator
from config.asgi import application
from django.test import Client

settings.STATIC_ROOT = Path(__import__('os').environ['TEST_STATIC_ROOT'])
call_command('collectstatic', interactive=False, verbosity=0)
assert settings.DEBUG is False
assert settings.SESSION_COOKIE_SECURE and settings.CSRF_COOKIE_SECURE
assert settings.SECURE_HSTS_SECONDS > 0
assert settings.CHANNEL_LAYERS['default']['BACKEND'] == 'channels_redis.core.RedisChannelLayer'
# Таймаут сокета больше ожидания BZPOPMIN, иначе простой канала рвёт WebSocket (redis-py 8: по умолчанию 5 с)
from channels_redis.core import RedisChannelLayer
redis_host = settings.CHANNEL_LAYERS['default']['CONFIG']['hosts'][0]
assert redis_host['address'] == 'redis://127.0.0.1:6379/0'
assert redis_host['socket_timeout'] >= RedisChannelLayer.brpop_timeout + 5
assert redis_host['health_check_interval'] > 0 and redis_host['socket_keepalive'] is True
pool = RedisChannelLayer(**settings.CHANNEL_LAYERS['default']['CONFIG']).create_pool(0)
assert pool.connection_kwargs['socket_timeout'] == redis_host['socket_timeout']
client = Client()
response = client.get('/health/', HTTP_HOST='healthcheck.railway.app')
assert response.status_code == 200 and response.json() == {'status': 'ok'}
assert client.get('/admin/').status_code == 301
response = client.get('/health/', HTTP_X_FORWARDED_PROTO='https', HTTP_ORIGIN='https://frontend.example.test')
assert 'max-age=' in response['Strict-Transport-Security']
assert response['Access-Control-Allow-Origin'] == 'https://frontend.example.test'
assert client.get('/health/', HTTP_X_FORWARDED_PROTO='https', HTTP_ORIGIN='https://untrusted.example.test').get('Access-Control-Allow-Origin') is None
response = client.get('/static/admin/css/base.css', HTTP_X_FORWARDED_PROTO='https')
assert response.status_code == 200
response.close()
assert client.get('/media/private.glb', HTTP_X_FORWARDED_PROTO='https').status_code == 404
async def check_asgi():
    response = await HttpCommunicator(application, 'GET', '/health/', headers=[(b'host', b'testserver')]).get_response()
    assert response['status'] == 200
    assert json.loads(response['body']) == {'status': 'ok'}
asyncio.run(check_asgi())
""", TEST_STATIC_ROOT=str(tmp_path / "static"))
    assert result.returncode == 0, result.stdout + result.stderr


def test_debug_defaults_false_and_postgres_configuration():
    env = production_env(DATABASE_URL="postgresql://test:test@localhost:5432/test")
    env.pop("DEBUG")
    result = subprocess.run([sys.executable, "-c", """
from config import settings
assert settings.DEBUG is False
assert settings.DATABASES['default']['ENGINE'] == 'django.db.backends.postgresql'
"""], cwd=BACKEND, env=env, capture_output=True, text=True, timeout=30)
    assert result.returncode == 0, result.stderr


@pytest.mark.parametrize("overrides,message", [
    ({"SECRET_KEY": ""}, "SECRET_KEY"),
    ({"REDIS_URL": ""}, "REDIS_URL"),
    ({"DEVICE_API_KEYS": "[]"}, "DEVICE_API_KEYS"),
    ({"DEVICE_API_KEYS": "invalid"}, "DEVICE_API_KEYS"),
])
def test_invalid_production_configuration_fails(overrides, message):
    result = run_python("from config import settings", **overrides)
    assert result.returncode != 0
    assert message in result.stderr


def test_local_fallback():
    result = run_python("""
from config import settings
assert settings.CHANNEL_LAYERS['default']['BACKEND'] == 'channels.layers.InMemoryChannelLayer'
assert settings.STORAGES['default']['BACKEND'] == 'django.core.files.storage.FileSystemStorage'
assert not settings.SESSION_COOKIE_SECURE
""", DEBUG="true", REDIS_URL="")
    assert result.returncode == 0, result.stderr


def test_lan_host_and_csrf_from_environment():
    result = run_python("""
from config import settings
assert '192.168.3.103' in settings.ALLOWED_HOSTS
assert 'http://192.168.3.103:5173' in settings.CSRF_TRUSTED_ORIGINS
assert 'http://192.168.3.103:8000' in settings.CSRF_TRUSTED_ORIGINS
assert 'testserver' in settings.ALLOWED_HOSTS
""", DEBUG="true", REDIS_URL="", LOCAL_IP="192.168.3.103")
    assert result.returncode == 0, result.stderr


def test_mobile_app_origin_only_in_debug_or_from_environment():
    script = """
from config import settings
assert ('http://localhost' in settings.CORS_ALLOWED_ORIGINS) is {expected}
"""
    result = run_python(script.format(expected=True), DEBUG="true", REDIS_URL="", CORS_ALLOWED_ORIGINS="")
    assert result.returncode == 0, result.stderr
    result = run_python(script.format(expected=False), ALLOWED_HOSTS="backend.example.com")
    assert result.returncode == 0, result.stderr
    result = run_python(script.format(expected=True), ALLOWED_HOSTS="backend.example.com",
                        CORS_ALLOWED_ORIGINS="https://frontend.example.test,http://localhost")
    assert result.returncode == 0, result.stderr


def test_cloudflare_quick_tunnel_only_in_debug():
    script = """
from config import settings
assert ('.trycloudflare.com' in settings.ALLOWED_HOSTS) is {expected}
assert ('https://*.trycloudflare.com' in settings.CSRF_TRUSTED_ORIGINS) is {expected}
"""
    result = run_python(script.format(expected=True), DEBUG="true", REDIS_URL="")
    assert result.returncode == 0, result.stderr
    result = run_python(script.format(expected=False), DEBUG="false", REDIS_URL="redis://127.0.0.1:6379/0",
                        ALLOWED_HOSTS="backend.example.com")
    assert result.returncode == 0, result.stderr


def test_s3_signed_absolute_urls_without_network():
    result = run_python("""
import django
django.setup()
from django.core.files.storage import default_storage
from django.test import RequestFactory
from equipment.models import Asset
from equipment.services import asset_payload
request = RequestFactory().get('/', HTTP_HOST='testserver', HTTP_X_FORWARDED_PROTO='https')
url = asset_payload(Asset(code='test', glb_file='assets/test.glb'), request.build_absolute_uri)['url']
assert url.startswith('https://storage.example.test/')
assert 'X-Amz-Signature=' in url
""", AWS_STORAGE_BUCKET_NAME="test-bucket", AWS_ACCESS_KEY_ID="test-access-id",
        AWS_SECRET_ACCESS_KEY="test-secret-not-real", AWS_S3_REGION_NAME="auto",
        AWS_S3_ENDPOINT_URL="https://storage.example.test")
    assert result.returncode == 0, result.stderr
