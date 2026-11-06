import os

from channels.routing import ProtocolTypeRouter, URLRouter
from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
# Django инициализируется до импорта consumers, которые используют модели.
django_application = get_asgi_application()

from django.urls import path  # noqa: E402
from equipment.consumers import LiveConsumer  # noqa: E402

# JWT передаётся в query (?token=), браузерный WebSocket не умеет заголовки; Origin не проверяем —
# без действующего токена соединение закрывается.
application = ProtocolTypeRouter({
    "http": django_application,
    "websocket": URLRouter([path("ws/v1/live/", LiveConsumer.as_asgi())]),
})
