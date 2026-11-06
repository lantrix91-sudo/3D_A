"""Совместимый с мобильной очередью вход осмотра: JSON и multipart."""
import json
import math
from datetime import datetime, timedelta, timezone as dt_timezone

from django.utils import timezone
from rest_framework import serializers

from .models import Inspection


class ClientId(serializers.UUIDField):
    def to_internal_value(self, data):
        if not isinstance(data, str):
            raise serializers.ValidationError("client_id: ожидается строка UUID.")
        return super().to_internal_value(data)


class StrictText(serializers.CharField):
    def to_internal_value(self, data):
        if not isinstance(data, str):
            raise serializers.ValidationError("Ожидается строка.")
        return super().to_internal_value(data)


class ItemId(serializers.IntegerField):
    def to_internal_value(self, data):
        if isinstance(data, bool) or not isinstance(data, int):
            raise serializers.ValidationError("item: ожидается целое число.")
        return super().to_internal_value(data)


class Moment(serializers.Field):
    def to_internal_value(self, data):
        if isinstance(data, bool) or not isinstance(data, (int, float, str)):
            raise serializers.ValidationError("Ожидается Unix-время в секундах.")
        try:
            value = float(data)
            if not math.isfinite(value):
                raise ValueError()
            moment = datetime.fromtimestamp(value, tz=dt_timezone.utc)
        except (OverflowError, OSError, ValueError):
            raise serializers.ValidationError("Время вне допустимого диапазона.") from None
        return moment


class AnswerSerializer(serializers.Serializer):
    item = ItemId(min_value=1)
    result = StrictText()
    note = StrictText(required=False, default="", allow_blank=True, max_length=500)
    text = StrictText(required=False, default="", allow_blank=True, max_length=300)

    def validate_result(self, value):
        if value not in ("ok", "remark", "fault"):
            raise serializers.ValidationError("Допустимо: ok, remark, fault.")
        return value


class InspectionWriteSerializer(serializers.Serializer):
    client_id = ClientId()
    equipment = StrictText(max_length=80)
    inspected_at = Moment()
    result = StrictText(required=False, default="ok")
    comment = StrictText(required=False, default="", allow_blank=True, max_length=2000)
    answers = AnswerSerializer(many=True, required=False, default=list, max_length=100)

    def validate(self, attrs):
        # Повтор уже принятого осмотра разрешён даже после истечения окна приёма.
        if Inspection.objects.filter(client_id=attrs["client_id"]).exists():
            return attrs
        now = timezone.now()
        if attrs["inspected_at"] > now + timedelta(minutes=5):
            raise serializers.ValidationError({"inspected_at": "Время осмотра в будущем. Проверьте часы телефона."})
        if attrs["inspected_at"] < now - timedelta(hours=48):
            raise serializers.ValidationError({"inspected_at": "Осмотр старше 48 часов не принимается."})
        return attrs

    def to_internal_value(self, data):
        if not hasattr(data, "items"):
            raise serializers.ValidationError({"non_field_errors": ["Тело запроса должно быть объектом."]})
        values = {key: value for key, value in data.items()}
        if isinstance(values.get("answers"), str):
            try:
                values["answers"] = json.loads(values["answers"])
            except (ValueError, RecursionError):
                raise serializers.ValidationError({"answers": "Ожидается JSON-список объектов."}) from None
        return super().to_internal_value(values)

    def validate_result(self, value):
        if value not in ("ok", "remark", "fault"):
            raise serializers.ValidationError("Допустимо: ok, remark, fault.")
        return value
