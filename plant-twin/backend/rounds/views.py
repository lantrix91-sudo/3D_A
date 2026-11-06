from .serializers import InspectionWriteSerializer
from django.core.exceptions import ValidationError as DjangoValidationError
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.generics import get_object_or_404
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsEngineer, IsOperator
from accounts.services import has_role
from .models import Inspection, Route
from .services import (delete_route, inspection_payload, record_inspection, route_payload, save_route, set_stops,
                       today_payload)


def to_drf(exc):
    return ValidationError(exc.message_dict if hasattr(exc, "message_dict") else exc.messages)


class ReadAllEditEngineer(APIView):
    """Смотреть маршруты могут все роли, менять — engineer и admin."""
    def get_permissions(self):
        return [IsOperator() if self.request.method == "GET" else IsEngineer()]


class TodayView(APIView):
    permission_classes = [IsOperator]

    @extend_schema(parameters=[OpenApiParameter("route", int, description="ID маршрута; без него — первый активный")],
                   responses=dict, description="Маршрут сегодняшнего обхода: станки по порядку, чек-листы, последние осмотры.")
    def get(self, request):
        route = None
        if request.query_params.get("route"):
            try:
                route = Route.objects.get(pk=int(request.query_params["route"]))
            except (ValueError, Route.DoesNotExist):
                raise NotFound("Маршрут не найден.") from None
        payload = today_payload(request.build_absolute_uri, route=route)
        payload["can_change_image"] = has_role(request.user, ("engineer", "admin"))  # «Сделать фото станка»
        return Response(payload)


class RoutesView(ReadAllEditEngineer):
    @extend_schema(responses=dict, description="Все маршруты с шагами по порядку.")
    def get(self, request):
        routes = Route.objects.prefetch_related("stops__equipment__zone")
        return Response([route_payload(route) for route in routes])

    @extend_schema(request=dict, responses={201: dict}, description='{"name", "is_active"?, "order"?, "stops"?: [коды]}')
    def post(self, request):
        try:
            route = save_route(request.data)
        except DjangoValidationError as exc:
            raise to_drf(exc) from exc
        return Response(route_payload(route), status=status.HTTP_201_CREATED)


class RouteDetailView(ReadAllEditEngineer):
    def get_route(self, pk):
        return get_object_or_404(Route, pk=pk)

    @extend_schema(responses=dict)
    def get(self, request, pk):
        return Response(route_payload(self.get_route(pk)))

    @extend_schema(request=dict, responses=dict, description='Частичное изменение: name, is_active, order, stops.')
    def patch(self, request, pk):
        try:
            route = save_route(request.data, self.get_route(pk))
        except DjangoValidationError as exc:
            raise to_drf(exc) from exc
        return Response(route_payload(route))

    @extend_schema(responses={204: None}, description="Удаляет маршрут и шаги; осмотры остаются.")
    def delete(self, request, pk):
        delete_route(self.get_route(pk))
        return Response(status=status.HTTP_204_NO_CONTENT)


class RouteStopsView(ReadAllEditEngineer):
    @extend_schema(request=dict, responses=dict,
                   description='Шаги целиком в новом порядке: {"equipment": ["code-1", "code-2"]} или просто список кодов.')
    def put(self, request, pk):
        route = get_object_or_404(Route, pk=pk)
        codes = request.data if isinstance(request.data, list) else request.data.get("equipment")
        try:
            set_stops(route, codes)
        except DjangoValidationError as exc:
            raise to_drf(exc) from exc
        route.refresh_from_db()
        return Response(route_payload(route))


class InspectionsView(APIView):
    def get_permissions(self):
        # Осматривает и отправляет инженер; смотреть историю может и оператор.
        return [IsEngineer() if self.request.method == "POST" else IsOperator()]

    @extend_schema(parameters=[OpenApiParameter("equipment", str, required=True), OpenApiParameter("limit", int)],
                   responses=dict, description="Осмотры оборудования, новые первыми.")
    def get(self, request):
        code = request.query_params.get("equipment")
        if not code:
            raise ValidationError({"equipment": "Укажите код оборудования."})
        try:
            limit = min(200, max(1, int(request.query_params.get("limit", "30"))))
        except ValueError:
            raise ValidationError({"limit": "Ожидается целое число."}) from None
        items = Inspection.objects.filter(equipment__code=code).select_related("inspector", "equipment").prefetch_related("photos")
        return Response([inspection_payload(item, request.build_absolute_uri) for item in items[:limit]])

    @extend_schema(request=InspectionWriteSerializer, responses={200: dict, 201: dict},
                   description="multipart: client_id (UUID), equipment, inspected_at (Unix с), result, answers (JSON), "
                               "comment, photos[] до 5. Повтор с тем же client_id — 200 и duplicate=true.")
    def post(self, request):
        try:
            inspection, created = record_inspection(request.data, request.FILES.getlist("photos"), request.user)
        except DjangoValidationError as exc:
            raise ValidationError(exc.message_dict if hasattr(exc, "message_dict") else exc.messages) from exc
        body = {**inspection_payload(inspection, request.build_absolute_uri), "duplicate": not created,
                "condition": inspection.equipment.condition}
        return Response(body, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)
