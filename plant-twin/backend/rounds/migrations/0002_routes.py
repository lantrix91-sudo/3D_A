import django.db.models.deletion
from django.db import migrations, models


def single_route_to_main(apps, schema_editor):
    """Прежний единый маршрут → маршрут «Основной» с теми же точками в том же порядке."""
    db = schema_editor.connection.alias
    Route = apps.get_model("rounds", "Route")
    RouteStop = apps.get_model("rounds", "RouteStop")
    stops = list(RouteStop.objects.using(db).order_by("order", "pk"))
    if not stops:
        return  # Маршрута не было: обход по всему активному оборудованию, как и раньше.
    route = Route.objects.using(db).create(name="Основной", order=0)
    for position, stop in enumerate(stops):
        stop.route_id, stop.position = route.pk, position
        stop.save(update_fields=["route", "position"])


def main_route_to_single(apps, schema_editor):
    """Откат: остаётся первый маршрут (в старой схеме станок мог быть только в одном маршруте)."""
    db = schema_editor.connection.alias
    Route = apps.get_model("rounds", "Route")
    RouteStop = apps.get_model("rounds", "RouteStop")
    first = Route.objects.using(db).order_by("order", "pk").first()
    RouteStop.objects.using(db).exclude(route=first).delete()
    for stop in RouteStop.objects.using(db).all():
        stop.order = stop.position
        stop.save(update_fields=["order"])


class Migration(migrations.Migration):

    dependencies = [
        ("equipment", "0009_condition_passport"),
        ("rounds", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="Route",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=120, verbose_name="Название")),
                ("is_active", models.BooleanField(default=True, verbose_name="Действует")),
                ("order", models.PositiveIntegerField(default=0, verbose_name="Порядок в списке")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="Изменён")),
            ],
            options={"verbose_name": "Маршрут обхода", "verbose_name_plural": "Маршруты обхода", "ordering": ["order", "pk"]},
        ),
        migrations.AddField(
            model_name="routestop",
            name="route",
            field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.CASCADE, related_name="stops",
                                    to="rounds.route", verbose_name="Маршрут"),
        ),
        migrations.AddField(
            model_name="routestop",
            name="position",
            field=models.PositiveIntegerField(default=0, verbose_name="Шаг"),
        ),
        migrations.RunPython(single_route_to_main, main_route_to_single),
        migrations.AlterField(
            model_name="routestop",
            name="equipment",
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="route_stops",
                                    to="equipment.equipment", verbose_name="Оборудование"),
        ),
        migrations.RemoveField(model_name="routestop", name="order"),
        migrations.AlterField(
            model_name="routestop",
            name="route",
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="stops",
                                    to="rounds.route", verbose_name="Маршрут"),
        ),
        migrations.AlterModelOptions(
            name="routestop",
            options={"ordering": ["route", "position", "pk"], "verbose_name": "Шаг маршрута", "verbose_name_plural": "Шаги маршрута"},
        ),
        migrations.AddConstraint(
            model_name="routestop",
            constraint=models.UniqueConstraint(fields=("route", "equipment"), name="unique_equipment_in_route"),
        ),
    ]
