from pathlib import Path
import pytest
from dotenv import dotenv_values
from fastapi.testclient import TestClient
import configure_admin
from app.auth import verify_password
from app.main import create_app


def test_admin_setup_preserves_database_and_hashes_password(tmp_path, monkeypatch):
    env = tmp_path / '.env'
    env.write_text('MONGO_URI=mongodb://localhost/existing\nMONGO_DB=existing\n', encoding='utf-8')
    monkeypatch.setattr(configure_admin, '__file__', str(tmp_path / 'configure_admin.py'))
    monkeypatch.setattr('builtins.input', lambda _: 'Admin@example.test')
    monkeypatch.setattr(configure_admin, 'getpass', lambda _: 'new-password-123')
    configure_admin.main()
    values = dotenv_values(env)
    assert values['MONGO_URI'] == 'mongodb://localhost/existing'
    assert values['MONGO_DB'] == 'existing'
    assert values['ADMIN_EMAIL'] == 'admin@example.test'
    assert verify_password('new-password-123', values['ADMIN_PASSWORD_HASH'])
    assert 'new-password-123' not in env.read_text()
    assert len(values['JWT_SECRET']) >= 32
    assert values['REQUIRE_ADMIN_AUTH'] == values['RATE_LIMIT_ENABLED'] == 'true'


def test_admin_setup_does_not_write_when_confirmation_fails(tmp_path, monkeypatch):
    env = tmp_path / '.env'
    original = 'MONGO_URI=mongodb://localhost/existing\n'
    env.write_text(original, encoding='utf-8')
    monkeypatch.setattr(configure_admin, '__file__', str(tmp_path / 'configure_admin.py'))
    monkeypatch.setattr('builtins.input', lambda _: 'admin@example.test')
    passwords = iter(['new-password-123', 'different-password'])
    monkeypatch.setattr(configure_admin, 'getpass', lambda _: next(passwords))
    with pytest.raises(SystemExit):
        configure_admin.main()
    assert env.read_text() == original


def test_same_origin_frontend_preserves_api_404(db, tmp_path, monkeypatch):
    import app.main as main
    backend = tmp_path / 'backend'
    backend.mkdir()
    dist = tmp_path / 'enrollment/dist'
    (dist / 'assets').mkdir(parents=True)
    (dist / 'index.html').write_text('<html><title>Enrollment</title></html>')
    (dist / 'assets/app.js').write_text('console.log("loaded")')
    monkeypatch.setattr(main, 'BACKEND', backend)
    with TestClient(create_app(database=db, settings={'SERVE_FRONTEND': True, 'RATE_LIMIT_ENABLED': False})) as client:
        assert '<title>Enrollment</title>' in client.get('/students').text
        assert client.get('/assets/app.js').status_code == 200
        response = client.get('/api/missing')
        assert response.status_code == 404 and response.json()['message'] == 'API route not found'
