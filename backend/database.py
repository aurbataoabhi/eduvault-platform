"""
EduVault Platform — Production Database Engine
Unified PostgreSQL (Primary Cloud) with SQLite Fallback & Automated Schema Migrations
"""
import os
import sys
import json
import sqlite3
import re
from datetime import datetime

# Render PostgreSQL Internal / External Database URLs
DEFAULT_PG_INTERNAL = "postgresql://eduvault_8337_user:Jj1axGm16N4veGElP4kOmrVuWgQbMElW@dpg-darc6uhsrm7s73e0djfg-a/eduvault_8337"
DEFAULT_PG_EXTERNAL = "postgresql://eduvault_8337_user:Jj1axGm16N4veGElP4kOmrVuWgQbMElW@dpg-darc6uhsrm7s73e0djfg-a.oregon-postgres.render.com/eduvault_8337"

DATABASE_URL = os.environ.get("DATABASE_URL", DEFAULT_PG_INTERNAL)
DB_PATH = os.path.join(os.path.dirname(__file__), "eduvault.db")

try:
    import psycopg2
    import psycopg2.extras
    PSYCOPG2_AVAILABLE = True
except ImportError:
    PSYCOPG2_AVAILABLE = False

ACTIVE_DB_TYPE = "SQLite (Local Ephemeral)"

# =====================================================================
# UNIFIED ROW & CURSOR WRAPPER FOR POSTGRESQL & SQLITE COMPATIBILITY
# =====================================================================
class UnifiedRow:
    """Wrapper that provides dict indexing row['col'], tuple indexing row[0], and .get()"""
    def __init__(self, data_dict, tuple_data):
        self._dict = dict(data_dict)
        self._tuple = tuple(tuple_data)

    def __getitem__(self, key):
        if isinstance(key, int):
            return self._tuple[key]
        return self._dict.get(key)

    def get(self, key, default=None):
        return self._dict.get(key, default)

    def keys(self):
        return self._dict.keys()

    def values(self):
        return self._dict.values()

    def items(self):
        return self._dict.items()

    def __iter__(self):
        return iter(self._tuple)

    def __contains__(self, key):
        return key in self._dict

class UnifiedCursor:
    def __init__(self, raw_cursor, is_pg=False):
        self._cur = raw_cursor
        self._is_pg = is_pg
        self.lastrowid = None

    def execute(self, sql, params=None):
        params = params or ()
        if self._is_pg:
            # PostgreSQL uses %s placeholders instead of ?
            pg_sql = sql.replace("?", "%s")
            # Replace SQLite AUTOINCREMENT with SERIAL / ON CONFLICT
            pg_sql = pg_sql.replace("INSERT OR IGNORE", "INSERT")
            if "INSERT INTO" in sql and "ON CONFLICT" not in pg_sql:
                # Add conflict handling for primary keys where applicable
                if "users (" in pg_sql:
                    pg_sql += " ON CONFLICT (email) DO NOTHING"
                elif "courses (" in pg_sql or "assessments (" in pg_sql or "recordings (" in pg_sql or "ai_summaries (" in pg_sql:
                    pg_sql += " ON CONFLICT (id) DO NOTHING"
            
            res = self._cur.execute(pg_sql, params)
            try:
                if "INSERT INTO" in sql:
                    self._cur.execute("SELECT LASTVAL();")
                    lastval = self._cur.fetchone()
                    if lastval:
                        self.lastrowid = lastval[0]
            except Exception:
                pass
            return res
        else:
            res = self._cur.execute(sql, params)
            self.lastrowid = getattr(self._cur, 'lastrowid', None)
            return res

    def executemany(self, sql, seq_of_params):
        if self._is_pg:
            pg_sql = sql.replace("?", "%s")
            pg_sql = pg_sql.replace("INSERT OR IGNORE", "INSERT")
            if "INSERT INTO" in sql and "ON CONFLICT" not in pg_sql:
                if "users (" in pg_sql:
                    pg_sql += " ON CONFLICT (email) DO NOTHING"
                elif "courses (" in pg_sql or "assessments (" in pg_sql or "recordings (" in pg_sql:
                    pg_sql += " ON CONFLICT (id) DO NOTHING"
            return self._cur.executemany(pg_sql, seq_of_params)
        else:
            return self._cur.executemany(sql, seq_of_params)

    def fetchone(self):
        row = self._cur.fetchone()
        if not row:
            return None
        if self._is_pg:
            col_names = [desc[0] for desc in self._cur.description]
            return UnifiedRow(dict(zip(col_names, row)), row)
        return row

    def fetchall(self):
        rows = self._cur.fetchall()
        if not rows:
            return []
        if self._is_pg:
            col_names = [desc[0] for desc in self._cur.description]
            return [UnifiedRow(dict(zip(col_names, r)), r) for r in rows]
        return rows

    def close(self):
        self._cur.close()

