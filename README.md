# IITI Pre-enrollment v9.3 - Python backend

The backend now runs on Python / FastAPI with PyMongo. MongoDB remains the database. The React / Vite frontend includes the recovered green UI improvements.

## Windows quick start

Install Python 3.12 or newer and Node.js 20.19+ (or 22.12+). Extract the ZIP before running these commands.

Open a PowerShell terminal in the extracted project folder:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe configure_admin.py
.\.venv\Scripts\python.exe run.py
```

Your existing `backend/.env` is preserved, including the MongoDB connection configuration. If starting from a clean copy, copy `backend/.env.example` to `backend/.env` and enter your `MONGO_URI` first. Use the same database as your former backend; `MONGO_DB` can explicitly select it.

`configure_admin.py` prompts for an email and password, stores a password hash, generates a signing secret, and enables administrator authentication and rate limiting. It preserves existing database settings. Sign in with the credentials you enter. The supplied frontend development setting now has `VITE_DEV_BYPASS_AUTH=false` so you can use this login.

Keep that terminal open. Open a second terminal in the project folder:

```powershell
cd enrollment
npm ci
npm run dev
```

Open **http://localhost:5173**. The Python API runs on **http://127.0.0.1:5001**, with API documentation at **http://127.0.0.1:5001/docs**.

For later starts, run the final command in each terminal again. Stop a server with Ctrl+C. Backend startup now uses `python run.py`; frontend development still uses npm.

## Linux / macOS

```sh
cd backend
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python configure_admin.py
.venv/bin/python run.py
```

Use the same frontend commands as above in a second terminal.

## Details

- [Backend configuration and deployment](backend/README.md)
- [Migration changes and verification](PYTHON-MIGRATION.md)
- [Recovered UI work](UI-CHANGES.md)

Dependencies, caches and generated frontend build files are excluded from the ZIP. The backend's former Node / Express runtime has been replaced. Keep the original archive if you need the old Node maintenance utilities.
