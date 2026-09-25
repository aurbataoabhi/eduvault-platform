# 🚀 Connecting EduVault Frontend and Backend

This guide explains how the EduVault frontend and backend are connected, the architectural flow, and how to run and test the complete system.

---

## 🏗️ 1. Architecture Overview

EduVault operates on a **Unified Architecture**:
```
┌─────────────────────────────────────────────────────────────┐
│                 Client Browser (HTML5 / CSS / Vanilla JS)    │
│  - Interactive Demo Persona Switcher (Teacher / Student)    │
│  - Live Class Video & Real-Time Chat                        │
│  - Session Continuity & Catch-Up Hub                        │
│  - AI Doubt Solver (with formulas & lecture references)     │
│  - DRM Anti-Screen Recording & Proctoring                   │
└──────────────┬───────────────────────────────▲──────────────┘
               │                               │
      HTTP REST Requests               WebSocket Frames
  (/api/health, /api/auth/login,      (/ws/session/{id})
   /api/sessions/{id}/catchup,         - 4ms Heartbeat
   /api/ai/ask, /api/leaderboard)      - Live Broadcasts
               │                               │
               ▼                               │
┌──────────────────────────────────────────────┴──────────────┐
│           FastAPI Unified Backend (run_server.py)           │
│  - Port 8000 on http://127.0.0.1:8000                       │
│  - Serves index.html, /css, /js, /assets directly           │
│  - SQLite Database Engine (backend/eduvault.db)             │
│  - AI Synthesis & Catch-Up Generator (ai_service.py)        │
└─────────────────────────────────────────────────────────────┘
```

---

## ⚡ 2. How Frontend and Backend Are Connected

### A. Same-Origin Serving (Zero CORS Friction)
- The FastAPI backend (`backend/app.py`) mounts the static directories (`/css`, `/js`, `/assets`) and serves `index.html` at the root `/`.
- When you open **`http://127.0.0.1:8000`**, the browser loads the frontend directly from the server.
- All API requests use relative paths or `http://127.0.0.1:8000`, eliminating cross-origin security restrictions.

### B. Live Connection & Ping Latency Badge
- The top-right navbar contains the `#backend-status-badge`.
- Every page load runs `checkBackendHealth()`, which pings `GET /api/health`.
- If the server is active, it calculates real-time latency (e.g. `🟢 Backend Live (4ms)`). Clicking the badge triggers an instant diagnostic test.
- If running offline, it displays `🟡 Standalone Mode` and uses client-side state without breaking.

### C. Live Real-Time WebSockets (`/ws/session/{id}`)
- Connected in `js/app.js` (`BackendSync.connectWebSocket(sessionId)`).
- When a teacher or student types a message in the Live Class chat, it sends a JSON frame through the WebSocket.
- The server broadcasts the message to all connected peers in that session and writes it directly to SQLite table `chat_messages`.

### D. Disconnection & Outage Synchronization
- When an outage occurs (or when clicking **"Simulate Wi-Fi/Power Disconnect"**):
  1. The client calls `POST /api/sessions/{id}/simulate-disconnect`.
  2. The server records the disconnect in `user_attendance` and tags subsequent messages as `is_missed = 1`.
  3. Upon reconnection, the server calculates the missed window (e.g., `12 minutes`) and sends the catch-up payload.
  4. The frontend displays the **Welcome Back Banner** and synchronizes all missed announcements, tasks, and AI summary points.

### E. AI Doubt Solver Backend Integration (`/api/ai/ask`)
- Clicking quick question chips (like `🌳 BST vs AVL` or `⏱️ Big-O Complexity`) or typing a custom question sends a `POST /api/ai/ask` request.
- The server analyzes the query, generates step-by-step explanations, provides mathematical formulas, and recommends relevant session recordings.

### F. Assessments & Leaderboard Sync (`/api/assessments/submit` & `/api/leaderboard`)
- Submitting a test sends answers and proctoring integrity flags to the backend.
- The backend grades the test, updates student points in SQLite, and syncs the live leaderboard table.

---

## 🎨 3. Design & Aesthetic Enhancements Implemented

1. **Curated Luxury Color Palette**:
   - Deep Cosmic Obsidian base (`#070A14`, `#0D1224`, `#131A36`).
   - Electric Indigo (`#6366F1`), Royal Violet (`#8B5CF6`), and Cyber Cyan (`#06B6D4`).
   - Ambient layered radial glows for silky visual depth without screen glare.
2. **Reduced Clutter & Increased Whitespace**:
   - Refined padding (`padding-top: 104px`) so content never clips under navbars.
   - Frosted glass cards with translucent borders (`rgba(255, 255, 255, 0.07)`).
   - Micro-interaction hover lifts (`translateY(-3px)`) and soft ambient shadows.
3. **Interactive Quick-Demo Persona Switcher**:
   - A sleek control strip directly beneath the navbar:
     - `👨‍🏫 Teacher Portal`: Instant 1-click login as Prof. Rajesh Sharma.
     - `🎓 Student Portal`: Instant 1-click login as Abhishek Dwivedi.
     - `⚡ Catch-Up Hub`: Direct jump to test disconnection and recovery sync.
     - `🔴 Live Class Room`: Direct jump to WebSocket-connected classroom.
4. **Floating Feature Badges on Hero Visual**:
   - Floating glass badges showcasing DRM protection, Wi-Fi reconnection sync, and sub-second WebSocket engine.

---

## 🏃 4. How to Run the Platform

### Option 1: Double-Click Launcher (Windows)
Simply double-click the included `start_platform.bat` script in the root directory. It will start the server and open your default browser to `http://127.0.0.1:8000`.

### Option 2: Terminal / Command Prompt
```bash
python run_server.py
```
Then visit:
- **Web Platform**: [http://127.0.0.1:8000](http://127.0.0.1:8000)
- **Interactive Swagger API Docs**: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