class UnifiedConnection:
    def __init__(self, raw_conn, is_pg=False):
        self._conn = raw_conn
        self._is_pg = is_pg

    def cursor(self):
        return UnifiedCursor(self._conn.cursor(), is_pg=self._is_pg)

    def commit(self):
        self._conn.commit()

    def rollback(self):
        self._conn.rollback()

    def close(self):
        self._conn.close()

    def execute(self, sql, params=None):
        cur = self.cursor()
        cur.execute(sql, params)
        return cur

# =====================================================================
# DATABASE CONNECTION FACTORY
# =====================================================================
def get_db():
    global ACTIVE_DB_TYPE

    # Try PostgreSQL first
    if PSYCOPG2_AVAILABLE and DATABASE_URL:
        # First attempt: Direct DATABASE_URL
        for target_url in [DATABASE_URL, DEFAULT_PG_EXTERNAL]:
            try:
                pg_conn = psycopg2.connect(target_url, connect_timeout=5)
                ACTIVE_DB_TYPE = "PostgreSQL 18 (Render Cloud: eduvault_8337)"
                return UnifiedConnection(pg_conn, is_pg=True)
            except Exception:
                continue

    # Fallback to high-performance local SQLite (WAL Mode)
    conn = sqlite3.connect(DB_PATH, check_same_thread=False, timeout=10.0)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA journal_mode = WAL;")
        conn.execute("PRAGMA synchronous = NORMAL;")
        conn.execute("PRAGMA busy_timeout = 5000;")
        conn.execute("PRAGMA foreign_keys = ON;")
    except Exception:
        pass
    ACTIVE_DB_TYPE = "SQLite (Local Wal Mode)"
    return UnifiedConnection(conn, is_pg=False)

def get_active_db_type():
    return ACTIVE_DB_TYPE

