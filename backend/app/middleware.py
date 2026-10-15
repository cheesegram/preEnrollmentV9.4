from collections import defaultdict, deque
import hashlib
import json
import logging
import secrets
from threading import Lock
import time
import httpx
from starlette.responses import JSONResponse


class BodyLimitMiddleware:
    def __init__(self, app, maximum=2*1024*1024):
        self.app, self.maximum = app, maximum

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http':
            return await self.app(scope, receive, send)
        messages, size = [], 0
        while True:
            message = await receive()
            if message['type'] == 'http.disconnect':
                return
            size += len(message.get('body', b''))
            if size > self.maximum:
                return await JSONResponse({'message': 'Request body exceeds the 2 MB limit'}, status_code=413)(scope, receive, send)
            messages.append(message)
            if not message.get('more_body', False):
                break
        async def replay():
            if messages:
                return messages.pop(0)
            return await receive()
        await self.app(scope, replay, send)


class RateLimitMiddleware:
    """Optional 100/min per-IP sliding window; Upstash when configured, local otherwise."""
    SCRIPT = """local key=KEYS[1]; local now=tonumber(ARGV[1]); redis.call('ZREMRANGEBYSCORE',key,0,now-60000); if redis.call('ZCARD',key)>=tonumber(ARGV[2]) then return 0 end; redis.call('ZADD',key,now,ARGV[3]); redis.call('PEXPIRE',key,60000); return 1"""

    def __init__(self, app, settings):
        self.app, self.settings = app, settings
        self.buckets, self.lock = defaultdict(deque), Lock()

    def local_allowed(self, key, limit):
        now = time.monotonic()
        with self.lock:
            # Remove idle keys so disconnected clients cannot grow memory indefinitely.
            if len(self.buckets) > 1000:
                for stale in [k for k, bucket in self.buckets.items() if not bucket or bucket[-1] < now-60]:
                    self.buckets.pop(stale, None)
            bucket = self.buckets[key]
            while bucket and bucket[0] <= now-60:
                bucket.popleft()
            if len(bucket) >= limit:
                return False
            bucket.append(now)
            return True

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http' or not self.settings.get('RATE_LIMIT_ENABLED') or not scope['path'].startswith('/api/'):
            return await self.app(scope, receive, send)
        address = (scope.get('client') or ('unknown', 0))[0]
        key = 'iiti:ratelimit:' + hashlib.sha256(address.encode()).hexdigest()
        limit = self.settings.get('RATE_LIMIT_PER_MINUTE', 100)
        url, token = self.settings.get('UPSTASH_REDIS_REST_URL'), self.settings.get('UPSTASH_REDIS_REST_TOKEN')
        if url and token:
            try:
                async with httpx.AsyncClient(timeout=3) as client:
                    response = await client.post(url.rstrip('/'), headers={'Authorization': 'Bearer '+token}, json=['EVAL', self.SCRIPT, 1, key, int(time.time()*1000), limit, secrets.token_hex(12)])
                    response.raise_for_status()
                    value = response.json()
                    if 'error' in value:
                        raise ValueError('Redis command failed')
                    allowed = bool(value.get('result'))
            except (httpx.HTTPError, ValueError):
                logging.getLogger(__name__).warning('Remote rate limiter unavailable; using local window')
                allowed = self.local_allowed(key, limit)
        else:
            allowed = self.local_allowed(key, limit)
        if not allowed:
            return await JSONResponse({'message': 'Too many requests, please try again later'}, status_code=429, headers={'Retry-After': '60'})(scope, receive, send)
        await self.app(scope, receive, send)
