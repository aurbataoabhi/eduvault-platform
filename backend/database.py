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
            # Escape literal % characters before replacing ? with %s
            escaped_sql = sql.replace("%", "%%")
            pg_sql = escaped_sql.replace("?", "%s")
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
            escaped_sql = sql.replace("%", "%%")
            pg_sql = escaped_sql.replace("?", "%s")
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
        progress_pct INTEGER DEFAULT 0,
        drm_protected INTEGER DEFAULT 1,
        download_policy TEXT DEFAULT 'in_app_only',
        resolutions_json TEXT DEFAULT '["1080p", "720p", "480p", "360p"]',
        chapters_json TEXT
    );
    """)

    # Automated migrations for recordings table
    for col_sql in [
        "ALTER TABLE recordings ADD COLUMN drm_protected INTEGER DEFAULT 1;",
        "ALTER TABLE recordings ADD COLUMN download_policy TEXT DEFAULT 'in_app_only';",
        "ALTER TABLE recordings ADD COLUMN resolutions_json TEXT DEFAULT '[\"1080p\", \"720p\", \"480p\", \"360p\"]';",
        "ALTER TABLE recordings ADD COLUMN chapters_json TEXT;"
    ]:
        try:
            cursor.execute(col_sql)
            conn.commit()
        except Exception:
            try:
                conn.rollback()
            except Exception:
                pass

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
        difficulty TEXT DEFAULT 'Intermediate',
        questions_json TEXT
    );
    """)

    # 11. Student Submissions table
    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS student_submissions (
        id {id_primary_key},
        assessment_id TEXT NOT NULL,
        student_name TEXT NOT NULL,
        score INTEGER NOT NULL,
        total_marks INTEGER NOT NULL,
        percentage REAL NOT NULL,
        submitted_at TEXT NOT NULL,
        tab_switches INTEGER DEFAULT 0,
        time_spent_secs INTEGER DEFAULT 0,
        proctor_integrity TEXT DEFAULT '100% Clean'
    );
    """)

    # Migrations for student_submissions table
    for col_sql in [
        "ALTER TABLE student_submissions ADD COLUMN tab_switches INTEGER DEFAULT 0;",
        "ALTER TABLE student_submissions ADD COLUMN time_spent_secs INTEGER DEFAULT 0;",
        "ALTER TABLE student_submissions ADD COLUMN proctor_integrity TEXT DEFAULT '100% Clean';"
    ]:
        try:
            cursor.execute(col_sql)
            conn.commit()
        except Exception:
            try:
                conn.rollback()
            except Exception:
                pass

    # 12. Schedules table
    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS schedules (
        id {id_primary_key},
        title TEXT NOT NULL,
        instructor TEXT NOT NULL,
        date TEXT NOT NULL,
        time TEXT NOT NULL,
        duration TEXT DEFAULT '1.5 hrs',
        course_id TEXT,
        status TEXT DEFAULT 'upcoming',
        created_at TEXT NOT NULL
    );
    """)

    # 13. Enrollment Keys table (Company / Teacher Key Generation)
    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS enrollment_keys (
        id {id_primary_key},
        key_code TEXT UNIQUE NOT NULL,
        course_id TEXT NOT NULL REFERENCES courses(id),
        batch_name TEXT NOT NULL,
        created_by TEXT NOT NULL,
        max_uses INTEGER DEFAULT 50,
        current_uses INTEGER DEFAULT 0,
        permissions_json TEXT DEFAULT '["live", "recordings", "materials", "tests", "exercises"]',
        is_active INTEGER DEFAULT 1,
        created_at TEXT NOT NULL
    );
    """)

    # 14. Student Enrollments table (Verified Eligibility Binding)
    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS student_enrollments (
        id {id_primary_key},
        student_name TEXT NOT NULL,
        student_email TEXT NOT NULL,
        course_id TEXT NOT NULL,
        batch_name TEXT,
        key_code TEXT NOT NULL,
        permissions_json TEXT DEFAULT '["live", "recordings", "materials", "tests", "exercises"]',
        status TEXT DEFAULT 'active',
        enrolled_at TEXT NOT NULL
    );
    """)

    # 15. Whiteboard Strokes table (Interactive Synchronized Whiteboard)
    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS whiteboard_strokes (
        id {id_primary_key},
        session_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        user_role TEXT DEFAULT 'teacher',
        stroke_type TEXT DEFAULT 'stroke',
        stroke_data TEXT NOT NULL,
        created_at TEXT NOT NULL
    );
    """)

    # 16. Stream Settings table (Dual OBS RTMP & YouTube Live Ingest Engine)
    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS stream_settings (
        id {id_primary_key},
        user_id TEXT DEFAULT 'teacher_1',
        server_url TEXT NOT NULL DEFAULT 'rtmp://live.eduvault.io:1935/live',
        stream_key TEXT NOT NULL,
        youtube_rtmp_url TEXT DEFAULT 'rtmp://a.rtmp.youtube.com/live2',
        youtube_stream_key TEXT DEFAULT '',
        simulcast_enabled INTEGER DEFAULT 0,
        resolution TEXT DEFAULT '1080p60',
        video_bitrate TEXT DEFAULT '4500 kbps',
        audio_bitrate TEXT DEFAULT '160 kbps',
        status TEXT DEFAULT 'ready',
        ingest_fps INTEGER DEFAULT 60,
        ingest_bitrate_kbps INTEGER DEFAULT 4500,
        dropped_frames INTEGER DEFAULT 0,
        updated_at TEXT NOT NULL
    );
    """)

    # 17. Curriculum Modules / Topics Table (Hierarchical Curricula & Playlists)
    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS curriculum_modules (
        id {id_primary_key},
        course_id TEXT NOT NULL,
        title TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 1,
        description TEXT,
        is_expanded INTEGER DEFAULT 1,
        created_at TEXT NOT NULL
    );
    """)

    # 18. Curriculum Items / Lectures / Materials Table
    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS curriculum_items (
        id {id_primary_key},
        module_id INTEGER NOT NULL,
        course_id TEXT NOT NULL,
        title TEXT NOT NULL,
        item_type TEXT NOT NULL DEFAULT 'video',
        duration_or_size TEXT DEFAULT '30:00',
        content_ref TEXT,
        sort_order INTEGER NOT NULL DEFAULT 1,
        is_completed INTEGER DEFAULT 0,
        is_locked INTEGER DEFAULT 0,
        created_at TEXT NOT NULL
    );
    """)

    conn.commit()

    # Automated migration for existing student_enrollments schema
    try:
        cursor.execute("ALTER TABLE student_enrollments ADD COLUMN batch_name TEXT;")
        conn.commit()
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass

    try:
        cursor.execute("ALTER TABLE student_enrollments ADD COLUMN permissions_json TEXT;")
        conn.commit()
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass

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

    cursor.execute("SELECT COUNT(*) FROM users")
    if cursor.fetchone()[0] == 0:
        users = [
            ("teacher@eduvault.io", "password123", "Prof. Rajesh Sharma", "teacher", "Indian Institute of Technology", now_iso),
            ("student@eduvault.io", "password123", "Abhishek Dwivedi (Student)", "student", "Stanford CS Dept", now_iso),
            ("admin@eduvault.io", "password123", "Abhishek Dwivedi (CEO)", "teacher", "EduVault Technologies Inc.", now_iso)
        ]
        cursor.executemany("""
        INSERT INTO users (email, password, full_name, role, organization, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """, users)

    cursor.execute("SELECT COUNT(*) FROM courses")
    if cursor.fetchone()[0] == 0:
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

    cursor.execute("SELECT COUNT(*) FROM leaderboard")
    if cursor.fetchone()[0] == 0:
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

    cursor.execute("SELECT COUNT(*) FROM assessments")
    if cursor.fetchone()[0] == 0:
        assessments = [
            ("quiz-trees", "Binary Trees & BST Mastery Quiz", "Data Structures", 30, 50, 10, "Intermediate"),
            ("exam-midterm", "Midterm Examination — CS301", "Algorithms", 90, 100, 25, "Advanced"),
            ("hackathon-algo", "Speed Algorithm Challenge 2026", "Competitive Coding", 60, 150, 3, "Hard")
        ]
        cursor.executemany("""
        INSERT INTO assessments (id, title, subject, duration_mins, total_marks, questions_count, difficulty)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """, assessments)

    cursor.execute("SELECT COUNT(*) FROM schedules")
    sched_count = cursor.fetchone()[0]
    if sched_count == 0:
        schedules = [
            ("Data Structures — Binary Trees & Traversal", "Prof. Rajesh Sharma", "2026-09-26", "10:00 AM", "1.5 hrs", "course-dsa", "upcoming", now_iso),
            ("Machine Learning — Neural Network Architectures", "Prof. Rajesh Sharma", "2026-09-27", "02:00 PM", "1 hr", "course-ml", "upcoming", now_iso),
            ("Full-Stack Web — React High-Performance Hooks", "Prof. Rajesh Sharma", "2026-09-28", "05:30 PM", "2 hrs", "course-web", "upcoming", now_iso)
        ]
        cursor.executemany("""
        INSERT INTO schedules (title, instructor, date, time, duration, course_id, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, schedules)

    cursor.execute("SELECT COUNT(*) FROM enrollment_keys")
    keys_count = cursor.fetchone()[0]
    if keys_count == 0:
        enrollment_keys = [
            ("EDU-DSA-2026-ALPHA", "course-dsa", "DSA Autumn 2026 Honors Batch", "Prof. Rajesh Sharma", 50, 12, '["live", "recordings", "materials", "tests", "exercises"]', 1, now_iso),
            ("EDU-ML-NEURAL-PRO", "course-ml", "AI / Deep Learning Specialization", "Prof. Rajesh Sharma", 50, 8, '["live", "recordings", "materials", "tests", "exercises"]', 1, now_iso),
            ("EDU-FULLSTACK-WEB", "course-web", "Full-Stack Web Engineering Fellowship", "Prof. Rajesh Sharma", 100, 24, '["live", "recordings", "materials", "tests", "exercises"]', 1, now_iso),
            ("EDU-CYBER-SEC-VAULT", "course-sec", "Cybersecurity & DRM Cryptographic Vaults", "Prof. Rajesh Sharma", 30, 5, '["live", "recordings", "materials", "tests", "exercises"]', 1, now_iso)
        ]
        cursor.executemany("""
        INSERT INTO enrollment_keys (key_code, course_id, batch_name, created_by, max_uses, current_uses, permissions_json, is_active, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, enrollment_keys)

    cursor.execute("SELECT COUNT(*) FROM stream_settings")
    if cursor.fetchone()[0] == 0:
        cursor.execute("""
        INSERT INTO stream_settings (user_id, server_url, stream_key, youtube_rtmp_url, youtube_stream_key, simulcast_enabled, resolution, video_bitrate, audio_bitrate, status, ingest_fps, ingest_bitrate_kbps, dropped_frames, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, ('teacher_1', 'rtmp://live.eduvault.io:1935/live', 'edv_live_sec_7a8f9021e89b4f1c', 'rtmp://a.rtmp.youtube.com/live2', 'yt_live_eduvault_88321', 1, '1080p60', '4500 kbps', '160 kbps', 'ready', 60, 4500, 0, now_iso))

    cursor.execute("SELECT COUNT(*) FROM curriculum_modules")
    if cursor.fetchone()[0] == 0:
        # Modules for course-dsa
        modules = [
            ("course-dsa", "Module 1: Arrays & Strings", 1, "Array operations, two-pointer technique, sliding window, string algorithms", 1, now_iso),
            ("course-dsa", "Module 2: Linked Lists", 2, "Singly & Doubly linked lists, cycle detection, pointer manipulations", 1, now_iso),
            ("course-dsa", "Module 3: Binary Trees & BST", 3, "Hierarchical trees, recursive traversals, self-balancing search trees", 1, now_iso),
            ("course-dsa", "Module 4: Graphs & Dynamic Programming", 4, "BFS/DFS, Dijkstra, memoization and tabulation optimization", 0, now_iso)
        ]
        cursor.executemany("""
        INSERT INTO curriculum_modules (course_id, title, sort_order, description, is_expanded, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """, modules)

        # Retrieve generated module IDs
        cursor.execute("SELECT id, sort_order FROM curriculum_modules WHERE course_id = 'course-dsa' ORDER BY sort_order ASC")
        mod_rows = cursor.fetchall()
        mod_ids = {row[1]: row[0] for row in mod_rows}

        m1_id = mod_ids.get(1, 1)
        m2_id = mod_ids.get(2, 2)
        m3_id = mod_ids.get(3, 3)
        m4_id = mod_ids.get(4, 4)

        items = [
            # Module 1
            (m1_id, "course-dsa", "1.1 Introduction to Arrays & Memory Layout", "video", "32:15", "rec-dsa-bt-live", 1, 1, 0, now_iso),
            (m1_id, "course-dsa", "1.2 Array Operations & In-Place Reversals", "video", "45:30", "rec-dsa-bt-live", 2, 1, 0, now_iso),
            (m1_id, "course-dsa", "1.3 Two-Pointer Technique & Sliding Window", "video", "38:40", "rec-dsa-bt-live", 3, 1, 0, now_iso),
            (m1_id, "course-dsa", "1.4 String Matching & Substrings", "video", "28:10", "rec-dsa-bt-live", 4, 1, 0, now_iso),
            (m1_id, "course-dsa", "1.5 Practice Problems Sheet.pdf", "pdf", "2.4 MB", "doc-arrays-pdf", 5, 1, 0, now_iso),
            (m1_id, "course-dsa", "1.6 Quiz: Arrays & Strings Mastery", "quiz", "10 Qs • 15m", "quiz-trees", 6, 1, 0, now_iso),

            # Module 2
            (m2_id, "course-dsa", "2.1 Singly Linked Lists & Reversals", "video", "41:20", "rec-dsa-bt-live", 1, 1, 0, now_iso),
            (m2_id, "course-dsa", "2.2 Doubly Linked Lists & Sentinel Nodes", "video", "35:10", "rec-dsa-bt-live", 2, 1, 0, now_iso),
            (m2_id, "course-dsa", "2.3 Floyd's Cycle-Finding Algorithm", "video", "29:45", "rec-dsa-bt-live", 3, 1, 0, now_iso),
            (m2_id, "course-dsa", "2.4 Linked Lists Coding Lab", "exercise", "4 Challenges", "lab-ll", 4, 0, 0, now_iso),

            # Module 3
            (m3_id, "course-dsa", "3.1 Binary Tree Foundations & Node Pointers", "video", "50:15", "rec-dsa-bt-live", 1, 1, 0, now_iso),
            (m3_id, "course-dsa", "3.2 Tree Traversals (Inorder, Preorder, Postorder)", "video", "44:00", "rec-dsa-bt-live", 2, 1, 0, now_iso),
            (m3_id, "course-dsa", "3.3 Binary Search Trees (BST) Insertion & Deletion", "video", "48:30", "rec-dsa-bt-live", 3, 0, 0, now_iso),
            (m3_id, "course-dsa", "3.4 Self-Balancing AVL & Red-Black Trees", "video", "52:10", "rec-dsa-bt-live", 4, 0, 0, now_iso),
            (m3_id, "course-dsa", "3.5 Binary Trees & BST Mastery Quiz", "quiz", "10 Qs • 30m", "quiz-trees", 5, 0, 0, now_iso),

            # Module 4
            (m4_id, "course-dsa", "4.1 Graph Representations & Adjacency Lists", "video", "36:00", "rec-dsa-bt-live", 1, 0, 1, now_iso),
            (m4_id, "course-dsa", "4.2 BFS & DFS Traversal Patterns", "video", "42:15", "rec-dsa-bt-live", 2, 0, 1, now_iso),
            (m4_id, "course-dsa", "4.3 Memoization vs Tabulation Foundations", "video", "55:00", "rec-dsa-bt-live", 3, 0, 1, now_iso),
            (m4_id, "course-dsa", "4.4 Dijkstra's Shortest Path Algorithm", "video", "47:20", "rec-dsa-bt-live", 4, 0, 1, now_iso)
        ]
        cursor.executemany("""
        INSERT INTO curriculum_items (module_id, course_id, title, item_type, duration_or_size, content_ref, sort_order, is_completed, is_locked, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, items)