# =====================================================================
# SCHEMA INITIALIZATION & AUTOMATED MIGRATIONS
# =====================================================================
def init_db():
    conn = get_db()
    cursor = conn.cursor()

    is_pg = conn._is_pg
    id_primary_key = "SERIAL PRIMARY KEY" if is_pg else "INTEGER PRIMARY KEY AUTOINCREMENT"

    # 1. Users table
    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS users (
        id {id_primary_key},
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        full_name TEXT NOT NULL,
        role TEXT NOT NULL,
        organization TEXT,
        created_at TEXT NOT NULL
    );
    """)

    # 2. Sessions table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        instructor TEXT NOT NULL,
        course_category TEXT NOT NULL,
        status TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT,
        duration TEXT,
        live_attendees INTEGER DEFAULT 0,
        missed_start_time TEXT,
        missed_end_time TEXT,
        missed_duration_desc TEXT
    );
    """)

    # 3. Chat Messages table
    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS chat_messages (
        id {id_primary_key},
        session_id TEXT NOT NULL REFERENCES sessions(id),
        sender_name TEXT NOT NULL,
        sender_role TEXT NOT NULL,
        message_type TEXT NOT NULL DEFAULT 'text',
        content TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        time_display TEXT NOT NULL,
        is_missed INTEGER DEFAULT 0
    );
    """)

    # 4. Instructions & Announcements table
    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS instructions (
        id {id_primary_key},
        session_id TEXT NOT NULL REFERENCES sessions(id),
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        time_display TEXT NOT NULL,
        video_timestamp TEXT,
        instructor TEXT NOT NULL,
        resource_json TEXT
    );
    """)

    # 5. Recordings table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS recordings (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES sessions(id),
        title TEXT NOT NULL,
        instructor TEXT NOT NULL,
        duration TEXT NOT NULL,
        quality TEXT DEFAULT 'HD 1080p',
        recorded_date TEXT NOT NULL,
        video_url TEXT,
        gradient_style TEXT,
        progress_pct INTEGER DEFAULT 0
    );
    """)

    # 6. User Attendance & Outage Audit Log table
    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS user_attendance (
        id {id_primary_key},
        user_id TEXT NOT NULL,
        session_id TEXT NOT NULL REFERENCES sessions(id),
        joined_at TEXT NOT NULL,
        disconnected_at TEXT,
        reconnected_at TEXT,
        status TEXT NOT NULL,
        last_heartbeat TEXT NOT NULL
    );
    """)

    # 7. AI Catch-Up Summaries table
    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS ai_summaries (
        id {id_primary_key},
        session_id TEXT UNIQUE NOT NULL REFERENCES sessions(id),
        summary_title TEXT NOT NULL,
        missed_window_text TEXT,
        missed_points_json TEXT NOT NULL,
        topic_modules_json TEXT NOT NULL,
        key_takeaways_json TEXT NOT NULL,
        created_at TEXT NOT NULL
    );
    """)

    # 8. Courses & DRM Content Vault
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS courses (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        instructor TEXT NOT NULL,
        category TEXT NOT NULL,
        lessons_count INTEGER DEFAULT 12,
        enrolled_count INTEGER DEFAULT 1420,
        rating REAL DEFAULT 4.9,
        drm_protected INTEGER DEFAULT 1,
        banner_gradient TEXT
    );
    """)

    # 9. Leaderboard table
    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS leaderboard (
        id {id_primary_key},
        student_name TEXT NOT NULL,
        points INTEGER NOT NULL,
        rank INTEGER NOT NULL,
        streak_days INTEGER DEFAULT 5,
        badge_name TEXT,
        avatar_initials TEXT
    );
    """)

    # 10. Assessments table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS assessments (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        subject TEXT NOT NULL,
        duration_mins INTEGER DEFAULT 45,
        total_marks INTEGER DEFAULT 100,
        questions_count INTEGER DEFAULT 10,
        difficulty TEXT DEFAULT 'Intermediate'
    );
    """)

    conn.commit()
    seed_data(conn)
    conn.close()

