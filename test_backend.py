import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))

from fastapi.testclient import TestClient
from app import app
import security

client = TestClient(app)

print("=================================================================")
print(" EduVault Platform — Full Automated Production Test Suite")
print("=================================================================")

# 1. Healthcheck
print("\n[Test 1] Healthcheck API (/api/health)")
r = client.get("/api/health")
print("Status:", r.status_code, "Service:", r.json().get("service"))
assert r.status_code == 200

# 2. Cryptographic Security Engine
print("\n[Test 2] Enterprise Cryptography (Argon2id & JWT HS256)")
pwd = "SuperSecretPassword2026!"
hashed = security.hash_password(pwd)
assert security.verify_password(pwd, hashed) is True
assert security.verify_password("WrongPassword", hashed) is False
token = security.create_access_token(42, "test@eduvault.io", "teacher", "Test Instructor")
payload = security.verify_access_token(token)
assert payload is not None and payload.get("sub") == "42"
print("  Argon2 Hash & Verify: OK")
print("  JWT Generation & Signature Decode: OK")

# 3. Auth API Login & /api/auth/me
print("\n[Test 3] User Authentication API (/api/auth/login & /api/auth/me)")
r_login = client.post("/api/auth/login", json={
    "email": "teacher@eduvault.io",
    "password": "password123"
})
assert r_login.status_code == 200
login_data = r_login.json()
jwt_token = login_data["token"]
print("  Login Successful. User:", login_data["user"]["full_name"], "Role:", login_data["user"]["role"])

r_me = client.get(f"/api/auth/me?token={jwt_token}")
assert r_me.status_code == 200
assert r_me.json()["email"] == "teacher@eduvault.io"
print("  JWT Profile Verified via /api/auth/me: OK (", r_me.json()["full_name"], ")")

# 4. Session Catch-Up & Continuity
print("\n[Test 4] Session Catch-Up Engine (/api/sessions/dsa-bt-live/catchup)")
r_catchup = client.get("/api/sessions/dsa-bt-live/catchup?user_id=student_demo")
assert r_catchup.status_code == 200
catchup = r_catchup.json()
print("  Session Title:", catchup["session_title"])
print("  Missed Duration:", catchup["missed_duration"])
print("  Missed Messages:", catchup["missed_messages_count"])
print("  Missed Instructions:", catchup["missed_instructions_count"])
print("  AI Catch-Up Summary:", catchup["ai_summary"]["title"] if catchup["ai_summary"] else "None")

# 5. Live Real-Time Chat Persistence
print("\n[Test 5] Live Chat Storage & Retrieval")
r_post_chat = client.post("/api/sessions/dsa-bt-live/chat", json={
    "session_id": "dsa-bt-live",
    "sender_name": "Alice Johnson",
    "sender_role": "student",
    "content": "Automated verification message through EduVault API.",
    "message_type": "text"
})
assert r_post_chat.status_code == 200
msg_id = r_post_chat.json().get("id")
print("  Saved Live Chat Message ID:", msg_id)

# 6. Multi-Provider AI Doubt Solver
print("\n[Test 6] Multi-Provider AI Engine (/api/ai/ask)")
r_ai = client.post("/api/ai/ask", json={
    "question": "What is the difference between an AVL tree and a Red-Black tree?",
    "context": "Data Structures & Algorithms Course"
})
assert r_ai.status_code == 200
ai_resp = r_ai.json()
print("  AI Provider Active:", ai_resp.get("provider"))
print("  Answer Preview:", ai_resp.get("answer")[:90] + "...")

# 7. Live Leaderboard Endpoint
print("\n[Test 7] Gamified Leaderboard API (/api/leaderboard)")
r_board = client.get("/api/leaderboard")
assert r_board.status_code == 200
print("  Leaderboard Records:", len(r_board.json()))

print("\n=================================================================")
print(" ALL 7 PRODUCTION BACKEND & SECURITY TESTS PASSED (100% HEALTHY)")
print("=================================================================")
