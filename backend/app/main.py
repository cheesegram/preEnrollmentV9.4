from contextlib import asynccontextmanager
import logging
import os
from pathlib import Path
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pymongo.errors import DuplicateKeyError, OperationFailure, PyMongoError
from .core import MongoJSONResponse, respond
from .database import Store, connect
from .auth import router as auth_router, require_admin
from .middleware import BodyLimitMiddleware, RateLimitMiddleware
from .routes import curriculum, schedules, sections, students

BACKEND = Path(__file__).resolve().parents[1]
logger = logging.getLogger(__name__)


def settings_from_env():
    load_dotenv(BACKEND / '.env', override=False)
    keys = ['MONGO_URI', 'MONGO_DB', 'ADMIN_EMAIL', 'ADMIN_PASSWORD_HASH', 'JWT_SECRET',
            'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']
    settings = {key: os.getenv(key, '') for key in keys}
    for key in ['MONGO_TRANSACTIONS', 'REQUIRE_ADMIN_AUTH', 'RATE_LIMIT_ENABLED']:
        settings[key] = os.getenv(key, 'false').lower() == 'true'
    settings['RATE_LIMIT_PER_MINUTE'] = int(os.getenv('RATE_LIMIT_PER_MINUTE', '100'))
    settings['CORS_ORIGINS'] = [s.strip() for s in os.getenv('CORS_ORIGINS', 'http://localhost:5173,http://127.0.0.1:5173').split(',') if s.strip()]
    settings['SERVE_FRONTEND'] = os.getenv('SERVE_FRONTEND', 'false').lower() == 'true' or os.getenv('NODE_ENV') == 'production'
    return settings


def create_app(database=None, settings=None):
    settings = {**settings_from_env(), **(settings or {})}
    @asynccontextmanager
    async def lifespan(app):
        if database is not None:
            store = database if isinstance(database, Store) else Store(database)
        else:
            try:
                store = connect(settings)
            except PyMongoError as error:
                # Never log a connection string or passwords from the exception.
                logger.error('MongoDB connection failed (%s). Check MONGO_URI, Atlas access list and database credentials.', type(error).__name__)
                raise RuntimeError('Unable to connect to MongoDB. Check backend/.env and Atlas network access.') from None
        app.state.store = store
        try:
            # Preserve existing names; never drop conflicting or legacy indexes automatically.
            store['students'].create_index('studentNumber', unique=True, name='studentNumber_1')
            store['sections'].create_index([('year', 1), ('section', 1), ('semester', 1)], unique=True, name='year_1_section_1_semester_1')
            yield
        finally:
            if database is None and store.client is not None:
                store.client.close()
    app = FastAPI(title='IITI Enrollment API', version='9.3-python', lifespan=lifespan, default_response_class=MongoJSONResponse)
    app.state.settings = settings
    app.add_middleware(BodyLimitMiddleware)
    app.add_middleware(RateLimitMiddleware, settings=settings)
    app.add_middleware(CORSMiddleware, allow_origins=settings['CORS_ORIGINS'], allow_credentials=False,
        allow_methods=['GET','POST','PUT','PATCH','DELETE','OPTIONS'], allow_headers=['Content-Type','Authorization'], expose_headers=['Content-Disposition'])

    @app.exception_handler(HTTPException)
    async def http_error(request, error):
        return respond(error.detail if isinstance(error.detail, dict) else {'message': str(error.detail)}, error.status_code)

    @app.exception_handler(RequestValidationError)
    async def invalid_body(request, error):
        return respond({'message': 'Invalid request body or parameters', 'errors': [{'loc': list(item['loc']), 'message': item['msg']} for item in error.errors()]}, 400)

    @app.exception_handler(DuplicateKeyError)
    async def duplicate(request, error):
        return respond({'message': 'A record with this unique identifier already exists', 'blockReason': 'duplicate_key'}, 409)

    @app.exception_handler(PyMongoError)
    async def database_error(request, error):
        logger.error('Database operation failed: %s', type(error).__name__)
        return respond({'message': 'Database operation failed. Please retry or check the database connection.'}, 503)

    @app.exception_handler(Exception)
    async def unexpected(request, error):
        logger.error('Unhandled application error: %s', type(error).__name__)
        return respond({'message': 'Internal server error'}, 500)

    app.include_router(auth_router)
    for router in [students.router, sections.router, curriculum.router, schedules.router]:
        app.include_router(router, dependencies=[Depends(require_admin)])

    @app.get('/api/health', tags=['Health'])
    def health():
        return {'status': 'ok', 'backend': 'python', 'database': 'mongodb'}

    if settings.get('SERVE_FRONTEND'):
        dist = BACKEND.parent / 'enrollment/dist'
        if dist.is_dir():
            assets = dist / 'assets'
            if assets.is_dir():
                app.mount('/assets', StaticFiles(directory=assets), name='assets')
            @app.get('/{path:path}', include_in_schema=False)
            def frontend(path: str):
                if path == 'api' or path.startswith('api/'):
                    return respond({'message': 'API route not found'}, 404)
                candidate = (dist / path).resolve()
                if candidate.is_relative_to(dist.resolve()) and candidate.is_file():
                    return FileResponse(candidate)
                return FileResponse(dist / 'index.html')
    return app


app = create_app()
