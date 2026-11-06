from django.contrib import admin, messages
from .device_keys import generate, revoke
from .models import (Asset, ConditionEvent, ConditionPhoto, DeviceKey, Equipment, EquipmentDocument, EquipmentType,
                     Reading, Signal)
from .services import ensure_signals
from django.db import transaction
from django.http import HttpResponseRedirect


@admin.register(Asset)
class AssetAdmin(admin.ModelAdmin):
    list_display = ["code", "name", "glb_file", "size_x", "size_y", "size_z", "updated_at"]
    search_fields = ["code", "name"]


@admin.register(EquipmentType)
class EquipmentTypeAdmin(admin.ModelAdmin):
    list_display = ["code", "name", "default_asset", "offline_seconds"]
    search_fields = ["code", "name"]
    autocomplete_fields = ["default_asset"]
    fields = ["code", "name", "default_asset", "signal_templates", "key_signals", "status_rules", "offline_seconds"]

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        # Новые шаблоны добавляют сигналы уже созданному оборудованию; настроенные не трогаем.
        for item in obj.equipment.all():
            ensure_signals(item)


class SignalInline(admin.TabularInline):
    model = Signal
    extra = 0
    fields = ["key", "name", "unit", "kind", "device_key", "source", "source_address",
              "last_value", "last_text", "sensor_fault", "last_seen"]
    readonly_fields = ["last_value", "last_text", "sensor_fault", "last_seen"]


class DeviceKeyInline(admin.TabularInline):
    model = DeviceKey
    extra = 0
    fields = ["prefix", "name", "created_at", "last_used_at", "revoked_at"]
    readonly_fields = fields
    can_delete = False
    show_change_link = True

    def has_add_permission(self, request, obj=None):
        return False  # Ключ создаётся в разделе «Ключи устройств», чтобы показать его один раз.


class DocumentInline(admin.TabularInline):
    model = EquipmentDocument
    extra = 0
    fields = ["title", "file", "uploaded_at"]
    readonly_fields = ["uploaded_at"]


class ConditionPhotoInline(admin.TabularInline):
    model = ConditionPhoto
    extra = 0
    fields = ["file", "created_at"]
    readonly_fields = fields
    can_delete = False

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(ConditionEvent)
class ConditionEventAdmin(admin.ModelAdmin):
    list_display = ["equipment", "previous", "condition", "actor", "source", "created_at"]
    list_filter = ["condition", "source"]
    search_fields = ["equipment__code", "equipment__name", "comment"]
    list_select_related = ["equipment", "actor"]
    date_hierarchy = "created_at"
    readonly_fields = ["equipment", "previous", "condition", "comment", "source", "actor", "created_at"]
    inlines = [ConditionPhotoInline]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(Equipment)
