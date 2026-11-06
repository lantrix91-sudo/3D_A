from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.contrib.auth.password_validation import validate_password
from django.db import transaction

ROLES = ("operator", "engineer", "admin")


def get_roles(user):
    if not user.is_authenticated or not user.is_active:
        return []
    return list(user.groups.filter(name__in=ROLES).order_by("name").values_list("name", flat=True))


def has_role(user, allowed_roles):
    # is_staff сам по себе не даёт роли в API. Superuser имеет все права.
    return bool(user.is_authenticated and user.is_active and (
        user.is_superuser or user.groups.filter(name__in=allowed_roles).exists()
    ))


def get_profile(user):
    return {"id": user.pk, "username": user.username, "roles": get_roles(user)}


@transaction.atomic
def create_demo_users(password):
    """Повторный запуск сохраняет пароли и настройки существующих пользователей."""
    User = get_user_model()
    result = []
    for role in ROLES:
        group, _ = Group.objects.get_or_create(name=role)
        username = f"demo_{role}"
        user = User.objects.filter(username=username).first()
        created = user is None
        if created:
            user = User(username=username)
            validate_password(password, user=user)
            user.set_password(password)
            user.save()
            user.groups.add(group)
        result.append((username, created))
    return result
