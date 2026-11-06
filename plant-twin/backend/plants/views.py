from django.core.exceptions import ValidationError as DjangoValidationError
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.exceptions import APIException, NotFound, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView
from accounts.permissions import IsEngineer, IsOperator
from accounts.services import has_role
from accounts.serializers import ErrorSerializer
from .models import PlanWalls, PlanWallsVersion, Zone
from .serializers import PlanSerializer, PlanWallsHistorySerializer, PlanWallsSerializer, PlanWallsWriteSerializer
from .services import get_plan
from .walls import VersionConflict, save_walls, user_name, walls_payload


class PlanView(APIView):
    permission_classes = [IsOperator]

    @extend_schema(parameters=[OpenApiParameter("plant", str, description="Код завода; по умолчанию первый по коду.")],
                   responses={200: PlanSerializer, 401: ErrorSerializer, 403: ErrorSerializer, 404: ErrorSerializer})
    def get(self, request):
        plan = get_plan(request.query_params.get("plant"), request.build_absolute_uri, request.user.is_staff)
        plan["can_edit_layout"] = has_role(request.user, ("admin",))
        plan["can_change_condition"] = has_role(request.user, ("engineer", "admin"))
        plan["can_change_image"] = plan["can_change_condition"]  # те же роли; manager добавим, когда появится
        plan["can_edit_walls"] = plan["can_change_condition"]  # стены меняют engineer и admin
        return Response(plan)


class WallsConflict(APIException):
    status_code = 409
    error_code = "version_conflict"
    default_detail = "Стены уже изменены другим пользователем."


def zone_from_query(request):
    value = request.query_params.get("zone")
    if value is None or not value.isdigit():
        raise ValidationError({"zone": "Укажите числовой id зоны."})
    return get_object_or_404(Zone, pk=int(value))


ZONE_PARAMETER = OpenApiParameter("zone", int, required=True, description="id зоны из /api/v1/plan/.")


class PlanWallsView(APIView):
    """Стены и колонны зоны. Запись — только с актуальной base_version, иначе 409."""

    def get_permissions(self):
        return [IsOperator()] if self.request.method == "GET" else [IsEngineer()]

    @extend_schema(parameters=[ZONE_PARAMETER, OpenApiParameter("version", int, description="Старая версия из истории.")],
                   responses={200: PlanWallsSerializer})
    def get(self, request):
        zone = zone_from_query(request)
        record = PlanWalls.objects.select_related("updated_by").filter(zone=zone).first()
        version = request.query_params.get("version")
        if version is None:
            return Response(walls_payload(zone, record))
        if not version.isdigit():
            raise ValidationError({"version": "Ожидается целое число."})
        old = PlanWallsVersion.objects.filter(plan_walls=record, version=int(version)).select_related("updated_by").first()
        if old is None:
            raise NotFound("Такой версии нет в истории.")
        return Response(walls_payload(zone, old))

    @extend_schema(parameters=[ZONE_PARAMETER], request=PlanWallsWriteSerializer, responses={200: PlanWallsSerializer})
    def put(self, request):
        zone = zone_from_query(request)
        base_version = request.data.get("base_version")
        if isinstance(base_version, bool) or not isinstance(base_version, int) or base_version < 0:
            raise ValidationError({"base_version": "Ожидается неотрицательное целое число."})
        try:
            record = save_walls(zone, request.data.get("data"), base_version, request.user)
        except DjangoValidationError as exc:
            raise ValidationError({"data": exc.messages}) from exc
        except VersionConflict as exc:
            who = user_name(exc.current.updated_by) if exc.current else None
            version = exc.current.version if exc.current else 0
            raise WallsConflict(f"Стены уже изменил {who or 'другой пользователь'}: версия на сервере {version}, ваша {base_version}.") from exc
        return Response(walls_payload(zone, record))


class PlanWallsHistoryView(APIView):
    """Список сохранённых версий без самих данных; данные версии — GET /plan-walls/?zone=&version=."""
    permission_classes = [IsOperator]

    @extend_schema(parameters=[ZONE_PARAMETER], responses={200: PlanWallsHistorySerializer(many=True)})
    def get(self, request):
        zone = zone_from_query(request)
        versions = PlanWallsVersion.objects.filter(plan_walls__zone=zone).select_related("updated_by")
        return Response([{"version": row.version, "walls": len(row.data["walls"]), "columns": len(row.data["columns"]),
                          "updated_by": user_name(row.updated_by), "updated_at": row.updated_at.timestamp()} for row in versions])
