# EduVault Platform — Backend & Session Continuity API

A FastAPI backend powered by SQLite, WebSockets, and AI catch-up synthesis designed to support seamless session continuity for students and teachers who experience internet drops, network latency, or power outages.

---

## 🏗️ Architecture Overview

```
                      ┌───────────────────────────────┐
                      │    EduVault Web Frontend      │
                      │  (HTML5, Vanilla CSS, JS)     │
                      └───────▲───────────────▲───────┘
                              │ REST          │ WebSockets
                              ▼               ▼
                      ┌───────────────────────────────┐
                      │      FastAPI App Engine       │
                      │  - Heartbeat & Disconnects    │
                      │  - Catch-Up Window Calculator │
                      │  - AI Summary Pipeline        │
                      └───────────────┬───────────────┘
                                      ▼
                      ┌───────────────────────────────┐
                      │    SQLite Database Engine     │
                      │         (eduvault.db)         │
                      └───────────────────────────────┘
```

---

## 🚀 How to Run the Server

To launch the unified backend and frontend server:

```bash
python run_server.py
```

Once running:
- **Web App (Frontend & UI)**: [http://127.0.0.1:8000](http://127.0.0.1:8000)
- **Interactive Swagger API Docs**: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- **OpenAPI JSON Specification**: [http://127.0.0.1:8000/openapi.json](http://127.0.0.1:8000/openapi.json)
- **WebSocket Gateway**: `ws://127.0.0.1:8000/ws/session/{session_id}`

---

## 📡 API Endpoints

### 1. Health & Status
- `GET /api/health` — Returns server health, active SQLite database, and feature flags.

### 2. Sessions & Classes
- `GET /api/sessions` — List all active, live, and archived sessions (filter by `?category=dsa|ml|webdev`).
- `GET /api/sessions/{session_id}` — Get single session details.

### 3. Session Continuity & Catch-Up (Core Feature)
- `GET /api/sessions/{session_id}/catchup?user_id=student_demo`
  - Calculates the exact missed duration (e.g., `12 minutes`).
  - Returns missed chat messages sent while disconnected.
  - Returns teacher instructions/assignments broadcasted during the outage.
  - Returns the exact video seek timestamp to jump to in the recording (e.g., `00:33:00`).
  - Returns the AI-generated Catch-Up Summary.

### 4. Real-time Chat Archive
- `GET /api/sessions/{session_id}/chat` — Retrieve searchable chat history (`?search=query&missed_only=true`).
- `POST /api/sessions/{session_id}/chat` — Post a chat message (persists to SQLite and broadcasts to all WebSocket listeners).

### 5. Teacher Instructions & Announcements
- `GET /api/sessions/{session_id}/instructions` — Get timeline of instructions, tasks, and shared files.
- `POST /api/sessions/{session_id}/instructions` — Broadcast teacher announcements and tasks.

### 6. AI Catch-Up Summaries
- `GET /api/sessions/{session_id}/ai-summary` — Retrieve synthesized catch-up summary.
- `POST /api/sessions/{session_id}/ai-summary/generate` — Trigger new AI synthesis from recorded chat logs and whiteboard slides.

### 7. Simulation & Testing
- `POST /api/sessions/{session_id}/simulate-disconnect` — Simulates a power loss or Wi-Fi drop for testing reconnection workflows.

---

## 🔌 WebSocket Events
Connect to: `ws://127.0.0.1:8000/ws/session/{session_id}?user_id={id}&role={student|teacher}`

### Server-to-Client Events:
- `connection_established`: Confirms connection and returns immediate catch-up availability.
- `chat_message`: Pushes new messages to all connected participants.
- `teacher_instruction`: Pushes newly posted instructions/assignments in real time.
- `user_reconnected`: Notifies student that missed content has been synchronized.

### Client-to-Server Events:
- `{"action": "heartbeat"}`: Pings server to keep connection alive.
- `{"action": "chat", "text": "...", "sender": "..."}`: Sends new message.
