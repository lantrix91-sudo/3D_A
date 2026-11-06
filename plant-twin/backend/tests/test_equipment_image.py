import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from equipment.models import Equipment
from tests.test_conditions import committed, item, media  # noqa: F401 — фикстуры
from tests.test_plan import authorize

pytestmark = pytest.mark.django_db
URL = "/api/v1/equipment/mx-1/image/"


def jpeg(name="mx.jpg", size=100):
    return SimpleUploadedFile(name, b"\xff\xd8" + b"0" * size, content_type="image/jpeg")


@pytest.mark.parametrize("role", ["engineer", "admin"])
def test_engineer_and_admin_set_image(client, user, item, role):
    authorize(client, user, role)
    response = client.post(URL, {"image": jpeg(), "source": "render"}, format="multipart")
    assert response.status_code == 200, response.content
    data = response.json()
    assert data["image"].startswith("http://testserver/media/equipment-images/mx-1-") and data["image"].endswith(".jpg")
    assert data["image_source"] == "render" and data["image_updated_at"]
    item.refresh_from_db()
    assert item.image_source == Equipment.ImageSource.RENDER


def test_operator_cannot_change_image(client, user, item):
    authorize(client, user, "operator")
    assert client.post(URL, {"image": jpeg(), "source": "photo"}, format="multipart").status_code == 403
    assert not Equipment.objects.get(pk=item.pk).image


def test_photo_replaces_render_and_old_file_is_removed(client, user, item):
    authorize(client, user, "engineer")
    with committed():
        client.post(URL, {"image": jpeg(), "source": "render"}, format="multipart")
    old = Equipment.objects.get(pk=item.pk).image
    assert old.storage.exists(old.name)
    with committed():
        response = client.post(URL, {"image": jpeg("IMG_1.JPG"), "source": "photo"}, format="multipart")
    assert response.json()["image_source"] == "photo"
    new = Equipment.objects.get(pk=item.pk).image
    assert new.name != old.name and new.storage.exists(new.name)
    assert not old.storage.exists(old.name)


@pytest.mark.parametrize("data", [
    {"source": "render"},  # без файла
    {"image": "file", "source": "selfie"},
    {"image": SimpleUploadedFile("x.heic", b"0"), "source": "photo"},  # браузер не покажет
    {"image": SimpleUploadedFile("x.exe", b"MZ"), "source": "photo"},
])
def test_invalid_image_rejected(client, user, item, data):
    authorize(client, user, "engineer")
    if data.get("image") == "file":
        data["image"] = jpeg()
    assert client.post(URL, data, format="multipart").status_code == 400
    assert not Equipment.objects.get(pk=item.pk).image


def test_image_in_plan_card_and_round(client, user, item):
    authorize(client, user, "engineer")
    plan = client.get("/api/v1/plan/").json()
    assert plan["can_change_image"] is True
    assert plan["zones"][0]["equipment"][0]["image"] is None
    url = client.post(URL, {"image": jpeg(), "source": "photo"}, format="multipart").json()["image"]
    assert client.get("/api/v1/plan/").json()["zones"][0]["equipment"][0]["image"] == url
    card = client.get("/api/v1/equipment/mx-1/card/").json()
    assert (card["image"], card["image_source"]) == (url, "photo")
    today = client.get("/api/v1/rounds/today/").json()
    assert today["can_change_image"] is True
    assert today["stops"][0]["image"] == url


def test_operator_sees_image_but_no_button(client, user, item):
    authorize(client, user, "operator")
    assert client.get("/api/v1/plan/").json()["can_change_image"] is False
    assert client.get("/api/v1/rounds/today/").json()["can_change_image"] is False
