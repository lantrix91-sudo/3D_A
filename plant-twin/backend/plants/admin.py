from django.contrib import admin

from .models import PlanWalls, PlanWallsVersion, Plant, Zone


@admin.register(Plant)
class PlantAdmin(admin.ModelAdmin):
    list_display = ["code", "name"]
    search_fields = ["code", "name"]


@admin.register(Zone)
class ZoneAdmin(admin.ModelAdmin):
    list_display = ["code", "name", "plant", "model_file", "order", "visible_by_default"]
    list_filter = ["plant", "visible_by_default"]
    search_fields = ["code", "name"]
    autocomplete_fields = ["plant"]


class ReadOnlyAdmin(admin.ModelAdmin):
    """Стены меняются только через API или import_walls: иначе правка не попадёт в историю и версию."""
    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(PlanWalls)
class PlanWallsAdmin(ReadOnlyAdmin):
    list_display = ["zone", "version", "updated_by", "updated_at"]


@admin.register(PlanWallsVersion)
class PlanWallsVersionAdmin(ReadOnlyAdmin):
    list_display = ["plan_walls", "version", "updated_by", "updated_at"]
    list_filter = ["plan_walls"]
