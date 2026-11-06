from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status, viewsets
from rest_framework.generics import get_object_or_404
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from django.utils import timezone
from django.db.models import Avg, Min, Max, Q
from django.db.models.functions import TruncMinute
from datetime import timedelta
from django.core.exceptions import ValidationError as DjangoValidationError
from accounts.permissions import IsAdmin, IsEngineer, IsOperator
from .images import image_payload, set_image
from .conditions import card_payload, change_condition, event_payload, events_queryset
from plants.serializers import AssetSerializer, EquipmentSerializer
from django.db import transaction
from .models import Asset, Equipment, EquipmentMoveLog
from .serializers import EquipmentWriteSerializer
from .services import asset_payload, equipment_payload, equipment_queryset


class AssetListView(APIView):
    permission_classes = [IsOperator]

    @extend_schema(responses=AssetSerializer(many=True))
    def get(self, request):
        return Response([asset_payload(asset, request.build_absolute_uri) for asset in Asset.objects.all()])


class EquipmentViewSet(viewsets.ViewSet):
    lookup_field = "code"
    lookup_value_regex = "[-a-zA-Z0-9_]+"

    def get_permissions(self):
        if self.action == "conditions" and self.request.method == "POST":
            return [IsEngineer()]  # Состояние меняет любой инженер, подтверждение не требуется.
        if self.action == "image":
            return [IsEngineer()]  # Картинку станка меняют engineer и admin (роль manager добавим, когда появится).
        return [(IsOperator if self.action in ("list", "retrieve", "readings", "card", "conditions") else IsAdmin)()]

    @extend_schema(responses=dict, description="Карточка: паспорт, состояние, сигналы, документы, 10 последних событий.")
    @action(detail=True, methods=["get"])
    def card(self, request, code=None):
        item = get_object_or_404(equipment_queryset().prefetch_related("signals", "documents"), code=code)
        return Response(card_payload(item, request.build_absolute_uri))

    @extend_schema(parameters=[OpenApiParameter("limit", int, description="До 200, по умолчанию 50")],
                   request=dict, responses={200: dict, 201: dict},
                   description="GET — история состояний. POST (JSON или multipart) — condition, comment, photos[] до 5 фото.")
    @action(detail=True, methods=["get", "post"])
    def conditions(self, request, code=None):
        item = self.get_object()
        if request.method == "GET":
            try:
                limit = min(200, max(1, int(request.query_params.get("limit", "50"))))
            except ValueError:
                raise ValidationError({"limit": "Ожидается целое число."})
            events = events_queryset(item)[:limit]
            return Response([event_payload(event, request.build_absolute_uri) for event in events])
        try:
            event = change_condition(item, request.data.get("condition"), actor=request.user,
                                     comment=request.data.get("comment") or "", photos=request.FILES.getlist("photos"))
        except DjangoValidationError as exc:
            raise ValidationError(exc.message_dict if hasattr(exc, "message_dict") else exc.messages) from exc
        return Response(event_payload(event, request.build_absolute_uri), status=status.HTTP_201_CREATED)

    @extend_schema(request=dict, responses=dict,
                   description="multipart: image — JPEG/PNG/WebP до 10 МБ (клиент уменьшает заранее), "
                               "source — render (снимок 3D-модели) или photo (фото станка).")
    @action(detail=True, methods=["post"])
    def image(self, request, code=None):
        try:
            item = set_image(self.get_object(), request.FILES.get("image"), request.data.get("source"))
        except DjangoValidationError as exc:
            raise ValidationError(exc.message_dict if hasattr(exc, "message_dict") else exc.messages) from exc
        return Response({"code": item.code, **image_payload(item, request.build_absolute_uri)})

    @extend_schema(parameters=[OpenApiParameter("hours", int)], responses=dict)
    @action(detail=True, methods=["get"])
    def readings(self, request, code=None):
        try:
            hours = int(request.query_params.get("hours", "1"))
        except (ValueError, TypeError):
            raise ValidationError({"hours": "Ожидается целое число от 1 до 24."})
        if not 1 <= hours <= 24:
            raise ValidationError({"hours": "Допустимо от 1 до 24 часов."})
        item = self.get_object()
        end = timezone.now()
        start = end - timedelta(hours=hours)
        series = []
        # Minute buckets bound the response size and preserve extrema in tooltips.
        for signal in item.signals.filter(kind="number"):
            points = signal.readings.filter(ts__gte=start, ts__lte=end).order_by().annotate(
                minute=TruncMinute("ts")
            ).values("minute").annotate(
                average=Avg("value", filter=Q(sensor_fault=False)),
                minimum=Min("value", filter=Q(sensor_fault=False)),
                maximum=Max("value", filter=Q(sensor_fault=False)),
            ).order_by("minute")
            series.append({"key": signal.key, "name": signal.name, "unit": signal.unit,
                           "points": [{"x": row["minute"].timestamp(), "y": row["average"],
                                       "min": row["minimum"], "max": row["maximum"]} for row in points]})
        return Response({"equipment": item.code, "start": start.timestamp(), "end": end.timestamp(),
                         "bucket_seconds": 60, "series": series})

    def payload(self, item):
        return equipment_payload(item, self.request.build_absolute_uri, self.request.user.is_staff)

    def get_object(self):
        return get_object_or_404(equipment_queryset(), code=self.kwargs["code"])

    @extend_schema(parameters=[OpenApiParameter("zone", str, description="Код зоны")], responses=EquipmentSerializer(many=True))
    def list(self, request):
        items = equipment_queryset()
        if request.query_params.get("zone"):
            items = items.filter(zone__code=request.query_params["zone"])
        return Response([self.payload(item) for item in items])

    @extend_schema(responses=EquipmentSerializer)
    def retrieve(self, request, code=None):
        return Response(self.payload(self.get_object()))

    @extend_schema(request=EquipmentWriteSerializer, responses={201: EquipmentSerializer})
    def create(self, request):
        serializer = EquipmentWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(self.payload(serializer.save()), status=status.HTTP_201_CREATED)

    @extend_schema(request=EquipmentWriteSerializer, responses=EquipmentSerializer)
    def update(self, request, code=None):
        return self.update_item(request, partial=False)

    @extend_schema(request=EquipmentWriteSerializer, responses=EquipmentSerializer)
    def partial_update(self, request, code=None):
        return self.update_item(request, partial=True)

    @transaction.atomic
    def update_item(self, request, partial):
        item = get_object_or_404(Equipment.objects.select_for_update(), code=self.kwargs["code"])
        fields = ("pos_x", "pos_z", "rotation_deg")
        old = {key: getattr(item, key) for key in fields}
        serializer = EquipmentWriteSerializer(item, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        item = serializer.save()
        new = {key: getattr(item, key) for key in fields}
        if old != new:
            EquipmentMoveLog.objects.create(equipment=item, actor=request.user, old_values=old, new_values=new)
        return Response(self.payload(item))

    @extend_schema(responses={204: None})
    def destroy(self, request, code=None):
        item = self.get_object()
        item.is_active = False
        item.save(update_fields=["is_active", "updated"])
        return Response(status=status.HTTP_204_NO_CONTENT)
