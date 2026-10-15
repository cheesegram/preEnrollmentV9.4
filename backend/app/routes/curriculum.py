from typing import Any
from fastapi import APIRouter, Body, Request
from ..core import clean_document, fail, require, respond, text, year_key

router = APIRouter(prefix='/api/curriculum', tags=['Curriculum'])


def normalized(data):
    require(isinstance(data, dict), 'Curriculum data must be an object')
    payload = clean_document(data)
    subjects = payload.get('subjects')
    if not isinstance(subjects, list) or not subjects:
        subjects = [s for term in payload.get('semesters', []) if isinstance(term, dict) for s in term.get('subjects', [])]
    require(bool(subjects) and all(isinstance(s, dict) for s in subjects), 'Curriculum must include at least one subject')
    payload['subjects'] = subjects
    return payload


@router.get('')
@router.get('/', include_in_schema=False)
def all_curricula(request: Request):
    return respond(list(request.app.state.store['curriculums'].find({})))


@router.get('/doc/{document_id}')
def by_id(document_id: str, request: Request):
    result = request.app.state.store['curriculums'].find_one({'_id': document_id})
    require(result is not None, 'Curriculum not found', 404)
    return respond(result)


@router.post('/doc/{document_id}')
def save_id(document_id: str, request: Request, body: dict = Body(...)):
    payload = normalized(body.get('data'))
    store = request.app.state.store
    with store.write():
        store['curriculums'].update_one({'_id': document_id}, {'$set': payload}, upsert=True)
    return respond({'message': 'Curriculum saved successfully', 'replacedDocumentId': document_id,
                    'data': store['curriculums'].find_one({'_id': document_id})})


@router.get('/{year}')
def by_year(year: str, request: Request):
    key = year_key(year)
    require(key, 'Invalid year value')
    result = request.app.state.store['curriculums'].find_one({'_id': f'curriculum_{key}_year'})
    require(result is not None, 'Curriculum not found for the specified year', 404)
    return respond(result)


@router.post('')
@router.post('/', include_in_schema=False)
def save_years(request: Request, body: Any = Body(...)):
    rows = body if isinstance(body, list) else body.get('curricula', [body]) if isinstance(body, dict) else []
    require(isinstance(rows, list) and bool(rows), 'Year and data are required')
    plans = []
    for row in rows:
        if not isinstance(row, dict) or not year_key(row.get('year')) or not isinstance(row.get('data'), dict):
            continue
        key = year_key(row['year'])
        plans.append((f'curriculum_{key}_year', {'year': key, **normalized(row['data'])}))
    require(bool(plans), 'Curriculum must include at least one valid subject per year level')
    store = request.app.state.store
    with store.write():
        for document_id, payload in plans:
            store['curriculums'].update_one({'_id': document_id}, {'$set': payload}, upsert=True)
    ids = [item[0] for item in plans]
    results = [store['curriculums'].find_one({'_id': document_id}) for document_id in ids]
    return respond({'message': 'Curriculum saved successfully', 'replacedDocumentId': ids[0],
                    'replacedDocumentIds': ids, 'data': results[0] if len(results) == 1 else results})
