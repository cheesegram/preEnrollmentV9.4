from copy import deepcopy
from fastapi import APIRouter, Body, Request
from ..core import clean_document, id_filter, number, require, respond, text, utcnow, year_number
from ..services.schedules import (curriculum_entries, days, detect_conflicts, enrich, parse_time, solve, term_key)

router = APIRouter(prefix='/api/schedules', tags=['Schedules'])
EDITABLE = {'subjectCode', 'subjectTitle', 'subjectName', 'units', 'day', 'days', 'startTime', 'endTime', 'roomName', 'profName', 'roomId', 'profId', 'sectionName'}


@router.get('')
@router.get('/', include_in_schema=False)
def all_schedules(request: Request):
    store = request.app.state.store
    return respond(enrich(list(store['schedules'].find({}).sort([('generatedAt', -1), ('generated_at', -1)])), list(store['curriculums'].find({}))))


@router.get('/conflicts')
def conflicts(request: Request):
    return respond(detect_conflicts(list(request.app.state.store['schedules'].find({}))))


@router.post('/schedulerequests')
def make_request(request: Request, body: dict = Body(...)):
    body = clean_document(body)
    sid, schedule = body.get('scheduleId'), body.get('schedule')
    require(isinstance(sid, str) and text(sid) and isinstance(schedule, dict), 'Request body must include scheduleId and schedule.')
    status = body.get('status') or 'pending'
    require(status in {'pending', 'approved', 'rejected'}, 'Invalid schedule request status')
    store = request.app.state.store
    with store.write():
        existing = store['schedulerequests'].find_one({'scheduleId': sid, 'status': 'pending'}, sort=[('created_at', -1)])
        payload = {'scheduleId': sid, 'schedule': schedule, 'section': text(schedule.get('section')), 'year': text(schedule.get('year')), 'updated_at': utcnow()}
        if existing:
            store['schedulerequests'].update_one({'_id': existing['_id']}, {'$set': payload})
            saved, code, message = {**existing, **payload}, 200, 'Schedule request updated successfully.'
        else:
            payload.update(status=status, created_at=utcnow())
            payload['_id'] = store['schedulerequests'].insert_one(payload).inserted_id
            saved, code, message = payload, 201, 'Schedule request created successfully.'
    return respond({'message': message, 'requestId': saved['_id'], **{k: saved[k] for k in ['scheduleId', 'status', 'created_at', 'updated_at']}}, code)


@router.get('/schedulerequests')
def requests(request: Request):
    store = request.app.state.store
    schedules = {text(s['_id']): s for s in store['schedules'].find({})}
    result = []
    for entry in store['schedulerequests'].find({}).sort('created_at', -1):
        current = schedules.get(text(entry['scheduleId']), {})
        snapshot = entry.get('schedule') or {}
        result.append({**entry, 'section': entry.get('section') or current.get('section', ''),
            'year': entry.get('year') or current.get('year', ''), 'semester': current.get('semester') or snapshot.get('semester', ''),
            'academicYear': current.get('academic_year') or current.get('academicYear') or snapshot.get('academic_year') or snapshot.get('academicYear', '')})
    return respond(result)


