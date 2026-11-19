"""Bearer-token auth for the two tabulator roles.

* Admin: logs in with ADMIN_PASS and receives a signed, expiring token.
* Judge: logs in with their 4-digit access code; the code itself is the token,
  so regenerating a judge's code signs them out.
"""

from dataclasses import dataclass

from django.conf import settings
from django.core import signing
from django.utils.crypto import constant_time_compare
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.permissions import BasePermission

from .models import Judge

ADMIN_SALT = 'tabulator.admin'


@dataclass(frozen=True)
class Actor:
    role: str  # 'admin' | 'judge'
    judge: Judge | None = None
    is_authenticated: bool = True

    @property
    def is_admin(self):
        return self.role == 'admin'


def check_admin_password(password: str) -> bool:
    return constant_time_compare(password, settings.TABULATOR_ADMIN_PASS)


def make_admin_token() -> str:
    return signing.dumps({'role': 'admin'}, salt=ADMIN_SALT)


class TabulatorAuthentication(BaseAuthentication):
    def authenticate(self, request):
        header = request.META.get('HTTP_AUTHORIZATION', '')
        if not header.startswith('Bearer '):
            return None
        token = header[len('Bearer '):].strip()
        if not token:
            return None
        try:
            signing.loads(token, salt=ADMIN_SALT, max_age=settings.TABULATOR_ADMIN_TOKEN_MAX_AGE)
            return Actor('admin'), token
        except signing.BadSignature:
            pass
        judge = Judge.objects.filter(code=token).first()
        if judge:
            return Actor('judge', judge), token
        raise AuthenticationFailed('Your session has expired. Please log in again.')

    def authenticate_header(self, request):
        return 'Bearer'


class IsTabulatorUser(BasePermission):
    def has_permission(self, request, view):
        return isinstance(request.user, Actor)


class IsTabulatorAdmin(BasePermission):
    def has_permission(self, request, view):
        return isinstance(request.user, Actor) and request.user.is_admin


class IsJudge(BasePermission):
    def has_permission(self, request, view):
        return isinstance(request.user, Actor) and request.user.role == 'judge'
