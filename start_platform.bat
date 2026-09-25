@echo off
title EduVault Platform - Unified Server
cls
echo ==============================================================
echo        EduVault - Secure Education Platform Launcher
echo ==============================================================
echo.
echo Starting FastAPI + SQLite Backend & Frontend Server...
echo.
echo Open your browser to: http://127.0.0.1:8000
echo API Documentation:    http://127.0.0.1:8000/docs
echo.
echo Press Ctrl+C in this window to stop the server anytime.
echo ==============================================================
echo.

start "" "http://127.0.0.1:8000"
python run_server.py
pause
