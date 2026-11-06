from django.conf import settings
from django.db import transaction
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.exceptions import APIException
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .device_keys import check_key
from .ingest import IngestError, ingest
from .models import Equipment

RECORD_FIELDS = {"ts", "seq", "values", "faults"}


class TelemetryError(APIException):
    def __init__(self, code, message, status_code=400):
        super().__init__(message)
        self.status_code = status_code
        self.error_code = code


def record_args(record, where):
    if not isinstance(record, dict):
        raise TelemetryError("invalid_format", f"{where}: ожидается объект.")
    extra = set(record) - RECORD_FIELDS
    if extra:
        raise TelemetryError("invalid_format", f"{where}: неизвестные поля {', '.join(sorted(extra))}.")
    if "values" not in record and not record.get("faults"):
        raise TelemetryError("invalid_format", f"{where}: требуется values или faults.")
    return {"values": record.get("values", {}), "ts": record.get("ts"), "seq": record.get("seq"),
            "faults": record.get("faults")}


def authorize_device(request, device_id):
    raw = request.headers.get("X-Device-Key", "")
    if not raw:
        if settings.ALLOW_UNAUTHENTICATED_DEVICES:
            return
        raise TelemetryError("device_key_missing", "Требуется заголовок X-Device-Key.", 401)
    if check_key(device_id, raw):
        return
    if not Equipment.objects.filter(device_id=device_id.strip()).exists():
        raise TelemetryError("unknown_device", f"Устройство «{device_id}» не привязано к оборудованию.", 404)
    raise TelemetryError("device_key_invalid", "Ключ устройства неверен или отозван.", 401)


class ReadingsView(APIView):
    """Приём телеметрии от устройств. Авторизация — X-Device-Key, не JWT."""
    authentication_classes = []
    permission_classes = [AllowAny]

    @extend_schema(
        parameters=[OpenApiParameter("X-Device-Key", str, OpenApiParameter.HEADER, required=True)],
        request=dict, responses={200: dict, 201: dict},
        description="Одиночный пакет {device_id, ts, seq, values, faults} или пакет {device_id, readings: [...]}; "
                    "см. docs/TELEMETRY.md.",
    )
    def post(self, request):
        body = request.data
        if not isinstance(body, dict):
            raise TelemetryError("invalid_format", "Ожидается JSON-объект.")
        device_id = body.get("device_id")
        if not isinstance(device_id, str) or not device_id.strip():
            raise TelemetryError("invalid_format", "device_id: требуется непустая строка.")
        authorize_device(request, device_id)
        try:
            if "readings" in body:
                return self.batch(device_id, body)
            return self.single(device_id, body)
        except IngestError as exc:
            raise TelemetryError(exc.code, exc.message, exc.status) from exc

    def single(self, device_id, body):
        args = record_args({key: value for key, value in body.items() if key != "device_id"}, "Пакет")
        result = ingest(device_id, source="http", **args)
        return Response({"equipment": result.equipment.code, "duplicate": result.duplicate,
                         "status": result.status, "written": result.written},
                        status=status.HTTP_200_OK if result.duplicate else status.HTTP_201_CREATED)

    def batch(self, device_id, body):
        extra = set(body) - {"device_id", "readings"}
        if extra:
            raise TelemetryError("invalid_format", f"Пакет записей: лишние поля {', '.join(sorted(extra))}.")
        records = body["readings"]
        if not isinstance(records, list) or not records:
            raise TelemetryError("invalid_format", "readings: ожидается непустой список записей.")
        if len(records) > settings.INGEST_MAX_BATCH:
            raise TelemetryError("batch_too_large", f"readings: не более {settings.INGEST_MAX_BATCH} записей за запрос.")
        args = [record_args(record, f"readings[{index}]") for index, record in enumerate(records)]
        # Хронологический порядок: досылка буфера не откатывает текущее состояние назад.
        order = sorted(range(len(args)), key=lambda index: (args[index]["ts"] is None,
                                                             args[index]["ts"] if isinstance(args[index]["ts"], (int, float)) else 0))
        duplicates = [False] * len(args)
        result = None
        with transaction.atomic():  # Ошибка в любой записи отклоняет весь пакет.
            for index in order:
                try:
                    result = ingest(device_id, source="http", **args[index])
                except IngestError as exc:
                    raise IngestError(exc.code, f"readings[{index}]: {exc.message}", exc.status) from exc
                duplicates[index] = result.duplicate
        accepted = duplicates.count(False)
        return Response({"equipment": result.equipment.code, "accepted": accepted, "duplicates": len(args) - accepted,
                         "status": result.status, "results": [{"index": index, "duplicate": duplicate}
                                                              for index, duplicate in enumerate(duplicates)]},
                        status=status.HTTP_201_CREATED if accepted else status.HTTP_200_OK)
