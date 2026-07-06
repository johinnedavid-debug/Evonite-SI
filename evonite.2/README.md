# SI Backend API

FastAPI SSE bridge between the Python SI platform and Next.js frontend.

## Run
```bash
pip install fastapi uvicorn
# From ai_platform root:
uvicorn backend.api_server:app --host 0.0.0.0 --port 8000 --reload
```
