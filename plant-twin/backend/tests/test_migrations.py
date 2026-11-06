import pytest
from django.db import connection
from django.db.migrations.executor import MigrationExecutor


@pytest.mark.django_db(transaction=True)
def test_existing_catalog_survives_migration():
    executor = MigrationExecutor(connection)
    latest = executor.loader.graph.leaf_nodes()
    old = [("equipment", "0002_equipment_pos_y_equipment_rotation_deg_asset_and_more"), ("plants", "0001_initial")]
    try:
        executor.migrate(old)
        apps = executor.loader.project_state(old).apps
        plant = apps.get_model("plants", "Plant").objects.create(code="legacy-factory", name="Завод")
        zone = apps.get_model("plants", "Zone").objects.create(plant=plant, code="main", name="Цех", model_file="models/keep.glb")
        asset = apps.get_model("equipment", "Asset").objects.create(code="legacy-asset", name="Ассет", model_file="assets/keep.glb", default_w=2, default_h=3, default_d=4)
        item = apps.get_model("equipment", "Equipment").objects.create(code="legacy-oven", name="Печь", zone=zone, asset=asset, subtype="oven", pos_x=11, pos_z=22, active=False)
        apps.get_model("equipment", "Signal").objects.create(equipment=item, code="power", name="Мой сигнал", kind="power", source="s7", source_address="DB1")
        executor = MigrationExecutor(connection)
        executor.migrate(latest)
        apps = executor.loader.project_state(latest).apps
        current = apps.get_model("equipment", "Equipment").objects.get(code="legacy-oven")
        assert current.pos_x == 11 and current.pos_z == 22
        assert current.is_active is False
        assert current.type.code == "oven"
        assert current.asset.glb_file.name == "assets/keep.glb"
        assert (current.asset.size_x, current.asset.size_y, current.asset.size_z) == (2, 3, 4)
        signal = current.signals.get(key="power")
        assert (signal.name, signal.kind, signal.device_key, signal.source_address) == ("Мой сигнал", "number", "power", "DB1")
        assert current.signals.count() == 3
        assert current.zone.model_file.name == "models/keep.glb"
    finally:
        MigrationExecutor(connection).migrate(latest)
