from copy import deepcopy
from app.services.schedules import detect_conflicts, parse_time
from app.services.sections import capacities, create_state, add_student, section_status, index_name, section_index


def test_section_capacity_rules():
    assert capacities(50)=={'totalCapacity':50,'blockCapacity':45,'irregularCapacity':5}
    assert capacities(float('nan'))['totalCapacity']==50
    assert section_status(45,5,50)=='Full'
    assert section_status(46,5,50)=='Overloaded'
    state=create_state('1','1st','a')
    add_student(state,'Irregular')
    assert state['section']=='A' and state['irregularCount']==1
    assert index_name(27)=='AA' and section_index('AA')==27


def test_sections_create_update_delete_and_meta(client,db):
    payload={'year':'1','semester':'1st','section':'b'}
    created=client.post('/api/sections',json=payload)
    assert created.status_code==201 and created.json()['section']=='B'
    sid=created.json()['_id']
    assert client.post('/api/sections',json=payload).status_code==409
    assert client.patch('/api/sections/'+sid,json={'totalCapacity':40}).json()['blockCapacity']==36
    assert client.get('/api/sections/meta').json()=={'irregularTotal':0}
    assert client.delete('/api/sections/'+sid).status_code==200
    assert client.post('/api/sections',json={**payload,'year':'8'}).status_code==400


def test_delete_section_rejects_cross_year_irregular_occupant(client,db,student,section):
    db.students.insert_one({**student,'status':'Irregular','irregularSection':['B'],'irregularYear':['2']})
    sid=db.sections.insert_one({**section,'year':'2','section':'B'}).inserted_id
    assert client.delete('/api/sections/'+str(sid)).status_code==409


def test_capacity_change_rebalances_and_syncs(client,db,student):
    for i in range(5):
        db.students.insert_one({**student,'studentNumber':str(i)})
    client.post('/api/sections/sync')
    result=client.patch('/api/sections/capacity/all',json={'blockCapacity':2,'irregularCapacity':1})
    assert result.status_code==200 and result.json()['autoSectioningApplied']
    counts=sorted(s['blockCount'] for s in db.sections.find({}))
    assert counts==[1,2,2]
    assert sum(counts)==db.students.count_documents({})
    assert client.patch('/api/sections/capacity/all',json={'blockCapacity':0,'irregularCapacity':1}).status_code==409


def test_capacity_without_auto_preserves_placements(client,db,student):
    db.students.insert_one(deepcopy(student))
    client.post('/api/sections/sync')
    result=client.patch('/api/sections/capacity/all',json={'totalCapacity':0,'applyAutoSectioning':False})
    assert result.status_code==200
    assert db.sections.find_one({})['status']=='Overloaded'
    assert db.students.find_one({})['section']=='A'
    assert client.patch('/api/sections/capacity/all',json={'targetSections':[]}).status_code==400


def test_curriculum_shapes_and_string_ids(client,db):
    data={'_id':'wrong','semesters':[{'semester':1,'subjects':[{'subject_code':'CC101','title':'Introduction to Computing','units':3}]}]}
    result=client.post('/api/curriculum',json={'year':'First','data':data})
    assert result.status_code==200
    doc=client.get('/api/curriculum/1st').json()
    assert doc['_id']=='curriculum_1st_year' and len(doc['subjects'])==1
    assert client.get('/api/curriculum/doc/curriculum_1st_year').json()==doc
    result=client.post('/api/curriculum/doc/student_2026',json={'data':{'subjects':[{'subject_code':'CC201'}]}})
    assert result.status_code==200
    assert len(client.get('/api/curriculum').json())==2
    assert client.get('/api/curriculum/9').status_code==400
    assert client.post('/api/curriculum',json={'year':'1','data':{}}).status_code==400


def test_curriculum_multi_year_upload(client):
    rows=[{'year':str(year),'data':{'subjects':[{'subject_code':f'CC{year}01'}]}} for year in [1,2,3,4]]
    result=client.post('/api/curriculum',json={'curricula':rows}).json()
    assert len(result['replacedDocumentIds'])==4
    assert client.get('/api/curriculum/doc/missing').status_code==404


