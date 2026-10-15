"""PyMongo connection lifecycle. No seed, reset, or index deletion runs at startup."""
from contextlib import contextmanager
from contextvars import ContextVar
from threading import RLock
from pymongo import MongoClient
from pymongo.errors import ConfigurationError

_session = ContextVar('mongo_session', default=None)


class Collection:
    def __init__(self, collection):
        self.raw = collection

    def __getattr__(self, name):
        method = getattr(self.raw, name)
        if not callable(method):
            return method
        def call(*args, **kwargs):
            session = _session.get()
            if session is not None:
                kwargs['session'] = session
            return method(*args, **kwargs)
        return call


class Store:
    def __init__(self, db, client=None, transactions=False):
        self.db, self.client = db, client
        self.transactions = transactions
        self.lock = RLock()

    def __getitem__(self, name):
        return Collection(self.db[name])

    @contextmanager
    def write(self):
        """Serialize allocation plans in one worker; optionally commit Mongo transactions."""
        with self.lock:
            if self.transactions and _session.get() is None:
                with self.client.start_session() as session:
                    token = _session.set(session)
                    try:
                        with session.start_transaction():
                            yield
                    finally:
                        _session.reset(token)
            else:
                yield


def connect(settings):
    if not settings['MONGO_URI']:
        raise RuntimeError('MONGO_URI is missing. Configure backend/.env before starting Python.')
    client = MongoClient(settings['MONGO_URI'], serverSelectionTimeoutMS=10000, tz_aware=True)
    try:
        client.admin.command('ping')
        if settings.get('MONGO_DB'):
            db = client[settings['MONGO_DB']]
        else:
            try:
                db = client.get_default_database()
            except ConfigurationError:
                db = client['test']  # Same default used by mongoose.connect(uri).
        return Store(db, client, settings.get('MONGO_TRANSACTIONS', False))
    except Exception:
        client.close()
        raise


def get_store(request):
    return request.app.state.store
