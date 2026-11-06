from django.contrib import admin

from .models import ChecklistItem, Inspection, InspectionPhoto, Round, Route, RouteStop


@admin.register(ChecklistItem)
class ChecklistItemAdmin(admin.ModelAdmin):
    list_display = ["equipment_type", "order", "text", "is_active"]
    list_editable = ["order", "is_active"]
    list_filter = ["equipment_type", "is_active"]
    search_fields = ["text"]


class RouteStopInline(admin.TabularInline):
    model = RouteStop
    extra = 0
    fields = ["position", "equipment"]
    readonly_fields = fields
    can_delete = False

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(Route)
class RouteAdmin(admin.ModelAdmin):
    """Только просмотр: маршруты редактируются во frontend, чтобы изменения сразу расходились по WebSocket."""
    list_display = ["name", "is_active", "order", "updated_at"]
    readonly_fields = ["name", "is_active", "order", "updated_at"]
    inlines = [RouteStopInline]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


class InspectionPhotoInline(admin.TabularInline):
    model = InspectionPhoto
    extra = 0
    readonly_fields = ["file"]
    can_delete = False

    def has_add_permission(self, request, obj=None):
        return False


class InspectionInline(admin.TabularInline):
    model = Inspection
    extra = 0
    fields = ["equipment", "result", "inspector", "inspected_at", "comment"]
    readonly_fields = fields
    can_delete = False
    show_change_link = True

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(Round)
class RoundAdmin(admin.ModelAdmin):
    list_display = ["date", "created_at"]
    date_hierarchy = "date"
    inlines = [InspectionInline]


@admin.register(Inspection)
class InspectionAdmin(admin.ModelAdmin):
    list_display = ["equipment", "result", "inspector", "inspected_at", "received_at"]
    list_filter = ["result", "round__date"]
    search_fields = ["equipment__code", "equipment__name", "comment"]
    list_select_related = ["equipment", "inspector"]
    readonly_fields = ["round", "equipment", "inspector", "client_id", "inspected_at", "received_at", "result",
                       "answers", "comment", "condition_event"]
    inlines = [InspectionPhotoInline]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