def test_schedule_enrichment_and_partial_update(client,db,schedule):
    sid=db.schedules.insert_one(deepcopy(schedule)).inserted_id
    db.curriculums.insert_one({'_id':'curriculum_1st_year','year':'1st','semesters':[{'semester':1,'subjects':[{'subject_code':'CC101','title':'Computing','units':3}]}]})
    result=client.get('/api/schedules/'+str(sid)).json()
    assert result['classes'][0]['subjectTitle']=='Computing'
    assert client.get('/api/schedules').status_code==200
    result=client.patch(f'/api/schedules/{sid}/classes',json={'updates':[{'classIndex':0,'changes':{'startTime':450,'days':['Tuesday','Tuesday'],'roomName':'R2'}}]})
    assert result.status_code==200 and result.json()['updatedCount']==1
    entry=db.schedules.find_one({})['classes'][0]
    assert entry['startTime']==450 and entry['endTime']==540 and entry['day']=='Tuesday' and entry['days']==['Tuesday']
    assert client.patch(f'/api/schedules/{sid}/classes',json={'updates':[{'classIndex':0,'changes':{'startTime':600}}]}).status_code==400
    assert db.schedules.find_one({})['classes'][0]['startTime']==450
    assert client.patch(f'/api/schedules/{sid}/classes',json={'updates':[{'classIndex':99,'changes':{'startTime':450}}]}).status_code==400


def test_class_update_batch_is_validated_before_writes(client,db,schedule):
    schedule['classes'].append({**schedule['classes'][0],'subjectCode':'CC102'})
    sid=db.schedules.insert_one(deepcopy(schedule)).inserted_id
    result=client.patch(f'/api/schedules/{sid}/classes',json={'updates':[{'classIndex':0,'changes':{'roomName':'changed'}},{'classIndex':1,'changes':{'startTime':900,'endTime':800}}]})
    assert result.status_code==400
    assert db.schedules.find_one({})['classes'][0]['roomName']=='Room 101'


def test_conflicts_cross_documents_and_adjacent_intervals(client,db,schedule):
    second=deepcopy(schedule)
    second.update(section='B')
    second['classes'][0].update(subjectCode='CC102',sectionName='BSIT-1B',startTime=500,endTime=600)
    db.schedules.insert_many([schedule,second])
    result=client.get('/api/schedules/conflicts').json()
    assert result['hasConflicts'] and {c['type'] for c in result['conflicts']}=={'room','instructor'}
    second['classes'][0]['startTime']=540
    assert not detect_conflicts([schedule,second])['hasConflicts']
    second['classes'][0]['startTime']=500
    second['semester']='2nd'
    assert not detect_conflicts([schedule,second])['hasConflicts']
    assert parse_time('12:00 AM')==0 and parse_time('1:30 PM')==810 and parse_time('25:00') is None


def test_schedule_requests_reuse_pending_snapshot(client,db,schedule):
    sid=str(db.schedules.insert_one(deepcopy(schedule)).inserted_id)
    first=client.post('/api/schedules/schedulerequests',json={'scheduleId':sid,'schedule':schedule})
    assert first.status_code==201
    schedule['classes'][0]['roomName']='new room'
    second=client.post('/api/schedules/schedulerequests',json={'scheduleId':sid,'schedule':schedule})
    assert second.status_code==200 and first.json()['requestId']==second.json()['requestId']
    assert db.schedulerequests.count_documents({})==1
    assert client.get('/api/schedules/schedulerequests').json()[0]['academicYear']=='2026-2027'
    assert client.post('/api/schedules/schedulerequests',json={'scheduleId':sid}).status_code==400


def test_generator_requires_real_rooms_and_keeps_preview_read_only(client,db,section):
    db.sections.insert_one(section)
    db.curriculums.insert_one({'_id':'curriculum_1st_year','year':'1st','semesters':[{'semester':1,'subjects':[{'subject_code':'CC101','title':'Computing','lecture':2,'laboratory':0,'units':3}]}]})
    db.professors.insert_one({'name':'Prof Reyes','specializations':['CC101']})
    assert client.post('/api/schedules/generate',json={}).status_code==400
    db.rooms.insert_one({'name':'Room 1','type':'Lecture'})
    result=client.post('/api/schedules/generate',json={}).json()
    assert result['success'] and result['totalScheduled']==1 and not result['failedToSchedule']
    assert result['data'][0]['sectionName']=='BSIT-1A'
    assert db.schedules.count_documents({})==0
