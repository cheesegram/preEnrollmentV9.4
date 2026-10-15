"""Shared compatibility helpers for the existing camelCase MongoDB documents."""
from datetime import date, datetime, timezone
from decimal import Decimal
import math
import re
from bson import ObjectId, Decimal128
from fastapi import HTTPException
from starlette.responses import JSONResponse


def text(value):
    if value is None:
        return ''
    if isinstance(value, bool):
        return 'true' if value else 'false'
    return str(value).strip()


def number(value, default=0):
    try:
        result = float(value or 0)
        return (int(result) if result.is_integer() else result) if math.isfinite(result) else default
    except (ValueError, TypeError, OverflowError):
        return default


def utcnow():
    return datetime.now(timezone.utc)


def as_list(value):
    return value if isinstance(value, list) else [value] if value not in (None, '') else []


def unique(values):
    return list(dict.fromkeys(value for value in map(text, values) if value))


def semester(value):
    return text(value) or 'N/A'


def year_number(value):
    raw = text(value).lower()
    match = re.search(r'[1-4]', raw)
    return match[0] if match else {'first': '1', 'second': '2', 'third': '3', 'fourth': '4'}.get(raw, raw)


def year_key(value):
    return {'1': '1st', '2': '2nd', '3': '3rd', '4': '4th'}.get(year_number(value))


def id_filter(value):
    """Match legacy string IDs and BSON ObjectIds without rewriting either."""
    raw = text(value)
    values = [raw]
    if ObjectId.is_valid(raw):
        values.append(ObjectId(raw))
    return {'_id': {'$in': values}}


def encoded(value):
    if isinstance(value, dict):
        return {str(k): encoded(v) for k, v in value.items() if 'password' not in str(k).lower()}
    if isinstance(value, (list, tuple)):
        return [encoded(v) for v in value]
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.isoformat(timespec='milliseconds').replace('+00:00', 'Z')
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, (Decimal, Decimal128)):
        return float(value.to_decimal() if isinstance(value, Decimal128) else value)
    return value


class MongoJSONResponse(JSONResponse):
    def render(self, content):
        return super().render(encoded(content))


def respond(data, status=200):
    return MongoJSONResponse(data, status_code=status)


def fail(status, message, **extra):
    raise HTTPException(status_code=status, detail={'message': message, **extra})


def require(condition, message, status=400):
    if not condition:
        fail(status, message)


def clean_document(value):
    """Do not pass client-supplied Mongo operators or immutable IDs to updates."""
    require(isinstance(value, dict), 'A JSON object is required')
    def scan(item):
        if isinstance(item, dict):
            for key, child in item.items():
                require(not key.startswith('$') and '.' not in key, 'Invalid document field')
                scan(child)
        elif isinstance(item, list):
            for child in item:
                scan(child)
    scan(value)
    return {k: v for k, v in value.items() if k not in {'_id', '_rev', '__v', 'createdAt', 'updatedAt'}}
