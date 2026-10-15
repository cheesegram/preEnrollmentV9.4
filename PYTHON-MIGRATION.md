# Python migration - October 15, 2026

Recovered the unfinished FastAPI checkpoint and retained the previously completed green UI refinements.

## Implementation

- Replaced the Express/Mongoose backend with FastAPI, PyMongo and a Python launcher on port 5001.
- Preserved all 36 original HTTP method/path combinations for students, applicants, enrollment previews, imports, section moves/counts/capacity, curriculum, schedules, conflicts, schedule requests and PDF exports. Checked against the former Express route declarations.
- Retained MongoDB collection names, camelCase documents, advising rules, block/irregular allocation and cross-year section/year pairs.
- Added the frontend's previously missing `/api/auth/admin/login` handler, configurable administrator credentials and JWT validation. No administrator credentials are guessed or seeded.
- Added an optional API base URL and expired-session handling to the frontend's shared Axios client.
- Replaced undefined schedule room data with explicit validated room records supplied from MongoDB or the generate request.
- Completed the ReportLab COR, section batch exports, continuation pages and schedule archive checks. Fixed matching of per-class sections inside mixed-section master schedules.
- Added dependency files, administrator configuration, environment examples and Windows setup instructions.

The previous backend's Node maintenance/seed scripts are not shipped as Python commands. Normal application startup does not seed, reset or delete database indexes.

## Verification

- 40 automated backend tests passed with an isolated mongomock database.
- Tests cover student CRUD/filtering, duplicates and rejected Mongo operators, read-only previews, block and irregular enrollment, re-enrollment, imports, section counts/capacity/rebalancing, curriculum persistence, schedule enrichment/updates/conflicts/requests/generation, PDF exports and continuation rows, archives, administrator tokens, body-size limits, CORS, local rate limiting, administrator setup and same-origin frontend hosting.
- Production frontend build passed after migration changes.
- COR and continuation pages rendered and visually reviewed with synthetic student data, long labels and multiple meeting days.
- The dependency stack emits one upstream Starlette/httpx TestClient deprecation warning; the test suite passes.

No live MongoDB reads or writes were performed during migration verification. Production data, Atlas networking, transactions, Upstash, and hosted browser integration remain deployment checks. The earlier UI-only browser checks are recorded separately in `UI-CHANGES.md`.
