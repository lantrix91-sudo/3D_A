"""Ежедневный обход: маршрут дня, приём осмотров (идемпотентно), влияние на состояние оборудования."""
import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import IntegrityError, connection, transaction
from django.db.models import F
from django.utils import timezone

from equipment.conditions import change_condition, user_name
from equipment.images import image_payload
from equipment.live import send_event
from equipment.models import ConditionEvent, Equipment
from .models import ChecklistItem, Inspection, InspectionPhoto, Round, Route, RouteStop

MAX_PHOTOS = 5
SEVERITY = {Inspection.Result.OK: 0, Inspection.Result.REMARK: 1, Inspection.Result.FAULT: 2}


def eligible_equipment():
    """Что вообще обходят: активное оборудование, кроме выведенного из работы."""
    return Equipment.objects.filter(is_active=True).exclude(condition=Equipment.Condition.DECOMMISSIONED)


def default_route():
    return Route.objects.filter(is_active=True).order_by("order", "pk").first()


def route_equipment(route=None):
    """(оборудование по шагам, маршрут). Без маршрута — первый активный; активных нет — всё по зонам и кодам."""
    route = route or default_route()
    if route is None:
        return list(eligible_equipment().select_related("zone", "type").order_by("zone__order", "zone__code", "code")), None
    stops = (RouteStop.objects.filter(route=route, equipment__in=eligible_equipment())
             .select_related("equipment__zone", "equipment__type").order_by("position", "pk"))
    return [stop.equipment for stop in stops], route


def equipment_in_routes():
    """Коды станков, которые надо обойти сегодня хоть в одном маршруте (для колец на плане)."""
    eligible = eligible_equipment()
    if Route.objects.filter(is_active=True).exists():
        eligible = eligible.filter(route_stops__route__is_active=True)
    return sorted(set(eligible.values_list("code", flat=True)))


def route_payload(route):
    stops = route.stops.filter(equipment__is_active=True).select_related("equipment__zone").order_by("position", "pk")
    return {
        "id": route.pk, "name": route.name, "is_active": route.is_active, "order": route.order,
        "updated_at": route.updated_at.timestamp(),
        "stops": [{"position": stop.position, "equipment": stop.equipment.code, "name": stop.equipment.name,
                   "zone": stop.equipment.zone.name, "is_active": stop.equipment.is_active,
                   "condition": stop.equipment.condition} for stop in stops],
    }


def announce_route(route_id):
    """Открытые планы и телефоны перечитывают маршруты. Одно событие на маршрут за транзакцию;
    после отката транзакции событие не уходит."""
    if any(getattr(entry[1], "route_id", None) == route_id for entry in connection.run_on_commit):
        return

    def run():
        send_event({"type": "route_changed", "route": route_id})

    run.route_id = route_id
    transaction.on_commit(run)


def clean_route_fields(data, partial):
    fields = {}
    if "name" in data or not partial:
        name = data.get("name")
        if not isinstance(name, str) or not name.strip() or len(name.strip()) > 120:
            raise ValidationError({"name": "Название — непустая строка до 120 символов."})
        fields["name"] = name.strip()
    if "is_active" in data:
        if not isinstance(data["is_active"], bool):
            raise ValidationError({"is_active": "Ожидается true или false."})
        fields["is_active"] = data["is_active"]
    if "order" in data:
        if isinstance(data["order"], bool) or not isinstance(data["order"], int) or data["order"] < 0:
            raise ValidationError({"order": "Ожидается неотрицательное целое."})
        fields["order"] = data["order"]
    return fields


@transaction.atomic
def save_route(data, route=None):
    fields = clean_route_fields(data, partial=route is not None)
    if route is None:
        route = Route.objects.create(**fields)
    else:
        for key, value in fields.items():
            setattr(route, key, value)
        route.save()
    if "stops" in data:
        set_stops(route, data["stops"])
    announce_route(route.pk)
    return route


