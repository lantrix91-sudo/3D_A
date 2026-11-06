"""WebSocket /ws/v1/live/?token=<JWT>: снимок статусов, затем события телеметрии."""
import time
from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import AccessToken

from accounts.services import has_role
from .live import GROUP, snapshot

# Коды закрытия 4xxx: клиент обновляет токен при 4401 и не переподключается при 4403.
CLOSE_UNAUTHORIZED = 4401
CLOSE_FORBIDDEN = 4403


@database_sync_to_async
def authenticate(token):
    """(пользователь, срок действия токена) или (None, код закрытия)."""
    try:
        access = AccessToken(token)
    except TokenError:
        return None, CLOSE_UNAUTHORIZED
    user = get_user_model().objects.filter(pk=access.get("user_id")).first()
    if user is None or not user.is_active:
        return None, CLOSE_UNAUTHORIZED
    if not has_role(user, ("operator", "engineer", "admin")):
        return None, CLOSE_FORBIDDEN
    return user, access["exp"]


class LiveConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        query = parse_qs(self.scope.get("query_string", b"").decode())
        token = (query.get("token") or [""])[0]
        user, detail = await authenticate(token) if token else (None, CLOSE_UNAUTHORIZED)
        if user is None:
            # Принимаем и сразу закрываем с кодом, чтобы браузер увидел причину.
            await self.accept()
            await self.close(code=detail)
            return
        self.expires = detail
        await self.channel_layer.group_add(GROUP, self.channel_name)
        await self.accept()
        await self.send_json({"type": "snapshot", "equipment": await database_sync_to_async(snapshot)()})

    async def disconnect(self, code):
        if getattr(self, "expires", None) is not None:
            await self.channel_layer.group_discard(GROUP, self.channel_name)

    async def receive_json(self, content, **kwargs):
        # Канал только на чтение: команды устройствам не принимаются.
        if content == {"type": "ping"}:
            await self.send_json({"type": "pong"})

    async def telemetry_update(self, event):
        if time.time() >= self.expires:
            await self.close(code=CLOSE_UNAUTHORIZED)
            return
        await self.send_json({"type": "update", **event["payload"]})

    async def live_event(self, event):
        if time.time() >= self.expires:
            await self.close(code=CLOSE_UNAUTHORIZED)
            return
        await self.send_json(event["payload"])
