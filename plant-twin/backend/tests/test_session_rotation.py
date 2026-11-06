import pytest
from datetime import timedelta
from rest_framework_simplejwt.tokens import RefreshToken, AccessToken
from rest_framework_simplejwt.settings import api_settings

pytestmark = pytest.mark.django_db


def test_refresh_rotates_and_blacklists_previous_token(client, user):
    original = str(RefreshToken.for_user(user))
    response = client.post('/api/v1/auth/refresh/', {'refresh': original}, format='json')
    assert response.status_code == 200
    assert response.data['refresh'] != original
    access = AccessToken(response.data['access'])
    assert access['exp'] - access['iat'] == api_settings.ACCESS_TOKEN_LIFETIME.total_seconds()
    renewed = RefreshToken(response.data['refresh'])
    assert renewed['exp'] - renewed['iat'] == api_settings.REFRESH_TOKEN_LIFETIME.total_seconds()
    assert client.post('/api/v1/auth/refresh/', {'refresh': original}, format='json').status_code == 401
    assert client.post('/api/v1/auth/refresh/', {'refresh': str(renewed)}, format='json').status_code == 200


def test_expired_refresh_is_rejected(client, user):
    token = RefreshToken.for_user(user)
    token.set_exp(lifetime=timedelta(seconds=-1))
    assert client.post('/api/v1/auth/refresh/', {'refresh': str(token)}, format='json').status_code == 401
