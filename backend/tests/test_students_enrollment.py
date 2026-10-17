from copy import deepcopy
import pytest
from .conftest import advising_candidate


def test_student_crud_and_duplicate(client, db, student):
    created = client.post('/api/students', json={**student, 'password': 'must-not-leak'})
    assert created.status_code == 201
    payload = created.json()
    assert 'password' not in payload
    assert db.students.find_one({})['password'] == 'must-not-leak'
    assert client.post('/api/students', json=student).status_code == 409
    sid = payload['_id']
    assert client.get('/api/students/'+sid).json()['studentNumber'] == student['studentNumber']
    assert client.put('/api/students/'+sid,json={'firstName':'Maria'}).json()['firstName'] == 'Maria'
    assert client.get('/api/students/section/A').json()[0]['firstName'] == 'Maria'
    assert client.get('/api/students/sections').json() == ['A']
    assert client.delete('/api/students/'+sid).status_code == 200
    assert db.students.count_documents({}) == 0
    assert db.sections.count_documents({}) == 0
    assert client.get('/api/students/'+sid).status_code == 404


def test_update_recounts_previous_irregular_sections(client,db,student):
    sid = client.post('/api/students',json={**student,'status':'Irregular','irregularSection':['B','B'],'irregularYear':['2','3']}).json()['_id']
    assert db.sections.count_documents({}) == 3
    assert client.put('/api/students/'+sid,json={'section':'C','status':'Block','irregularSection':[],'irregularYear':[]}).status_code == 200
    sections=list(db.sections.find({}))
    assert len(sections)==1 and sections[0]['section']=='C' and sections[0]['blockCount']==1


def test_student_filters_accept_numeric_year(client,db,student):
    db.students.insert_many([student,{**student,'studentNumber':'2','year':2,'status':'Irregular'}, {**student,'studentNumber':'3','status':'Advised'}])
    result=client.get('/api/students?year=2&status=Irregular').json()
    assert len(result)==1 and result[0]['studentNumber']=='2'
    assert len(client.get('/api/students').json())==2


def test_operators_and_missing_student_number_rejected(client):
    assert client.post('/api/students',json={'firstName':'A'}).status_code==400
    assert client.post('/api/students',json={'studentNumber':'1','$set':{'status':'Block'}}).status_code==400


def test_preview_does_not_write(client,db):
    aid,_=advising_candidate(db)
    before={name:list(db[name].find({})) for name in db.list_collection_names()}
    result=client.post('/api/students/batch-enroll-preview',json={'applicantIDs':[aid]}).json()
    assert len(result['placements'])==1
    assert result['placements'][0]['assigned_section']=='A'
    section=result['placements'][0]['available_sections'][0]
    assert section['blockCount']==1 and section['blockCapacity']==45
    assert section['irregularCount']==0 and section['irregularCapacity']==5
    assert section['displayCount']==0 and section['displayCapacity']==45
    after={name:list(db[name].find({})) for name in db.list_collection_names()}
    assert after==before


def test_batch_enrollment_and_reenrollment(client,db):
    aid,sn=advising_candidate(db)
    result=client.post('/api/students/batch-enroll',json={'applicantIDs':[aid],'selectedSections':{aid:'D'}}).json()
    assert len(result['enrolled'])==1
    assert db.students.find_one({'studentNumber':sn})['section']=='D'
    assert db.applicants.find_one({})['status']=='Enrolled'
    assert db.advisingrecords.find_one({})['enrollmentStatus']=='enrolled'
    assert db.sections.find_one({'section':'D'})['blockCount']==1
    # An existing student with a new active advising record is updated, not inserted again.
    db.advisingrecords.update_one({}, {'$set':{'enrollmentStatus':'pending','year':'2','section':'A','semester':'2nd'}})
    result=client.post('/api/students/batch-enroll',json={'applicantIDs':[aid]}).json()
    assert len(result['enrolled'])==1 and db.students.count_documents({})==1
    assert db.students.find_one({})['year']=='2'
    assert db.sections.find_one({'year':'1'}) is None