@transaction.atomic
def set_stops(route, codes):
    """Заменяет шаги маршрута целиком: порядок списка = порядок обхода. Всё или ничего."""
    if not isinstance(codes, list) or not all(isinstance(code, str) and code for code in codes):
        raise ValidationError({"equipment": "Ожидается список кодов оборудования."})
    duplicates = sorted({code for code in codes if codes.count(code) > 1})
    if duplicates:
        raise ValidationError({"equipment": f"Станок в маршруте может быть только один раз: {', '.join(duplicates)}."})
    found = {item.code: item for item in Equipment.objects.filter(code__in=codes)}
    unknown = [code for code in codes if code not in found]
    if unknown:
        raise ValidationError({"equipment": f"Оборудование не найдено: {', '.join(unknown)}."})
    route.stops.all().delete()
    RouteStop.objects.bulk_create([RouteStop(route=route, equipment=found[code], position=index)
                                   for index, code in enumerate(codes)])
    Route.objects.filter(pk=route.pk).update(updated_at=timezone.now())
    announce_route(route.pk)


@transaction.atomic
def delete_route(route):
    """Удаляет маршрут и его шаги. Осмотры хранятся отдельно и остаются."""
    route_id = route.pk
    route.delete()
    announce_route(route_id)


def checklists(type_ids):
    result = {}
    for item in ChecklistItem.objects.filter(equipment_type_id__in=type_ids, is_active=True):
        result.setdefault(item.equipment_type_id, []).append({"id": item.pk, "text": item.text})
    return result


def inspection_payload(inspection, absolute_url):
    return {
        "id": inspection.pk, "client_id": str(inspection.client_id), "equipment": inspection.equipment.code,
        "inspected_at": inspection.inspected_at.timestamp(), "inspector": user_name(inspection.inspector),
        "result": inspection.result, "answers": inspection.answers, "comment": inspection.comment,
        "photos": [absolute_url(photo.file.url) for photo in inspection.photos.all()],
    }


def today_payload(absolute_url, today=None, route=None):
    today = today or timezone.localdate()
    stops, route = route_equipment(route)
    lists = checklists({item.type_id for item in stops})
    latest = {}
    inspections = Inspection.objects.filter(round__date=today).select_related("inspector", "equipment").prefetch_related("photos")
    for inspection in inspections.order_by("inspected_at", "pk"):
        latest[inspection.equipment_id] = inspection
    return {
        "date": today.isoformat(),
        "time_zone": settings.TIME_ZONE,  # телефон считает «сегодня» в поясе цеха, а не в своём
        "route": {"id": route.pk, "name": route.name} if route else None,
        # Для колец на плане: станки всех активных маршрутов и кто из всех осмотрен сегодня.
        "route_equipment": equipment_in_routes(),
        "inspected": sorted({inspection.equipment.code for inspection in latest.values()}),
        "total": len(stops),
        "done": sum(1 for item in stops if item.pk in latest),
        "stops": [{
            "equipment": item.code, "name": item.name, "zone": item.zone.name, "type": item.type.name,
            "condition": item.condition, "checklist": lists.get(item.type_id, []),
            **image_payload(item, absolute_url),
            "inspection": inspection_payload(latest[item.pk], absolute_url) if item.pk in latest else None,
        } for item in stops],
    }


