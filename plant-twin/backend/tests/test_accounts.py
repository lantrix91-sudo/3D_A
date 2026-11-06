from datetime import timedelta
from io import StringIO

import pytest
from django.contrib.auth.models import Group
from django.core.management import call_command
from django.core.management.base import CommandError
from rest_framework.response import Response
from rest_framework.test import APIRequestFactory
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import AccessToken

from accounts.permissions import IsAdmin, IsEngineer, IsOperator

pytestmark = pytest.mark.django_db


def test_login_refresh_and_profile(client, user):
    user.groups.add(Group.objects.create(name="operator"))
    response = client.post("/api/v1/auth/login/", {
        "username": user.username, "password": "Strong-Test-Pass-492!",
    }, format="json")
    assert response.status_code == 200
    assert set(response.data) == {"access", "refresh"}
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")
    profile = client.get("/api/v1/auth/me/")
    assert profile.status_code == 200
    assert profile.data == {"id": user.pk, "username": user.username, "roles": ["operator"]}
    refresh = client.post("/api/v1/auth/refresh/", {"refresh": response.data["refresh"]}, format="json")
    assert refresh.status_code == 200
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.data['access']}")
    assert client.get("/api/v1/auth/me/").status_code == 200


@pytest.mark.parametrize("payload,status", [
    ({}, 400), ({"username": "test_operator", "password": "wrong"}, 401),
])
def test_login_errors(client, user, payload, status):
    response = client.post("/api/v1/auth/login/", payload, format="json")
    assert response.status_code == status
    assert set(response.data) == {"error"}
    assert set(response.data["error"]) == {"code", "message"}
    assert isinstance(response.data["error"]["message"], str)


@pytest.mark.parametrize("token", [None, "broken"])
def test_me_requires_valid_token(client, token):
    if token:
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    response = client.get("/api/v1/auth/me/")
    assert response.status_code == 401
    assert response.data["error"]["code"] == "authentication_failed"


def test_expired_access(client, user):
    token = AccessToken.for_user(user)
    token.set_exp(lifetime=timedelta(seconds=-1))
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    assert client.get("/api/v1/auth/me/").status_code == 401


def test_refresh_rejects_access_and_invalid_token(client, user):
    for token in ("broken", str(AccessToken.for_user(user))):
        response = client.post("/api/v1/auth/refresh/", {"refresh": token}, format="json")
        assert response.status_code == 401
        assert "error" in response.data


def test_disabled_user_cannot_login_or_use_existing_token(client, user):
    token = AccessToken.for_user(user)
    user.is_active = False
    user.save()
    assert client.post("/api/v1/auth/login/", {
        "username": user.username, "password": "Strong-Test-Pass-492!",
    }).status_code == 401
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    assert client.get("/api/v1/auth/me/").status_code == 401


@pytest.mark.parametrize("role,expected", [
    ("operator", (200, 403, 403)), ("engineer", (200, 200, 403)),
    ("admin", (200, 200, 200)), (None, (403, 403, 403)),
    ("unrelated", (403, 403, 403)),
])
def test_role_matrix(user, role, expected):
    if role:
        user.groups.add(Group.objects.create(name=role))
    # Проверяем реальную JWT-аутентификацию и permissions без лишних API-маршрутов.
    for permission, status in zip((IsOperator, IsEngineer, IsAdmin), expected):
        class ProtectedView(APIView):
            permission_classes = [permission]

            def get(self, request):
                return Response({"ok": True})

        request = APIRequestFactory().get("/", HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(user)}")
        response = ProtectedView.as_view()(request)
        assert response.status_code == status
        if status == 403:
            assert response.data["error"]["code"] == "permission_denied"
        assert ProtectedView.as_view()(APIRequestFactory().get("/")).status_code == 401


def test_superuser_and_staff_permissions(user):
    request = APIRequestFactory().get("/")
    request.user = user
    user.is_staff = True
    assert not IsAdmin().has_permission(request, None)
    user.is_superuser = True
    assert all(p().has_permission(request, None) for p in (IsOperator, IsEngineer, IsAdmin))
    user.is_active = False
    assert not IsAdmin().has_permission(request, None)


def test_demo_command_is_idempotent(monkeypatch, django_user_model):
    monkeypatch.setenv("DEMO_USER_PASSWORD", "Demo-Strong-Password-492!")
    call_command("create_demo_users", stdout=StringIO())
    users = django_user_model.objects
    before = dict(users.values_list("username", "password"))
    monkeypatch.setenv("DEMO_USER_PASSWORD", "Another-Strong-Password-493!")
    call_command("create_demo_users", stdout=StringIO())
    assert dict(users.values_list("username", "password")) == before
    assert users.count() == 3
    for role in ("operator", "engineer", "admin"):
        user = users.get(username=f"demo_{role}")
        assert list(user.groups.values_list("name", flat=True)) == [role]
        assert not user.is_staff
        assert not user.is_superuser


@pytest.mark.parametrize("password", ["", "123"])
def test_demo_command_rejects_missing_or_weak_password(monkeypatch, django_user_model, password):
    monkeypatch.setenv("DEMO_USER_PASSWORD", password)
    with pytest.raises(CommandError):
        call_command("create_demo_users", stdout=StringIO())
    assert not django_user_model.objects.exists()
    assert not Group.objects.exists()


def test_cors_allowlist(client, settings):
    settings.CORS_ALLOWED_ORIGINS = ["http://localhost:5173"]
    for origin, allowed in [("http://localhost:5173", True), ("https://other.example", False)]:
        response = client.options("/api/v1/auth/login/", HTTP_ORIGIN=origin,
                                  HTTP_ACCESS_CONTROL_REQUEST_METHOD="POST")
        assert (response.get("Access-Control-Allow-Origin") == origin) is allowed


def test_swagger_and_schema(client):
    assert client.get("/api/docs/").status_code == 200
    response = client.get("/api/schema/?format=json")
    assert response.status_code == 200
    schema = response.json()
    assert set(schema["paths"]) == {
        "/api/v1/auth/login/", "/api/v1/auth/refresh/", "/api/v1/auth/me/",
        "/api/v1/plan/", "/api/v1/plan-walls/", "/api/v1/plan-walls/history/", "/api/v1/equipment/", "/api/v1/assets/", "/api/v1/equipment/{code}/",
        "/api/v1/readings/",
        "/api/v1/equipment/{code}/readings/",
        "/api/v1/equipment/{code}/card/", "/api/v1/equipment/{code}/conditions/", "/api/v1/equipment/{code}/image/",
        "/api/v1/rounds/today/", "/api/v1/rounds/inspections/",
        "/api/v1/rounds/routes/", "/api/v1/rounds/routes/{id}/", "/api/v1/rounds/routes/{id}/stops/",
    }
    assert schema["paths"]["/api/v1/auth/me/"]["get"]["security"] == [{"jwtAuth": []}]