@router.post('/generate')
def generate(request: Request, body: dict = Body(default={})):
    body = clean_document(body)
    store = request.app.state.store
    curricula = list(store['curriculums'].find({'_id': {'$in': [f'curriculum_{key}_year' for key in ['1st', '2nd', '3rd', '4th']]}}))
    require(bool(curricula), 'No curriculum documents found for any year level.', 404)
    rooms = body.get('rooms') if isinstance(body.get('rooms'), list) else list(store['rooms'].find({}))
    require(bool(rooms), 'Schedule generation needs room data. Add rooms to the MongoDB rooms collection or provide a rooms array.')
    require(all(isinstance(r, dict) and text(r.get('name')) and text(r.get('id', r.get('_id'))) and r.get('type') in {'Lecture', 'Laboratory'} for r in rooms), 'Each room needs id (or _id), name, and type: Lecture or Laboratory')
    professors = list(store['professors'].find({}))
    sections = list(store['sections'].find({}))
    workload = []
    for section in sections:
        for document in curricula:
            if year_number(section.get('year')) != year_number(document.get('year') or document.get('_id')):
                continue
            for subject, term in curriculum_entries(document):
                if term_key(term) != term_key(section.get('semester')):
                    continue
                if body.get('semester') and term_key(body['semester']) != term_key(term):
                    continue
                code = text(subject.get('subject_code', subject.get('code')))
                lab, lecture = number(subject.get('laboratory')), number(subject.get('lecture'))
                kind = 'Laboratory' if lab > 0 else 'Lecture'
                workload.append({'sectionName': f"BSIT-{section['year']}{section['section']}", 'subjectCode': code,
                    'semester': term_key(term), 'isLaboratory': lab > 0, 'durationMinutes': (lab if lab > 0 else lecture) * 60,
                    'candidateRooms': [r for r in rooms if r.get('type') == kind],
                    'candidateProfs': [p for p in professors if code in (p.get('specializations') or [])]})
    require(bool(workload), 'No subjects match the existing sections and semesters.', 404)
    result = solve(workload)
    return respond({'success': True, 'totalScheduled': len(result['masterSchedule']), 'failedToSchedule': result['unassignedSessions'], 'data': result['masterSchedule']})


@router.get('/{schedule_id}')
def by_id(schedule_id: str, request: Request):
    store = request.app.state.store
    schedule = store['schedules'].find_one(id_filter(schedule_id))
    require(schedule is not None, 'Schedule not found with the provided ID.', 404)
    return respond(enrich([schedule], list(store['curriculums'].find({})))[0])


@router.patch('/{schedule_id}/classes')
def update_classes(schedule_id: str, request: Request, body: dict = Body(...)):
    body = clean_document(body)
    updates = body.get('updates')
    require(isinstance(updates, list) and bool(updates), 'No class updates were provided.')
    store = request.app.state.store
    with store.write():
        schedule = store['schedules'].find_one(id_filter(schedule_id))
        require(schedule is not None, 'Schedule not found with the provided ID.', 404)
        classes = deepcopy(schedule.get('classes') or [])
        paths, touched = {}, []
        for update in updates:
            if not isinstance(update, dict):
                continue
            index = number(update.get('classIndex'), None)
            if index is None or int(index) != index or index < 0 or index >= len(classes) or not isinstance(update.get('changes'), dict):
                continue
            index = int(index)
            changes = {k: v for k, v in update['changes'].items() if k in EDITABLE}
            if not changes:
                continue
            if 'days' in changes:
                require(isinstance(changes['days'], list), 'days must be an array')
                changes['days'] = days(changes)
                changes['day'] = changes['days'][0] if changes['days'] else ''
            for key in ['startTime', 'endTime']:
                if key in changes:
                    value = parse_time(changes[key])
                    require(value is not None and 0 <= value <= 1440, f'Invalid {key} for classIndex {index}.')
                    changes[key] = value
            merged = {**classes[index], **changes}
            start, end = parse_time(merged.get('startTime')), parse_time(merged.get('endTime'))
            require(start is None or end is None or start < end, f'Invalid time range for classIndex {index}.')
            if 'units' in changes:
                changes['units'] = number(changes['units'])
                require(changes['units'] >= 0, 'units must not be negative')
            for key, value in changes.items():
                paths[f'classes.{index}.{key}'] = value
            classes[index] = {**classes[index], **changes}
            touched.append(index)
        require(bool(touched), 'No valid class updates were provided.')
        store['schedules'].update_one({'_id': schedule['_id']}, {'$set': {**paths, 'updated_at': utcnow()}})
    return respond({'success': True, 'scheduleId': str(schedule['_id']), 'updatedCount': len(touched)})