def record_inspection(data, files, actor):
    """Возвращает (осмотр, создан). Повтор с тем же client_id — (существующий, False)."""
    from .serializers import InspectionWriteSerializer
    serializer = InspectionWriteSerializer(data=data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    try:
        client_id = uuid.UUID(str(data.get("client_id")))
    except ValueError:
        raise ValidationError({"client_id": "Ожидается UUID, созданный на устройстве."}) from None
    existing = Inspection.objects.filter(client_id=client_id).first()
    if existing:
        return existing, False
    equipment = Equipment.objects.select_related("type").filter(code=data.get("equipment") or "").first()
    if equipment is None:
        raise ValidationError({"equipment": "Оборудование не найдено."})
    now = timezone.now()
    moment = data["inspected_at"]
    texts = {item["id"]: item["text"] for item in checklists([equipment.type_id]).get(equipment.type_id, [])}
    answers = [{**answer, "text": texts.get(answer["item"]) or answer["text"]} for answer in data["answers"]]
    result = data.get("result") or Inspection.Result.OK
    if result not in SEVERITY:
        raise ValidationError({"result": "Допустимо: ok, remark, fault."})
    # Итог не может быть мягче худшего пункта чек-листа.
    result = max([result] + [answer["result"] for answer in answers], key=SEVERITY.get)
    comment = data.get("comment") or ""
    if not isinstance(comment, str) or len(comment) > 2000:
        raise ValidationError({"comment": "Комментарий — строка до 2000 символов."})
    photos = list(files)
    if len(photos) > MAX_PHOTOS:
        raise ValidationError({"photos": f"Не более {MAX_PHOTOS} фото."})
    try:
        with transaction.atomic():
            inspection = Inspection.objects.create(
                round=Round.objects.get_or_create(date=timezone.localdate(moment))[0], equipment=equipment,
                inspector=actor, client_id=client_id, inspected_at=moment, received_at=now,
                result=result, answers=answers, comment=comment.strip())
            for upload in photos:
                photo = InspectionPhoto(inspection=inspection, file=upload)
                photo.full_clean(exclude=["inspection"])
                photo.save()
            if result == Inspection.Result.FAULT:
                apply_fault(inspection, equipment, actor)
    except IntegrityError:  # Параллельная досылка того же осмотра.
        existing = Inspection.objects.filter(client_id=client_id).first()
        if existing is None:
            raise
        return existing, False
    transaction.on_commit(lambda: send_event({
        "type": "inspection", "equipment": equipment.code, "result": result,
        "inspected_at": moment.timestamp(), "date": inspection.round.date.isoformat(),
    }))
    return inspection, True


def last_condition_change(equipment):
    """Время последней настоящей смены состояния (отметки без смены не считаются)."""
    return (ConditionEvent.objects.filter(equipment=equipment).exclude(previous=F("condition"))
            .order_by("-created_at").values_list("created_at", flat=True).first())


def apply_fault(inspection, equipment, actor):
    """Неисправность на обходе: работающее/простаивающее → «Неисправно»; иначе — отметка в истории.

    Осмотр из офлайн-очереди может прийти через часы. Если состояние меняли после осмотра
    (например, станок уже починили), устаревшая неисправность его не перезаписывает.
    """
    # Блокировка строки: проверка «менялось ли позже» и смена — согласованы с параллельной правкой из карточки.
    locked = Equipment.objects.select_for_update().get(pk=equipment.pk)
    changed_at = last_condition_change(locked)
    stale = changed_at is not None and changed_at > inspection.inspected_at
    if stale:
        target = locked.condition
    else:
        target = Equipment.Condition.FAULTY if locked.condition in (
            Equipment.Condition.WORKING, Equipment.Condition.IDLE) else locked.condition
    remarks = [f"{answer['text']}: {answer['note']}" if answer["note"] else answer["text"]
               for answer in inspection.answers if answer["result"] == Inspection.Result.FAULT]
    header = "Обход: неисправность"
    if stale:
        header = (f"Неисправность из осмотра от {timezone.localtime(inspection.inspected_at):%d.%m.%Y %H:%M} не применена: "
                  f"состояние с тех пор менялось ({timezone.localtime(changed_at):%d.%m.%Y %H:%M}).")
    comment = "\n".join(filter(None, [header, *remarks, inspection.comment]))[:2000]
    inspection.condition_event = change_condition(
        locked, target, actor=actor, comment=comment,
        photos=[photo.file.name for photo in inspection.photos.all()], source=ConditionEvent.Source.ROUND)
    inspection.save(update_fields=["condition_event"])
    equipment.condition = inspection.condition_event.condition
