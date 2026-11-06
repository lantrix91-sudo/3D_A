from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .serializers import ErrorSerializer, ProfileSerializer
from .services import get_profile


@extend_schema(responses={
    200: inline_serializer(name="TokenPair", fields={
        "access": serializers.CharField(), "refresh": serializers.CharField(),
    }),
    400: ErrorSerializer, 401: ErrorSerializer,
})
class LoginView(TokenObtainPairView):
    pass


@extend_schema(responses={
    200: inline_serializer(name="AccessToken", fields={"access": serializers.CharField(), "refresh": serializers.CharField()}),
    400: ErrorSerializer, 401: ErrorSerializer,
})
class RefreshView(TokenRefreshView):
    pass


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: ProfileSerializer, 401: ErrorSerializer})
    def get(self, request):
        return Response(get_profile(request.user))
