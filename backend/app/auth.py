"""Optional configured administrator login for the frontend's existing login route."""
import base64
import hashlib
import hmac
import secrets
from datetime import timedelta
import jwt
from fastapi import APIRouter, Body, Request
from .core import fail, require, respond, text, utcnow

router = APIRouter(prefix='/api/auth', tags=['Authentication'])


def hash_password(password):
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=16384, r=8, p=1)
    return 'scrypt$' + base64.b64encode(salt).decode() + '$' + base64.b64encode(digest).decode()


def verify_password(password, stored):
    try:
        algorithm, salt, expected = stored.split('$')
        if algorithm != 'scrypt':
            return False
        digest = hashlib.scrypt(password.encode(), salt=base64.b64decode(salt), n=16384, r=8, p=1)
        return hmac.compare_digest(digest, base64.b64decode(expected))
    except (ValueError, TypeError):
        return False


@router.post('/admin/login')
def login(request: Request, body: dict = Body(...)):
    settings = request.app.state.settings
    require(isinstance(body.get('email'), str) and isinstance(body.get('password'), str), 'Email and password are required')
    require(bool(settings.get('ADMIN_EMAIL')) and bool(settings.get('ADMIN_PASSWORD_HASH')) and len(settings.get('JWT_SECRET', '')) >= 32,
            'Administrator login is not configured. Follow backend/README.md to set ADMIN_EMAIL, ADMIN_PASSWORD_HASH and JWT_SECRET.', 503)
    # Compute the hash even on an incorrect email to avoid leaking the configured identity.
    valid_password = verify_password(body['password'], settings['ADMIN_PASSWORD_HASH'])
    require(hmac.compare_digest(text(body['email']).lower().encode(), settings['ADMIN_EMAIL'].lower().encode()) and valid_password,
            'Invalid administrator email or password.', 401)
    now = utcnow()
    token = jwt.encode({'sub': settings['ADMIN_EMAIL'], 'role': 'admin', 'iat': now, 'exp': now + timedelta(hours=8), 'aud': 'iiti-admin'}, settings['JWT_SECRET'], algorithm='HS256')
    return respond({'token': token, 'user': {'name': 'Administrator', 'email': settings['ADMIN_EMAIL'], 'role': 'admin'}})


def require_admin(request: Request):
    settings = request.app.state.settings
    if not settings.get('REQUIRE_ADMIN_AUTH'):
        return
    require(len(settings.get('JWT_SECRET', '')) >= 32, 'JWT_SECRET must be configured before protecting API routes', 503)
    header = request.headers.get('authorization', '')
    require(header.lower().startswith('bearer '), 'Administrator sign-in is required', 401)
    try:
        claims = jwt.decode(header[7:], settings['JWT_SECRET'], algorithms=['HS256'], audience='iiti-admin', options={'require': ['exp', 'sub', 'role']})
        require(claims.get('role') == 'admin' and claims.get('sub') == settings.get('ADMIN_EMAIL'), 'Administrator access is required', 403)
    except jwt.InvalidTokenError:
        fail(401, 'Invalid or expired administrator session')
