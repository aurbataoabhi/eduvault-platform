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
    print("=" * 65)
    print("Starting EduVault Platform Unified Server")
    print("=" * 65)
    print("Frontend & App:   http://127.0.0.1:8000")
    print("API Swagger Docs: http://127.0.0.1:8000/docs")
    print("WebSocket Hub:    ws://127.0.0.1:8000/ws/session/{session_id}")
    print("Database:         backend/eduvault.db (SQLite)")
    print("=" * 65)
    
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=False, app_dir="backend")