class EquipmentAdmin(admin.ModelAdmin):
    @staticmethod
    def history_reason(obj):
        reasons = []
        if Reading.objects.filter(signal__equipment=obj).exists():
            reasons.append("показания")
        if obj.inspections.exists():
            reasons.append("осмотры")
        if obj.condition_events.exists():
            reasons.append("события состояния")
        return ", ".join(reasons)

    def get_deleted_objects(self, objs, request):
        deleted, counts, permissions, protected = super().get_deleted_objects(objs, request)
        protected = list(protected)
        for obj in objs:
            reason = self.history_reason(obj)
            if reason:
                protected.append(f"{obj.code}: есть {reason}. Используйте архивирование.")
        return deleted, counts, permissions, protected

    @transaction.atomic
    def delete_view(self, request, object_id, extra_context=None):
        if request.method == "POST":
            obj = self.get_queryset(request).select_for_update().filter(pk=object_id).first()
            if obj and self.has_delete_permission(request, obj) and self.history_reason(obj):
                self.message_user(request, f"Удаление {obj.code} запрещено: есть {self.history_reason(obj)}. Используйте архивирование.", messages.ERROR)
                return HttpResponseRedirect("../")
        return super().delete_view(request, object_id, extra_context)

    def get_actions(self, request):
        actions = super().get_actions(request)
        actions.pop("delete_selected", None)
        return actions

    @admin.action(description="Удалить выбранное оборудование без истории")
    @transaction.atomic
    def delete_without_history(self, request, queryset):
        if not self.has_delete_permission(request):
            return
        objects = list(queryset.select_for_update())
        blocked = [f"{obj.code}: {self.history_reason(obj)}" for obj in objects if self.history_reason(obj)]
        if blocked:
            self.message_user(request, "Ничего не удалено. Есть история: " + "; ".join(blocked) + ". Используйте архивирование.", messages.ERROR)
            return
        from django.contrib.admin.actions import delete_selected
        return delete_selected(self, request, queryset)

    actions = ["delete_without_history"]

    list_display = ["code", "name", "zone", "type", "condition", "pos_x", "pos_z", "rotation_deg", "device_id", "status", "last_seen"]
    list_editable = ["device_id"]
    list_filter = ["zone", "type", "is_active", "condition"]
    search_fields = ["code", "name", "device_id", "serial_number", "inventory_number"]
    autocomplete_fields = ["zone", "type", "asset"]
    fieldsets = [
        (None, {"fields": ["code", "name", "zone", "type", "asset", "is_active"]}),
        ("Расположение", {"fields": ["pos_x", "pos_y", "pos_z", "rotation_deg"]}),
        ("Паспорт", {"fields": ["manufacturer", "model_name", "serial_number", "inventory_number",
                                "commissioned_on", "service_contact", "notes"]}),
        # Состояние меняется из карточки в приложении, чтобы всегда оставался след в истории.
        ("Состояние", {"fields": ["condition", "condition_changed_at", "device_id", "status", "last_seen", "status_changed_at"]}),
    ]
    readonly_fields = ["condition", "condition_changed_at", "status", "last_seen", "status_changed_at"]
    inlines = [DocumentInline, SignalInline, DeviceKeyInline]


@admin.register(Signal)
class SignalAdmin(admin.ModelAdmin):
    list_display = ["equipment", "key", "name", "kind", "device_key", "source"]
    list_filter = ["kind", "source"]
    search_fields = ["key", "name", "equipment__code"]
    autocomplete_fields = ["equipment"]
    fields = ["equipment", "key", "name", "kind", "unit", "device_key", "source", "source_address"]


@admin.register(DeviceKey)
class DeviceKeyAdmin(admin.ModelAdmin):
    list_display = ["equipment", "prefix", "name", "created_at", "last_used_at", "revoked_at"]
    list_filter = ["revoked_at"]
    search_fields = ["equipment__code", "equipment__device_id", "prefix", "name"]
    autocomplete_fields = ["equipment"]
    actions = ["revoke_keys"]

    def get_fields(self, request, obj=None):
        return ["equipment", "name"] if obj is None else ["equipment", "name", "prefix", "created_at", "last_used_at", "revoked_at"]

    def get_readonly_fields(self, request, obj=None):
        return [] if obj is None else ["equipment", "prefix", "created_at", "last_used_at", "revoked_at"]

    def save_model(self, request, obj, form, change):
        if change:
            return super().save_model(request, obj, form, change)
        raw = generate(obj)
        super().save_model(request, obj, form, change)
        messages.warning(request, f"Ключ для {obj.equipment.device_id or obj.equipment.code}: {raw} — "
                                  "скопируйте сейчас, повторно он не будет показан. Передавайте в заголовке X-Device-Key.")

    def has_delete_permission(self, request, obj=None):
        return False  # Отзыв вместо удаления сохраняет след в журнале.

    @admin.action(description="Отозвать выбранные ключи")
    def revoke_keys(self, request, queryset):
        self.message_user(request, f"Отозвано ключей: {revoke(queryset)}.")


@admin.register(Reading)
class ReadingAdmin(admin.ModelAdmin):
    list_display = ["signal", "ts", "value", "value_text", "sensor_fault", "source"]
    list_filter = ["sensor_fault", "source"]
    search_fields = ["signal__equipment__code", "signal__key"]
    list_select_related = ["signal__equipment"]
    date_hierarchy = "ts"

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


from .models import EquipmentMoveLog
from accounts.services import has_role


@admin.register(EquipmentMoveLog)
class EquipmentMoveLogAdmin(admin.ModelAdmin):
    list_display = ["equipment", "actor", "created_at", "old_values", "new_values"]
    readonly_fields = list_display

    def has_view_permission(self, request, obj=None):
        return has_role(request.user, ("admin",))

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
