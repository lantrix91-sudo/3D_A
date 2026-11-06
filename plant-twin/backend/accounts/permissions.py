from rest_framework.permissions import BasePermission

from .services import has_role


class IsOperator(BasePermission):
    """Доступ оператора: все три производственные роли."""
    def has_permission(self, request, view):
        return has_role(request.user, ("operator", "engineer", "admin"))


class IsEngineer(BasePermission):
    """Доступ инженера: engineer или admin."""
    def has_permission(self, request, view):
        return has_role(request.user, ("engineer", "admin"))


class IsAdmin(BasePermission):
    def has_permission(self, request, view):
        return has_role(request.user, ("admin",))
