from copy import deepcopy
from datetime import timedelta
from io import BytesIO
import jwt
from fastapi.testclient import TestClient
from pypdf import PdfReader
from app.auth import hash_password
from app.core import utcnow
from app.main import create_app
from app.services.archives import find_classes
from app.services.pdf import cor_pdf


def test_individual_pdf_and_unchanged_archive_deduplication(client, db, student, schedule):
    sid = str(db.students.insert_one(deepcopy(student)).inserted_id)
    db.schedules.insert_one(deepcopy(schedule))
    response = client.get(f'/api/students/{sid}/export-pdf')
    assert response.status_code == 200
    assert response.headers['content-type'] == 'application/pdf'
    assert 'attachment;' in response.headers['content-disposition']
    reader = PdfReader(BytesIO(response.content))
    assert len(reader.pages) == 1
    page = reader.pages[0].extract_text()
    assert all(word in page for word in ['CERTIFICATE OF REGISTRATION', 'Santos'.upper(), 'CC101', 'EXAMINATION PERMIT', 'SEMESTRAL-END CLEARANCE'])
    assert db.studentarchive.count_documents({}) == 1
    client.get('/api/students')
    client.get(f'/api/students/{sid}/export-pdf')
    assert db.studentarchive.count_documents({}) == 1
    db.schedules.update_one({}, {'$set': {'classes.0.roomName': 'Room 202'}})
    assert client.get(f'/api/students/{sid}/export-pdf').status_code == 200
    assert db.studentarchive.count_documents({}) == 2


def test_section_pdf_filters_term_and_sorts_students(client, db, student, schedule):
    db.students.insert_many([
        deepcopy(student), {**student, 'studentNumber': '2', 'lastName': 'Abad'},
        {**student, 'studentNumber': '3', 'lastName': 'Other', 'semester': '2nd'},
    ])
    db.schedules.insert_one(deepcopy(schedule))
    response = client.get('/api/students/export-section-pdf?year=1&section=A&semester=1st')
    assert response.status_code == 200
    pages = PdfReader(BytesIO(response.content)).pages
    assert len(pages) == 2
    assert 'ABAD' in pages[0].extract_text() and 'SANTOS' in pages[1].extract_text()
    assert client.get('/api/students/export-section-pdf?year=4&section=Z').status_code == 404
    assert client.get('/api/students/export-section-pdf').status_code == 400
    assert client.get('/api/students/missing/export-pdf').status_code == 404


def test_pdf_continuation_retains_every_subject(student, schedule):
    classes = [{**schedule['classes'][0], 'subjectCode': f'CC{i:03}'} for i in range(50)]
    result = PdfReader(BytesIO(cor_pdf([student], lambda _: classes, [])))
    assert len(result.pages) == 3
    content = '\n'.join(page.extract_text() for page in result.pages)
    assert all(f'CC{i:03}' in content for i in range(50))
    assert 'CONTINUATION' in result.pages[1].extract_text()


def test_archive_matching_uses_each_class_section_and_current_term(student, schedule):
    current = {**deepcopy(schedule), '_id': 'new'}
    current['classes'].append({**schedule['classes'][0], 'subjectCode': 'WRONG', 'sectionName': 'BSIT-2B'})
    older = {**deepcopy(schedule), '_id': 'old'}
    older['classes'][0]['subjectCode'] = 'OLD'
    wrong_term = {**deepcopy(schedule), '_id': 'other', 'semester': '2nd'}
    assert [c['subjectCode'] for c in find_classes(student, [wrong_term, current, older])] == ['CC101']