# =====================================================================
# DATA SEEDING (POPULATES PRODUCTION DATA IF EMPTY)
# =====================================================================
def seed_data(conn):
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM sessions")
    row = cursor.fetchone()
    if row and row[0] > 0:
        cursor.execute("SELECT COUNT(*) FROM users")
        user_row = cursor.fetchone()
        if user_row and user_row[0] == 0:
            seed_additional_tables(cursor)
            conn.commit()
        return

    now = datetime.now()
    today_str = now.strftime("%b %d, %Y")

    sessions = [
        ("dsa-bt-live", "Data Structures — Binary Trees", "Prof. Sharma", "dsa", "live", f"{today_str} 10:00 AM", None, "00:47:23", 45, "10:33 AM", "10:45 AM", "12 minutes"),
        ("ml-nn", "Machine Learning — Neural Network Architectures", "Prof. Sharma", "ml", "completed", "Sep 24, 2026 02:00 PM", "Sep 24, 2026 03:32 PM", "1:32:18", 58, None, None, None),
        ("dsa-graph", "Data Structures — Graph Traversal Algorithms", "Prof. Sharma", "dsa", "completed", "Sep 23, 2026 11:00 AM", "Sep 23, 2026 12:15 PM", "1:15:42", 42, "11:00 AM", "12:15 PM", "Entire session (Power outage)"),
        ("web-react", "Web Development — React Advanced Patterns", "Prof. Sharma", "webdev", "completed", "Sep 22, 2026 09:00 AM", "Sep 22, 2026 11:05 AM", "2:05:10", 35, "09:45 AM", "10:15 AM", "30 minutes"),
        ("dsa-sort", "DSA — Sorting Algorithms Deep Dive", "Prof. Sharma", "dsa", "completed", "Sep 20, 2026 10:00 AM", "Sep 20, 2026 11:48 AM", "1:48:55", 48, None, None, None)
    ]
    cursor.executemany("""
    INSERT INTO sessions (id, title, instructor, course_category, status, start_time, end_time, duration, live_attendees, missed_start_time, missed_end_time, missed_duration_desc)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, sessions)

    dsa_chat = [
        ("dsa-bt-live", "Prof. Sharma", "teacher", "text", "Welcome to today's lecture on Binary Trees! Let's get started.", f"{today_str} 10:00:00", "10:00 AM", 0),
        ("dsa-bt-live", "Alice Johnson", "student", "text", "Excited for this topic! 🎉", f"{today_str} 10:01:15", "10:01 AM", 0),
        ("dsa-bt-live", "Bob Smith", "student", "text", "Can you explain the difference between BST and AVL trees?", f"{today_str} 10:03:00", "10:03 AM", 0),
        ("dsa-bt-live", "System", "system", "system", "Bob Smith raised hand", f"{today_str} 10:03:30", "10:03 AM", 0),
        ("dsa-bt-live", "Prof. Sharma", "teacher", "text", "Great question Bob! We'll cover that in the second half. For now, let's focus on basic tree operations.", f"{today_str} 10:04:10", "10:04 AM", 0),
        ("dsa-bt-live", "Prof. Sharma", "teacher", "instruction", "📌 Please open the 'Binary Trees - Lecture Notes.pdf' from the Files tab and follow along. We'll start with tree terminology: root, parent, child, leaf, height, and depth.", f"{today_str} 10:06:00", "10:06 AM", 0),
        ("dsa-bt-live", "Eve Rodriguez", "student", "text", "Is height and depth the same thing?", f"{today_str} 10:08:20", "10:08 AM", 0),
        ("dsa-bt-live", "Prof. Sharma", "teacher", "text", "No! Height is measured from a node downward to the farthest leaf. Depth is measured from the root downward to a specific node. They go in opposite directions.", f"{today_str} 10:09:00", "10:09 AM", 0),
        ("dsa-bt-live", "Prof. Sharma", "teacher", "text", "Now let's look at Binary Search Tree (BST) properties. Key rule: left subtree has smaller values, right subtree has larger values.", f"{today_str} 10:35:00", "10:35 AM", 1),
        ("dsa-bt-live", "Prof. Sharma", "teacher", "instruction", "📌 Try implementing BST insertion on your own. Use the code template from the shared files. I'll walk through the solution in 10 minutes.", f"{today_str} 10:38:00", "10:38 AM", 1),
        ("dsa-bt-live", "Alice Johnson", "student", "text", "For the insertion, do we handle duplicate values?", f"{today_str} 10:40:10", "10:40 AM", 1),
        ("dsa-bt-live", "Prof. Sharma", "teacher", "text", "Good point Alice! Standard BSTs don't allow duplicates. You can either ignore them or place them in the right subtree — your design choice.", f"{today_str} 10:41:00", "10:41 AM", 1),
        ("dsa-bt-live", "System", "system", "quiz", "Quick Quiz launched: 'What is the time complexity of BST search?' — Winner: Alice Johnson (3.2s)", f"{today_str} 10:42:30", "10:42 AM", 1),
        ("dsa-bt-live", "Prof. Sharma", "teacher", "text", "Let's now move on to tree traversal methods: Inorder, Preorder, and Postorder.", f"{today_str} 10:46:00", "10:46 AM", 0),
        ("dsa-bt-live", "David Lee", "student", "text", "Inorder traversal of BST gives elements in sorted order, right?", f"{today_str} 10:48:00", "10:48 AM", 0),
        ("dsa-bt-live", "Prof. Sharma", "teacher", "text", "Exactly right David! Inorder (Left, Root, Right) always produces non-decreasing order for BST.", f"{today_str} 10:49:10", "10:49 AM", 0)
    ]
    cursor.executemany("""
    INSERT INTO chat_messages (session_id, sender_name, sender_role, message_type, content, timestamp, time_display, is_missed)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, dsa_chat)

    recordings = [
        ("rec-dsa-bt-live", "dsa-bt-live", "Data Structures — Binary Trees", "Prof. Sharma", "00:47:23", "HD 1080p", today_str, "/assets/videos/dsa_trees.mp4", "linear-gradient(135deg, #6366F1, #8B5CF6, #06B6D4)", 40),
        ("rec-ml-nn", "ml-nn", "Machine Learning — Neural Network Architectures", "Prof. Sharma", "1:32:18", "HD 1080p", "Sep 24, 2026", "/assets/videos/ml_nn.mp4", "linear-gradient(135deg, #8B5CF6, #EC4899)", 0),
        ("rec-dsa-graph", "dsa-graph", "Data Structures — Graph Traversal Algorithms", "Prof. Sharma", "1:15:42", "HD 1080p", "Sep 23, 2026", "/assets/videos/dsa_graph.mp4", "linear-gradient(135deg, #06B6D4, #3B82F6)", 0),
        ("rec-web-react", "web-react", "Web Development — React Advanced Patterns", "Prof. Sharma", "2:05:10", "HD 1080p", "Sep 22, 2026", "/assets/videos/web_react.mp4", "linear-gradient(135deg, #F59E0B, #F43F5E)", 45),
        ("rec-dsa-sort", "dsa-sort", "DSA — Sorting Algorithms Deep Dive", "Prof. Sharma", "1:48:55", "HD 1080p", "Sep 20, 2026", "/assets/videos/dsa_sort.mp4", "linear-gradient(135deg, #10B981, #06B6D4)", 100)
    ]
    cursor.executemany("""
    INSERT INTO recordings (id, session_id, title, instructor, duration, quality, recorded_date, video_url, gradient_style, progress_pct)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, recordings)

    seed_additional_tables(cursor)
    conn.commit()

def seed_additional_tables(cursor):
    now_iso = datetime.now().isoformat()

    users = [
        ("teacher@eduvault.io", "password123", "Prof. Rajesh Sharma", "teacher", "Indian Institute of Technology", now_iso),
        ("student@eduvault.io", "password123", "Abhishek Dwivedi (Student)", "student", "Stanford CS Dept", now_iso),
        ("admin@eduvault.io", "password123", "Abhishek Dwivedi (CEO)", "teacher", "EduVault Technologies Inc.", now_iso)
    ]
    cursor.executemany("""
    INSERT INTO users (email, password, full_name, role, organization, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
    """, users)

    courses = [
        ("course-dsa", "Advanced Data Structures & Algorithms", "Prof. Rajesh Sharma", "Computer Science", 24, 1850, 4.95, 1, "linear-gradient(135deg, #6366F1, #8B5CF6)"),
        ("course-ml", "Deep Learning & Neural Architectures", "Prof. Rajesh Sharma", "Artificial Intelligence", 18, 1420, 4.90, 1, "linear-gradient(135deg, #8B5CF6, #06B6D4)"),
        ("course-web", "Full-Stack Web Systems & High Concurrency", "Prof. Rajesh Sharma", "Engineering", 32, 2190, 4.88, 1, "linear-gradient(135deg, #06B6D4, #10B981)"),
        ("course-sec", "Cybersecurity & DRM Cryptographic Vaults", "Prof. Rajesh Sharma", "Security", 14, 980, 4.98, 1, "linear-gradient(135deg, #F43F5E, #FB923C)")
    ]
    cursor.executemany("""
    INSERT INTO courses (id, title, instructor, category, lessons_count, enrolled_count, rating, drm_protected, banner_gradient)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, courses)

    leaderboard = [
        ("Abhishek Dwivedi", 2850, 1, 14, "Grandmaster", "AD"),
        ("Alice Johnson", 2720, 2, 11, "Algorithm Master", "AJ"),
        ("Bob Smith", 2490, 3, 9, "Problem Solver", "BS"),
        ("Eve Rodriguez", 2340, 4, 8, "Code Ninja", "ER"),
        ("David Lee", 2180, 5, 6, "Rising Star", "DL"),
        ("Sophia Patel", 2050, 6, 7, "Consistent Learner", "SP")
    ]
    cursor.executemany("""
    INSERT INTO leaderboard (student_name, points, rank, streak_days, badge_name, avatar_initials)
    VALUES (?, ?, ?, ?, ?, ?)
    """, leaderboard)

    assessments = [
        ("quiz-trees", "Binary Trees & BST Mastery Quiz", "Data Structures", 30, 50, 10, "Intermediate"),
        ("exam-midterm", "Midterm Examination — CS301", "Algorithms", 90, 100, 25, "Advanced"),
        ("hackathon-algo", "Speed Algorithm Challenge 2026", "Competitive Coding", 60, 150, 3, "Hard")
    ]
    cursor.executemany("""
    INSERT INTO assessments (id, title, subject, duration_mins, total_marks, questions_count, difficulty)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    """, assessments)
