from django.urls import path

from rest_framework.routers import SimpleRouter
from equipment.telemetry_views import ReadingsView
from equipment.views import AssetListView, EquipmentViewSet
from .views import PlanView, PlanWallsHistoryView, PlanWallsView

router = SimpleRouter()
router.register("equipment", EquipmentViewSet, basename="equipment")

urlpatterns = [
    path("plan/", PlanView.as_view(), name="plan"),
    path("plan-walls/", PlanWallsView.as_view(), name="plan-walls"),
    path("plan-walls/history/", PlanWallsHistoryView.as_view(), name="plan-walls-history"),
    path("assets/", AssetListView.as_view(), name="assets-list"),
    path("readings/", ReadingsView.as_view(), name="readings"),
] + router.urls
