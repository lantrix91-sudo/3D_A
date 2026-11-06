from django.urls import path

from .views import InspectionsView, RouteDetailView, RoutesView, RouteStopsView, TodayView

urlpatterns = [
    path("today/", TodayView.as_view(), name="rounds-today"),
    path("inspections/", InspectionsView.as_view(), name="rounds-inspections"),
    path("routes/", RoutesView.as_view(), name="rounds-routes"),
    path("routes/<int:pk>/", RouteDetailView.as_view(), name="rounds-route"),
    path("routes/<int:pk>/stops/", RouteStopsView.as_view(), name="rounds-route-stops"),
]
