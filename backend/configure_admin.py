"""Configure the existing frontend's admin login without storing a plain password."""
from getpass import getpass
from pathlib import Path
import secrets
from dotenv import dotenv_values, set_key
from app.auth import hash_password


def main():
    path = Path(__file__).resolve().parent / '.env'
    email = input('Administrator email: ').strip().lower()
    if '@' not in email or not email.isascii():
        raise SystemExit('Enter a valid administrator email address.')
    password = getpass('Administrator password (at least 12 characters): ')
    if len(password) < 12:
        raise SystemExit('Use at least 12 characters.')
    if password != getpass('Confirm password: '):
        raise SystemExit('Passwords do not match; nothing was changed.')
    values = dotenv_values(path) if path.exists() else {}
    path.touch(exist_ok=True)
    for key, value in {
        'ADMIN_EMAIL': email,
        'ADMIN_PASSWORD_HASH': hash_password(password),
        'JWT_SECRET': values.get('JWT_SECRET') if len(values.get('JWT_SECRET') or '') >= 32 else secrets.token_urlsafe(48),
        'REQUIRE_ADMIN_AUTH': 'true',
        'RATE_LIMIT_ENABLED': 'true',
    }.items():
        set_key(path, key, value)
    try:
        path.chmod(0o600)
    except OSError:
        pass  # Windows controls file access through account permissions.
    print('Administrator configured. Restart the backend, then sign in on the frontend.')


if __name__ == '__main__':
    main()