def test_irregular_enrollment_preserves_pairs_and_avoids_double_count(client,db):
    aid,sn=advising_candidate(db,irregular=True)
    preview=client.post('/api/students/batch-enroll-preview',json={'applicantIDs':[aid]}).json()
    assert len(preview['placements'][0]['assigned_sections'])==3
    assert preview['placements'][0]['advisedSubjectCount']==3
    assert preview['placements'][0]['isIrregular'] is True
    assert [subject['subjectId'] for subject in preview['placements'][0]['irregularSubjects']] == ['CC101', 'CC201', 'CC301']
    section=preview['placements'][0]['available_sections'][0]
    assert section['irregularCount']==1 and section['irregularCapacity']==5
    assert section['displayCount']==0 and section['displayCapacity']==5
    assert all(item['displayCount'] == 0 and item['displayCapacity'] == 5
               for item in preview['placements'][0]['assigned_sections'])
    assert all(item['capacityAdjusted'] is False
               for item in preview['placements'][0]['assigned_sections'])
    assert client.post('/api/students/batch-enroll',json={'applicantIDs':[aid]}).status_code==200
    student=db.students.find_one({'studentNumber':sn})
    assert student['irregularSection']==['B','B'] and student['irregularYear']==['2','3']
    assert [s['irregularCount'] for s in db.sections.find({})]==[1,1,1]
    client.get('/api/sections')
    client.get('/api/sections')
    assert [s['irregularCount'] for s in db.sections.find({})]==[1,1,1]
    assert client.delete('/api/students/'+str(student['_id'])).status_code==200
    assert db.sections.count_documents({})==0


def test_full_irregular_placement_borrows_block_capacity(client,db,student):
    aid,_=advising_candidate(db,irregular=True)
    db.students.insert_one({**student,'studentNumber':'occupied','year':'2','section':'B','status':'Irregular'})
    db.students.insert_many([
        {**student, 'studentNumber': f'block-{index}', 'year': '2', 'section': 'B', 'status': 'Block'}
        for index in range(11)
    ])
    db.sections.insert_one({'year':'2','section':'B','semester':'1st','blockCount':11,'irregularCount':1,
                            'blockCapacity':15,'irregularCapacity':1,'totalCapacity':16})
    before=db.students.count_documents({})
    preview=client.post('/api/students/batch-enroll-preview',json={'applicantIDs':[aid]}).json()
    adjusted = next(item for item in preview['placements'][0]['assigned_sections']
                     if item['year']=='2' and item['section']=='B')
    assert adjusted['capacityAdjusted'] is True
    result=client.post('/api/students/batch-enroll',json={'applicantIDs':[aid]}).json()
    assert len(result['enrolled'])==1
    assert db.students.count_documents({})==before+1
    section=db.sections.find_one({'year':'2','section':'B'})
    assert section['blockCount']==11 and section['blockCapacity']==14
    assert section['irregularCount']==2 and section['irregularCapacity']==2


def test_full_irregular_placement_blocks_without_block_capacity(client,db,student):
    aid,_=advising_candidate(db,irregular=True)
    db.students.insert_one({**student,'studentNumber':'occupied','year':'2','section':'B','status':'Irregular'})
    db.sections.insert_one({'year':'2','section':'B','semester':'1st','blockCapacity':0,'irregularCapacity':1,'totalCapacity':1})
    before=db.students.count_documents({})
    result=client.post('/api/students/batch-enroll',json={'applicantIDs':[aid]}).json()
    assert result['blocked'][0]['reason']=='section_full'
    assert db.students.count_documents({})==before
    assert db.advisingrecords.find_one({})['enrollmentStatus']=='pending'


def test_missing_and_invalid_advising_candidates(client,db):
    result=client.post('/api/students/batch-enroll-preview',json={'applicantIDs':['unknown']}).json()
    assert result['notFound']==[{'applicantID':'unknown'}]
    aid,_=advising_candidate(db,irregular=True)
    db.advisingrecords.update_one({}, {'$set':{'advisedSubjects':[]}})
    result=client.post('/api/students/batch-enroll-preview',json={'applicantIDs':[aid]}).json()
    assert result['blocked'][0]['reason']=='invalid_advising_record'
    assert client.post('/api/students/batch-enroll',json={'applicantIDs':[]}).status_code==400
    assert client.post('/api/students/batch-enroll',json={'applicantIDs':[{'$ne':None}]}).status_code==400


def test_active_advising_moves_student_out_of_registered_list(client,db,student):
    db.students.insert_one({**student,'studentNumber':'20260001'})
    db.advisingrecords.insert_one({'applicantID':'A-20260001','enrollmentStatus':'pending','year':'2','section':'A','semester':'2nd','status':'Block'})
    assert client.get('/api/students').json()==[]
    assert db.students.find_one({})['status']=='Advised'
    candidate=client.get('/api/students/applicants').json()[0]
    assert candidate['studentNumber']=='20260001' and candidate['year']=='2'


