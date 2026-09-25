"""
EduVault Platform — Unified Backend & Frontend Server
Runs the FastAPI server with live WebSockets, SQLite database, and serves the frontend.
"""
import os
import sys

# Ensure backend folder is in Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))

import uvicorn

if __name__ == "__main__":
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", 8000))

    print("=" * 65)
    print("Starting EduVault Platform Unified Server")
    print("=" * 65)
    print(f"Host & Port:      http://{host}:{port}")
    print(f"API Swagger Docs: http://{host}:{port}/docs")
    print(f"WebSocket Hub:    ws://{host}:{port}/ws/session/{{session_id}}")
    print("Database:         backend/eduvault.db (SQLite)")
    print("=" * 65)
    
    uvicorn.run("app:app", host=host, port=port, reload=False, app_dir="backend")
