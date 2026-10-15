# Python API

FastAPI handles HTTP requests, PyMongo reads and writes the existing MongoDB collections, and ReportLab generates the COR PDFs. Run one backend process with `python run.py` after installing `requirements.txt`. The launcher works from any current directory.

## Configuration

`backend/.env` loads without overriding variables already supplied by the host environment. No database seeding, collection deletion, or legacy index deletion runs at startup. The existing student-number and year/section/semester uniqueness indexes are ensured at startup; conflicting existing indexes or duplicate data must be resolved separately.

| Setting | Purpose / default |
| --- | --- |
| `MONGO_URI` | Required; keep your previous MongoDB connection string. |
| `MONGO_DB` | Optional explicit database name; otherwise use the URI database or `test`, matching the former Mongoose default. |
| `HOST`, `PORT` | `127.0.0.1`, `5001`. Use `HOST=0.0.0.0` for hosting or LAN access. |
| `RELOAD` | `false`; enable for local development if desired. |
| `CORS_ORIGINS` | Comma-separated frontend origins, defaulting to localhost and 127.0.0.1 on port 5173. |
| `SERVE_FRONTEND` | `false`; enable to serve `enrollment/dist` from the API server. |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`, `JWT_SECRET` | Set using `python configure_admin.py`. No default administrator password. |
| `REQUIRE_ADMIN_AUTH` | `false` for compatibility with the old API; administrator setup enables it. Enable before exposing the application. |
| `MONGO_TRANSACTIONS` | `false`; set to `true` with MongoDB Atlas or another replica set to make grouped writes transactional. |
| `RATE_LIMIT_ENABLED` | `false`; administrator setup enables it. |
| `RATE_LIMIT_PER_MINUTE` | `100` requests per connecting IP address across `/api/` routes. |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Optional remote rate-limit storage; absent or unavailable service uses a local window. |

The launcher deliberately uses one worker because enrollment allocation is serialized within the process. Keep a single backend process/instance for section allocation; enabling transactions alone does not provide application-level retry handling across multiple instances. On standalone MongoDB, grouped changes have no automatic rollback after an unexpected database failure. Atlas transactions improve failure rollback without changing collection formats.

## Administrator login

Run `python configure_admin.py`, restart the backend, and sign in using the existing frontend login page. Passwords are hashed with salted scrypt. Tokens expire after eight hours. The frontend sends the token automatically and returns to login when the API reports an expired or invalid session.

Development-only bypass remains available by explicitly setting both `REQUIRE_ADMIN_AUTH=false` in `backend/.env` and `VITE_DEV_BYPASS_AUTH=true` in `enrollment/.env.development.local`. Restart both servers after changing settings. Production frontend builds ignore that bypass.

## Frontend hosting

Build the frontend:

```sh
cd enrollment
npm ci
npm run build
```

Set `SERVE_FRONTEND=true` in `backend/.env`, then start the backend. The API serves the compiled app, including client-side routes, from the same host and port. Unknown `/api/` paths remain API 404 responses.

For separate frontend hosting, set `VITE_API_BASE_URL=https://your-api-host/api` before building the frontend and add its exact origin to `CORS_ORIGINS`. Node is still needed to build/develop React; the API runtime is Python.

## MongoDB compatibility

Collections retain their former names: `students`, `applicants`, `advisingrecords`, `validation`, `sections`, `curriculums`, `schedules`, `schedulerequests`, `professors`, `subjects`, and `studentarchive`. Schedule generation additionally uses `rooms` when an explicit request-body room list is absent.

Existing camelCase fields, string curriculum IDs, BSON ObjectIds, and date serialization are supported. Responses exclude password fields. Existing password values in student documents are not migrated or used for administrator authentication.

The existing list/sync behavior is preserved: fetching students can mark active advising candidates as `Advised` and archive current schedules; section sync/list can recount and delete empty sections. Placement preview endpoints do not write to MongoDB.

## Schedule generation and PDFs

`POST /api/schedules/generate` returns a schedule preview and does not save it. The former implementation referred to undefined room data. Provide real rooms in `rooms` or in the request body:

```json
{"rooms":[{"id":"room-101","name":"Room 101","type":"Lecture"},{"id":"lab-1","name":"Computer Lab 1","type":"Laboratory"}]}
```

MongoDB room records can use their `_id` instead of `id`. Professors need a `name` and a `specializations` array matching subject codes. Existing sections and curricula determine the workload. Sessions without a suitable room or instructor are reported in `failedToSchedule`.

Edit `data/cor_config.json` to change the existing COR school labels and fee defaults. The supplied template's printed fee and eligibility defaults are retained. A normal export places the COR and permit/clearance on one Letter page, as the uploaded implementation does; more than ten schedule rows add continuation pages. Section exports include one form per student plus any continuations.

## Tests

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m pytest -q
```

Tests use isolated in-memory MongoDB substitutes. They do not access the configured live database. Real Atlas authentication, existing-data/index compatibility, and replica-set transaction behavior need a check against your deployment.

## Troubleshooting

- **Python cannot import a package:** install requirements with the same Python executable used to launch `run.py`.
- **MongoDB connection fails:** check `MONGO_URI`, credentials, Atlas network access and your connection. An SRV URI also requires functioning DNS. Startup does not print connection secrets.
- **Login is not configured:** run `configure_admin.py`, then restart Python.
- **API requests return 401 after setup:** set the frontend bypass to false, clear an old development session if necessary, and sign in.
- **Rate limit during repeated local testing:** wait one minute or disable `RATE_LIMIT_ENABLED` locally.
- **Port conflict:** stop the old Node backend before starting Python on port 5001.