def test_direct_enrollment_duplicate_and_missing_advising(client,db):
    db.applicants.insert_one({'applicantId':'A-20260001','firstName':'Ana','year':'1','semester':'1st','isIrregular':True})
    blocked=client.post('/api/students/enroll',json={'applicantID':'A-20260001'})
    assert blocked.status_code==409 and blocked.json()['blockReason']=='missing_advising_record'
    db.applicants.update_one({}, {'$set':{'isIrregular':False}})
    assert client.post('/api/students/enroll',json={'applicantID':'A-20260001'}).status_code==200
    assert client.post('/api/students/enroll',json={'applicantID':'A-20260001'}).status_code==409
    assert client.post('/api/students/enroll',json={}).status_code==400


def test_pending_validation_mapping(client,db):
    db.applicants.insert_many([{'applicantId':'A-1','firstName':'A'},{'applicantId':'A-2','firstName':'B'}])
    db.validation.insert_one({'applicant_number':'A-2','status':'Approved'})
    assert [a['applicant_number'] for a in client.get('/api/students/pending').json()]==['A-1']


def test_imports_split_capacity_and_preview_match(client,db,section):
    db.sections.insert_one({**section,'blockCapacity':2,'irregularCapacity':1,'totalCapacity':3})
    rows=[{'applicantID':f'A-2026{i:04d}','firstName':f'Person{i}','year':'1','semester':'1st'} for i in range(1,6)]
    preview=client.post('/api/students/block-import-preview',json={'students':rows}).json()['placements']
    assert [p['assigned_section'] for p in preview]==['A','A','B','B','C']
    assert db.students.count_documents({})==0
    result=client.post('/api/students/import',json={'importType':'block','students':rows}).json()
    assert result['imported']==5
    assert [s['section'] for s in db.students.find({}).sort('studentNumber')]==['A','A','B','B','C']
    assert client.post('/api/students/import',json={'importType':'block','students':rows}).status_code==409


def test_duplicate_student_import_is_atomic(client,db,student):
    db.students.insert_one(deepcopy(student))
    result=client.post('/api/students/import',json={'students':[student,{**student,'studentNumber':'new'}]})
    assert result.status_code==409 and db.students.count_documents({})==1
    assert result.json()['blockReason']=='student_exists'
    result=client.post('/api/students/import',json={'students':[{**student,'studentNumber':'dup'},{**student,'studentNumber':'dup'}]})
    assert result.status_code==409 and db.students.count_documents({})==1


def test_partial_section_import_and_aliases(client,db,student):
    db.students.insert_one(deepcopy(student))
    result=client.post('/api/students/import',json={'importType':'section','students':[student,{'student_number':'new','first_name':'Maria','last_name':'Reyes','year':2,'semester':'2nd','status':'Irregular'}]})
    assert result.status_code==200 and result.json()['imported']==1 and len(result.json()['blocked'])==1
    assert db.students.find_one({'studentNumber':'new'})['firstName']=='Maria'
    assert client.post('/api/students/import',json={'students':[{**student,'studentNumber':'missing','year':''}]}).status_code==400


def test_move_expands_target_and_deletes_empty_source(client,db,student,section):
    sid=client.post('/api/students',json=student).json()['_id']
    db.sections.insert_one({**section,'section':'B','blockCapacity':0,'irregularCapacity':0,'totalCapacity':0})
    result=client.post('/api/students/move-section',json={'studentIds':[sid],'targetSection':{'year':'1','semester':'1st','section':'B'}})
    assert result.status_code==200 and result.json()['section']['blockCount']==1
    assert db.sections.find_one({'section':'A'}) is None
    assert client.post('/api/students/move-section',json={'studentIds':[sid],'targetSection':{'year':'2','semester':'1st','section':'B'}}).status_code==404


def test_irregular_students_cannot_be_moved_between_sections(client, db, student, section):
    irregular = {**student, 'status': 'Irregular', 'irregularSection': ['A'], 'irregularYear': ['1']}
    sid = client.post('/api/students', json=irregular).json()['_id']
    db.sections.insert_one({**section, 'section': 'B'})

    result = client.post('/api/students/move-section', json={
        'studentIds': [sid],
        'targetSection': {'year': '1', 'semester': '1st', 'section': 'B'},
    })

    assert result.status_code == 400
    assert db.students.find_one({'studentNumber': irregular['studentNumber']})['section'] == 'A'
