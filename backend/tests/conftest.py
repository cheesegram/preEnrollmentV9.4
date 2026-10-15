import sys
from pathlib import Path
import mongomock
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.main import create_app


@pytest.fixture
def db():
    return mongomock.MongoClient(tz_aware=True).migration_test


@pytest.fixture
def client(db):
    settings = {'REQUIRE_ADMIN_AUTH': False, 'RATE_LIMIT_ENABLED': False, 'MONGO_TRANSACTIONS': False, 'SERVE_FRONTEND': False}
    with TestClient(create_app(database=db, settings=settings)) as client:
        yield client


@pytest.fixture
def student():
    return {'studentNumber': '2026-0001', 'firstName': 'Ana', 'lastName': 'Santos', 'year': '1',
            'semester': '1st', 'section': 'A', 'status': 'Block', 'schoolYear': '2026-2027'}


@pytest.fixture
def section():
    return {'year': '1', 'semester': '1st', 'section': 'A', 'blockCount': 0, 'irregularCount': 0,
            'blockCapacity': 45, 'irregularCapacity': 5, 'totalCapacity': 50, 'status': 'Available'}


@pytest.fixture
def schedule():
    return {'year': '1', 'semester': '1st', 'section': 'A', 'academic_year': '2026-2027', 'curriculum_id': 'curriculum_1st_year',
            'classes': [{'subjectCode': 'CC101', 'sectionName': 'BSIT-1A', 'startTime': 420, 'endTime': 540,
                         'days': ['Monday'], 'roomName': 'Room 101', 'profName': 'Prof. Reyes', 'units': 3}]}


def advising_candidate(db, suffix='0001', irregular=False, existing=False):
    number = '2026'+suffix
    aid = 'A-'+number
    person = {'firstName': 'Ana', 'lastName': 'Santos', 'year': '1', 'semester': '1st', 'schoolYear': '2026-2027'}
    if existing:
        db.students.insert_one({**person, 'studentNumber': number, 'status': 'Advised', 'section': 'A'})
    else:
        db.applicants.insert_one({**person, 'applicantId': aid, 'isIrregular': irregular})
    record = {'applicantID': aid, 'year': '1', 'section': 'A', 'semester': '1st',
              'status': 'Irregular' if irregular else 'Block', 'enrollmentStatus': 'pending'}
    if irregular:
        record['advisedSubjects'] = [
            {'subjectId': 'CC101', 'targetYear': '1', 'targetSection': 'A'},
            {'subjectId': 'CC201', 'targetYear': '2', 'targetSection': 'B'},
            {'subjectId': 'CC301', 'targetYear': '3', 'targetSection': 'B'},
        ]
    db.advisingrecords.insert_one(record)
    return aid, number
