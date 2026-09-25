import os
import hmac
import hashlib
import base64
import json
import time
from typing import Optional, Dict, Any
from dotenv import load_dotenv

load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY", "eduvault-enterprise-production-super-secret-key-2026")
TOKEN_EXPIRY_SECONDS = int(os.getenv("TOKEN_EXPIRY_SECONDS", str(7 * 24 * 3600))) # 7 days

# Try using argon2 for password hashing, fallback to PBKDF2-HMAC-SHA256
try:
    from argon2 import PasswordHasher
    from argon2.exceptions import VerifyMismatchError
    _ph = PasswordHasher()
    HASHER_TYPE = "argon2"
except ImportError:
    _ph = None
    HASHER_TYPE = "pbkdf2"

def hash_password(password: str) -> str:
    """Hashes a password using Argon2id or salted PBKDF2-SHA256."""
    if _ph:
        return _ph.hash(password)
    
    # Standard NIST PBKDF2-HMAC-SHA256 fallback
    salt = os.urandom(16)
    kdf = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, 100000)
    return f"pbkdf2_sha256$100000${salt.hex()}${kdf.hex()}"

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifies a plain password against an Argon2 or PBKDF2 hash, or demo password."""
    if not hashed_password:
        return False
        
    # Support development demo fallback
    if hashed_password == "password123" and plain_password == "password123":
        return True

    if hashed_password.startswith("$argon2"):
        if _ph:
            try:
                return _ph.verify(hashed_password, plain_password)
            except Exception:
                return False
        return False

    if hashed_password.startswith("pbkdf2_sha256$"):
        parts = hashed_password.split("$")
        if len(parts) == 4:
            iterations = int(parts[1])
            salt = bytes.fromhex(parts[2])
            expected_kdf = bytes.fromhex(parts[3])
            actual_kdf = hashlib.pbkdf2_hmac('sha256', plain_password.encode('utf-8'), salt, iterations)
            return hmac.compare_digest(actual_kdf, expected_kdf)

    # Legacy plain fallback for existing mock database entries
    return plain_password == hashed_password

def create_access_token(user_id: int, email: str, role: str, full_name: str) -> str:
    """Creates a cryptographically signed HMAC-SHA256 JWT-compatible access token."""
    header = {"alg": "HS256", "typ": "JWT"}
    now = int(time.time())
    payload = {
        "sub": str(user_id),
        "email": email,
        "role": role,
        "name": full_name,
        "iat": now,
        "exp": now + TOKEN_EXPIRY_SECONDS
    }

    b64_header = base64.urlsafe_b64encode(json.dumps(header).encode()).decode().rstrip("=")
    b64_payload = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")
    signature = hmac.new(SECRET_KEY.encode(), f"{b64_header}.{b64_payload}".encode(), hashlib.sha256).digest()
    b64_sig = base64.urlsafe_b64encode(signature).decode().rstrip("=")

    return f"{b64_header}.{b64_payload}.{b64_sig}"

def verify_access_token(token: str) -> Optional[Dict[str, Any]]:
    """Verifies cryptographic signature and expiration of an access token."""
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        
        b64_header, b64_payload, b64_sig = parts
        
        # Verify signature
        expected_sig = hmac.new(SECRET_KEY.encode(), f"{b64_header}.{b64_payload}".encode(), hashlib.sha256).digest()
        actual_sig = base64.urlsafe_b64decode(b64_sig + "=" * (-len(b64_sig) % 4))
        
        if not hmac.compare_digest(expected_sig, actual_sig):
            return None

        # Verify expiration
        payload_bytes = base64.urlsafe_b64decode(b64_payload + "=" * (-len(b64_payload) % 4))
        payload = json.loads(payload_bytes.decode())
        
        if payload.get("exp") and time.time() > payload["exp"]:
            return None

        return payload
    except Exception:
        return None
