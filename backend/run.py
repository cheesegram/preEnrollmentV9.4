"""Start from any directory: python path/to/backend/run.py."""
from pathlib import Path
import os
from dotenv import load_dotenv
import uvicorn

if __name__ == '__main__':
    backend = Path(__file__).resolve().parent
    load_dotenv(backend / '.env')
    uvicorn.run('app.main:app', app_dir=str(backend), host=os.getenv('HOST', '127.0.0.1'),
                port=int(os.getenv('PORT', '5001')), reload=os.getenv('RELOAD', 'false').lower() == 'true', workers=1)