def test_irregular_archive_combines_assigned_sections_only(student, schedule):
    person = {**student, 'status': 'Irregular', 'irregularYear': ['2'], 'irregularSection': ['B'],
              'irregularSubjects': [{'subjectId': 'CC101', 'targetYear': '1', 'targetSection': 'A'},
                                    {'subjectId': 'CC201', 'targetYear': '2', 'targetSection': 'B'}]}
    master = {**deepcopy(schedule), '_id': 'master'}
    master['classes'].extend([
        {**schedule['classes'][0], 'subjectCode': 'CC201', 'sectionName': 'BSIT-2B'},
        {**schedule['classes'][0], 'subjectCode': 'CC202', 'sectionName': 'BSIT-2B'},
    ])
    assert [c['subjectCode'] for c in find_classes(person, [master])] == ['CC101', 'CC201']


def test_authentication_rejects_wrong_expired_and_forged_tokens(db):
    secret = 'test-secret-' + 'x' * 40
    settings = {'ADMIN_EMAIL': 'admin@example.test', 'ADMIN_PASSWORD_HASH': hash_password('test-password-123'),
                'JWT_SECRET': secret, 'REQUIRE_ADMIN_AUTH': True, 'SERVE_FRONTEND': False, 'RATE_LIMIT_ENABLED': False}
    with TestClient(create_app(database=db, settings=settings)) as client:
        assert client.get('/api/health').status_code == 200
        assert client.get('/api/students').status_code == 401
        assert client.post('/api/auth/admin/login', json={'email': 'admin@example.test', 'password': 'wrong'}).status_code == 401
        assert client.post('/api/auth/admin/login', json={'email': '\u00e9@example.test', 'password': 'test-password-123'}).status_code == 401
        response = client.post('/api/auth/admin/login', json={'email': 'ADMIN@example.test', 'password': 'test-password-123'})
        assert response.status_code == 200
        payload = response.json()
        assert payload['user']['role'] == 'admin' and 'password' not in str(payload)
        assert client.get('/api/students', headers={'Authorization': 'Bearer ' + payload['token']}).status_code == 200
        now = utcnow()
        for changes, signing_key in [({'exp': now-timedelta(seconds=1)}, secret), ({}, 'forged-'+'y'*40), ({'role': 'student'}, secret)]:
            claims = {'sub': settings['ADMIN_EMAIL'], 'role': 'admin', 'exp': now+timedelta(hours=1), 'aud': 'iiti-admin', **changes}
            token = jwt.encode(claims, signing_key, algorithm='HS256')
            assert client.get('/api/students', headers={'Authorization': 'Bearer ' + token}).status_code in {401, 403}


def test_missing_login_configuration_returns_actionable_message(db):
    settings = {'ADMIN_EMAIL': '', 'ADMIN_PASSWORD_HASH': '', 'JWT_SECRET': '', 'REQUIRE_ADMIN_AUTH': False, 'RATE_LIMIT_ENABLED': False}
    with TestClient(create_app(database=db, settings=settings)) as client:
        response = client.post('/api/auth/admin/login', json={'email': 'admin@example.test', 'password': 'test'})
        assert response.status_code == 503 and 'not configured' in response.json()['message']


def test_body_limit_and_cors_preflight(client):
    response = client.post('/api/students', content=b'x'*(2*1024*1024+1), headers={'Content-Type': 'application/json', 'Origin': 'http://localhost:5173'})
    assert response.status_code == 413
    assert response.headers['access-control-allow-origin'] == 'http://localhost:5173'
    assert client.post('/api/students', content='{', headers={'Content-Type': 'application/json'}).status_code == 400
    response = client.options('/api/students', headers={'Origin': 'http://localhost:5173', 'Access-Control-Request-Method': 'GET'})
    assert response.status_code == 200


def test_optional_local_rate_limiter(db):
    settings = {'RATE_LIMIT_ENABLED': True, 'RATE_LIMIT_PER_MINUTE': 2, 'UPSTASH_REDIS_REST_URL': '', 'UPSTASH_REDIS_REST_TOKEN': '', 'SERVE_FRONTEND': False}
    with TestClient(create_app(database=db, settings=settings)) as client:
        assert client.get('/api/health').status_code == 200
        assert client.get('/api/health').status_code == 200
        response = client.get('/api/health')
        assert response.status_code == 429 and response.headers['retry-after'] == '60'
