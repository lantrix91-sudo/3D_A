from django.core.validators import FileExtensionValidator
from django.db import models
from django.utils import timezone

from equipment.models import PHOTO_EXTENSIONS, ConditionEvent, Equipment, EquipmentType
from equipment.validators import validate_photo_size


class ChecklistItem(models.Model):
    """Пункт чек-листа обхода. Задаётся на тип оборудования — одинаков для всех печей одного типа."""
    equipment_type = models.ForeignKey(EquipmentType, on_delete=models.CASCADE, related_name="checklist",
                                       verbose_name="Тип оборудования")
    order = models.PositiveIntegerField("Порядок", default=0)
    text = models.CharField("Что проверить", max_length=300)
    is_active = models.BooleanField("Действует", default=True)

    class Meta:
        ordering = ["equipment_type", "order", "pk"]
        verbose_name = "Пункт чек-листа"
        verbose_name_plural = "Чек-лист обхода"

    def __str__(self):
        return self.text


class Route(models.Model):
    """Маршрут обхода A → B → C. Создаётся во frontend. Нет ни одного маршрута — обходится всё активное оборудование."""
    name = models.CharField("Название", max_length=120)
    is_active = models.BooleanField("Действует", default=True)
    order = models.PositiveIntegerField("Порядок в списке", default=0)
    updated_at = models.DateTimeField("Изменён", auto_now=True)

    class Meta:
        ordering = ["order", "pk"]
        verbose_name = "Маршрут обхода"
        verbose_name_plural = "Маршруты обхода"

    def __str__(self):
        return self.name


class RouteStop(models.Model):
    """Шаг маршрута. Удаление станка из БД удаляет и шаг; осмотры от маршрутов не зависят."""
    route = models.ForeignKey(Route, on_delete=models.CASCADE, related_name="stops", verbose_name="Маршрут")
    equipment = models.ForeignKey(Equipment, on_delete=models.CASCADE, related_name="route_stops", verbose_name="Оборудование")
    position = models.PositiveIntegerField("Шаг", default=0)

    class Meta:
        ordering = ["route", "position", "pk"]
        constraints = [models.UniqueConstraint(fields=["route", "equipment"], name="unique_equipment_in_route")]
        verbose_name = "Шаг маршрута"
        verbose_name_plural = "Шаги маршрута"

    def __str__(self):
        return f"{self.route}: {self.position + 1}. {self.equipment}"


class Round(models.Model):
    """Ежедневный общий обход. Создаётся первым осмотром дня."""
    date = models.DateField("Дата", unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-date"]
        verbose_name = "Обход"
        verbose_name_plural = "Обходы"

    def __str__(self):
        return f"Обход {self.date:%d.%m.%Y}"


class Inspection(models.Model):
    class Result(models.TextChoices):
        OK = "ok", "Норма"
        REMARK = "remark", "Замечание"
        FAULT = "fault", "Неисправность"

    round = models.ForeignKey(Round, on_delete=models.CASCADE, related_name="inspections", verbose_name="Обход")
    equipment = models.ForeignKey(Equipment, on_delete=models.CASCADE, related_name="inspections", verbose_name="Оборудование")
    inspector = models.ForeignKey("auth.User", on_delete=models.SET_NULL, null=True, verbose_name="Инженер")
    # client_id создаёт телефон: повторная досылка из офлайн-очереди не создаёт дубль.
    client_id = models.UUIDField("ID на устройстве", unique=True)
    inspected_at = models.DateTimeField("Время осмотра", db_index=True)
    received_at = models.DateTimeField("Получено", default=timezone.now)
    result = models.CharField("Результат", max_length=10, choices=Result.choices)
    answers = models.JSONField("Ответы чек-листа", default=list, blank=True)
    comment = models.TextField("Комментарий", blank=True, max_length=2000)
    condition_event = models.OneToOneField(ConditionEvent, on_delete=models.SET_NULL, null=True, blank=True,
                                           related_name="inspection", verbose_name="Изменение состояния")

    class Meta:
        ordering = ["-inspected_at", "-pk"]
        indexes = [models.Index(fields=["equipment", "inspected_at"], name="inspection_equipment_time")]
        verbose_name = "Осмотр"
        verbose_name_plural = "Осмотры"

    def __str__(self):
        return f"{self.equipment.code} {self.inspected_at:%d.%m %H:%M} — {self.get_result_display()}"


class InspectionPhoto(models.Model):
    inspection = models.ForeignKey(Inspection, on_delete=models.CASCADE, related_name="photos")
    file = models.FileField("Фото", upload_to="inspection-photos/%Y/%m/", validators=[
        FileExtensionValidator(PHOTO_EXTENSIONS), validate_photo_size])

    class Meta:
        ordering = ["pk"]
        verbose_name = "Фото осмотра"
        verbose_name_plural = "Фото осмотра"
