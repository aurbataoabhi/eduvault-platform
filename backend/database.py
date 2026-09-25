import sqlite3
import os
import json
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(__file__), "eduvault.db")

def get_db():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False, timeout=10.0)
    conn.row_factory = sqlite3.Row
    # High-concurrency production Pragmas (WAL mode allows concurrent readers and writer)
    try:
        conn.execute("PRAGMA journal_mode = WAL;")
        conn.execute("PRAGMA synchronous = NORMAL;")
        conn.execute("PRAGMA busy_timeout = 5000;")
        conn.execute("PRAGMA foreign_keys = ON;")
    except Exception:
        pass
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()

    # Users table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        full_name TEXT NOT NULL,
        role TEXT NOT NULL, -- 'teacher' or 'student'
        organization TEXT,
        created_at TEXT NOT NULL
    )
    """)

    # Sessions table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        instructor TEXT NOT NULL,
        course_category TEXT NOT NULL,
        status TEXT NOT NULL, -- 'live', 'completed', 'scheduled'
        start_time TEXT NOT NULL,
        end_time TEXT,
        duration TEXT,
        live_attendees INTEGER DEFAULT 0,
        missed_start_time TEXT,
        missed_end_time TEXT,
        missed_duration_desc TEXT
    )
    """)

    # Chat Messages table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        sender_name TEXT NOT NULL,
        sender_role TEXT NOT NULL, -- 'teacher', 'student', 'system'
        message_type TEXT NOT NULL DEFAULT 'text', -- 'text', 'instruction', 'system', 'quiz', 'disconnect_marker'
        content TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        time_display TEXT NOT NULL,
        is_missed INTEGER DEFAULT 0,
        FOREIGN KEY (session_id) REFERENCES sessions(id)
    )
    """)

    # Instructions & Announcements table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS instructions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        type TEXT NOT NULL, -- 'instruction', 'assignment', 'resource', 'announcement'
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        time_display TEXT NOT NULL,
        video_timestamp TEXT,
        instructor TEXT NOT NULL,
        resource_json TEXT,
        FOREIGN KEY (session_id) REFERENCES sessions(id)
    )
    """)

    # Recordings table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS recordings (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        title TEXT NOT NULL,
        instructor TEXT NOT NULL,
        duration TEXT NOT NULL,
        quality TEXT DEFAULT 'HD 1080p',
        recorded_date TEXT NOT NULL,
        video_url TEXT,
        gradient_style TEXT,
        progress_pct INTEGER DEFAULT 0,
        FOREIGN KEY (session_id) REFERENCES sessions(id)
    )
    """)

    # User Attendance & Connection Log table (tracks disconnects/reconnects)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS user_attendance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        joined_at TEXT NOT NULL,
        disconnected_at TEXT,
        reconnected_at TEXT,
        status TEXT NOT NULL, -- 'connected', 'disconnected', 'reconnected'
        last_heartbeat TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id)
    )
    """)

    # AI Catch-Up Summaries table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS ai_summaries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT UNIQUE NOT NULL,
        summary_title TEXT NOT NULL,
        missed_window_text TEXT,
        missed_points_json TEXT NOT NULL,
        topic_modules_json TEXT NOT NULL,
        key_takeaways_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id)
    )
    """)

    # Courses & DRM Content table
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
    )
    """)

    # Leaderboard table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS leaderboard (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_name TEXT NOT NULL,
        points INTEGER NOT NULL,
        rank INTEGER NOT NULL,
        streak_days INTEGER DEFAULT 5,
        badge_name TEXT,
        avatar_initials TEXT
    )
    """)

    # Assessments table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS assessments (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        subject TEXT NOT NULL,
        duration_mins INTEGER DEFAULT 45,
        total_marks INTEGER DEFAULT 100,
        questions_count INTEGER DEFAULT 10,
        difficulty TEXT DEFAULT 'Intermediate'
    )
    """)

    conn.commit()
    seed_data(conn)
    conn.close()

def seed_data(conn):
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM sessions")
    if cursor.fetchone()[0] > 0:
        # If sessions already exist, ensure the new tables (users, courses, leaderboard, assessments) are populated if empty
        cursor.execute("SELECT COUNT(*) FROM users")
        if cursor.fetchone()[0] == 0:
            seed_additional_tables(cursor)
            conn.commit()
        return

    now = datetime.now()
    today_str = now.strftime("%b %d, %Y")

    # 1. Sessions Seed
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

    # 2. Chat Messages for dsa-bt-live
    dsa_chat = [
        ("dsa-bt-live", "Prof. Sharma", "teacher", "text", "Welcome to today's lecture on Binary Trees! Let's get started.", f"{today_str} 10:00:00", "10:00 AM", 0),
        ("dsa-bt-live", "Alice Johnson", "student", "text", "Excited for this topic! 🎉", f"{today_str} 10:01:15", "10:01 AM", 0),
        ("dsa-bt-live", "Bob Smith", "student", "text", "Can you explain the difference between BST and AVL trees?", f"{today_str} 10:03:00", "10:03 AM", 0),
        ("dsa-bt-live", "System", "system", "system", "Bob Smith raised hand", f"{today_str} 10:03:30", "10:03 AM", 0),
        ("dsa-bt-live", "Prof. Sharma", "teacher", "text", "Great question Bob! We'll cover that in the second half. For now, let's focus on basic tree operations.", f"{today_str} 10:04:10", "10:04 AM", 0),
        ("dsa-bt-live", "Prof. Sharma", "teacher", "instruction", "📌 Please open the 'Binary Trees - Lecture Notes.pdf' from the Files tab and follow along. We'll start with tree terminology: root, parent, child, leaf, height, and depth.", f"{today_str} 10:06:00", "10:06 AM", 0),
        ("dsa-bt-live", "Eve Rodriguez", "student", "text", "Is height and depth the same thing?", f"{today_str} 10:08:20", "10:08 AM", 0),
        ("dsa-bt-live", "Prof. Sharma", "teacher", "text", "No! Height is measured from a node downward to the farthest leaf. Depth is measured from the root downward to a specific node. They go in opposite directions.", f"{today_str} 10:09:00", "10:09 AM", 0),
        # Disconnect occurred here (10:33 AM)
        ("dsa-bt-live", "Prof. Sharma", "teacher", "text", "Now let's look at Binary Search Tree (BST) properties. Key rule: left subtree has smaller values, right subtree has larger values.", f"{today_str} 10:35:00", "10:35 AM", 1),
        ("dsa-bt-live", "Prof. Sharma", "teacher", "instruction", "📌 Try implementing BST insertion on your own. Use the code template from the shared files. I'll walk through the solution in 10 minutes.", f"{today_str} 10:38:00", "10:38 AM", 1),
        ("dsa-bt-live", "Alice Johnson", "student", "text", "For the insertion, do we handle duplicate values?", f"{today_str} 10:40:10", "10:40 AM", 1),
        ("dsa-bt-live", "Prof. Sharma", "teacher", "text", "Good point Alice! Standard BSTs don't allow duplicates. You can either ignore them or place them in the right subtree — your design choice.", f"{today_str} 10:41:00", "10:41 AM", 1),
        ("dsa-bt-live", "System", "system", "quiz", "Quick Quiz launched: 'What is the time complexity of BST search?' — Winner: Alice Johnson (3.2s)", f"{today_str} 10:42:30", "10:42 AM", 1),
        # Reconnected here (10:45 AM)
        ("dsa-bt-live", "Prof. Sharma", "teacher", "text", "Let's now move on to tree traversal methods: Inorder, Preorder, and Postorder.", f"{today_str} 10:46:00", "10:46 AM", 0),
        ("dsa-bt-live", "David Lee", "student", "text", "Inorder traversal of BST gives elements in sorted order, right?", f"{today_str} 10:48:00", "10:48 AM", 0),
        ("dsa-bt-live", "Prof. Sharma", "teacher", "text", "Exactly right David! Inorder (Left, Root, Right) always produces non-decreasing order for BST.", f"{today_str} 10:49:10", "10:49 AM", 0)
    ]
    cursor.executemany("""
    INSERT INTO chat_messages (session_id, sender_name, sender_role, message_type, content, timestamp, time_display, is_missed)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, dsa_chat)

    # 3. Instructions Seed
    instructions = [
        ("dsa-bt-live", "instruction", "Open Lecture Notes", "📌 Please open the 'Binary Trees - Lecture Notes.pdf' from the Files tab and follow along. We'll start with tree terminology: root, parent, child, leaf, height, and depth.", f"{today_str} 10:06:00", "10:06 AM", "00:06:00", "Prof. Sharma", None),
        ("dsa-bt-live", "resource", "Shared Code & PDF", "Shared Lecture Notes and Implementation Starter code.", f"{today_str} 10:15:00", "10:15 AM", "00:15:00", "Prof. Sharma", json.dumps([{"name": "Binary Trees - Lecture Notes.pdf", "size": "2.4 MB", "type": "pdf"}, {"name": "BST Implementation.py", "size": "8 KB", "type": "code"}])),
        ("dsa-bt-live", "assignment", "BST Insertion Task", "📌 Try implementing BST insertion on your own. Use the code template from the shared files. I'll walk through the solution in 10 minutes.", f"{today_str} 10:38:00", "10:38 AM", "00:38:00", "Prof. Sharma", None),
        ("dsa-bt-live", "announcement", "Midterm Exam Notice", "🎯 Midterm Exam next Monday (Sep 28) covering Modules 1-3. Focus on: Arrays, Linked Lists, and Trees. The exam is proctored and 2 hours long.", f"{today_str} 10:45:00", "10:45 AM", "00:45:00", "Prof. Sharma", None),
        ("ml-nn", "instruction", "Framework Setup", "📌 Install TensorFlow and Keras before next class: pip install tensorflow keras", "Sep 24, 2026 02:30:00", "2:30 PM", "00:30:00", "Prof. Sharma", None),
        ("ml-nn", "assignment", "CNN Classifier Submission", "📌 Submit the CNN Image Classifier project by Sep 28 on CIFAR-10. Minimum accuracy: 85%.", "Sep 24, 2026 03:10:00", "3:10 PM", "01:10:00", "Prof. Sharma", None)
    ]
    cursor.executemany("""
    INSERT INTO instructions (session_id, type, title, content, timestamp, time_display, video_timestamp, instructor, resource_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, instructions)

    # 4. Recordings Seed
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

    # 5. AI Summary Seed
    missed_points = [
        {"timestamp": "00:35:00", "summary": "Prof. Sharma explained Binary Search Tree (BST) properties — left subtree contains smaller values, right subtree contains larger values."},
        {"timestamp": "00:38:00", "summary": "Assignment given: Implement BST insertion using the code template from shared files."},
        {"timestamp": "00:40:00", "summary": "Discussion about duplicate handling — Standard BSTs don't allow duplicates; design choice for right subtree placement."},
        {"timestamp": "00:42:00", "summary": "Quick Quiz occurred: 'Time complexity of BST search' — Winner: Alice Johnson (3.2s). Correct answer: O(log n) for balanced BST."}
    ]

    modules = [
        {"num": 1, "title": "Tree Terminology & Basics", "time": "10:00 – 10:20", "desc": "Covered root, parent, child, leaf, height vs depth concepts.", "is_missed": False},
        {"num": 2, "title": "Binary Tree Types", "time": "10:20 – 10:33", "desc": "Full binary tree, complete binary tree, and perfect binary tree properties.", "is_missed": False},
        {"num": 3, "title": "BST Properties & Insertion", "time": "10:33 – 10:45", "desc": "BST invariant: left < root < right. Insertion algorithm and duplicate handling.", "is_missed": True},
        {"num": 4, "title": "Tree Traversal Methods", "time": "10:45 – Present", "desc": "Inorder, Preorder, and Postorder traversals. Inorder yields sorted keys.", "is_missed": False}
    ]

    takeaways = [
        {"icon": "fa-check-circle", "color": "text-green", "text": "Download and review 'Binary Trees - Lecture Notes.pdf' shared during the session"},
        {"icon": "fa-code", "color": "text-purple", "text": "Complete BST insertion implementation using the provided code template"},
        {"icon": "fa-exclamation-triangle", "color": "text-orange", "text": "Midterm Exam on Sep 28 — Covers Modules 1-3 (Arrays, Linked Lists, Trees). 2 hours, proctored."},
        {"icon": "fa-video", "color": "text-blue", "text": "Watch the missed segment (10:33 – 10:45) to catch up on BST properties and insertion"}
    ]

    cursor.execute("""
    INSERT INTO ai_summaries (session_id, summary_title, missed_window_text, missed_points_json, topic_modules_json, key_takeaways_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (
        "dsa-bt-live",
        "AI Catch-Up Summary — Binary Trees",
        "10:33 AM – 10:45 AM (12 minutes)",
        json.dumps(missed_points),
        json.dumps(modules),
        json.dumps(takeaways),
        datetime.now().isoformat()
    ))

    # User Attendance default record
    cursor.execute("""
    INSERT INTO user_attendance (user_id, session_id, joined_at, disconnected_at, reconnected_at, status, last_heartbeat)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (
        "student_demo",
        "dsa-bt-live",
        f"{today_str} 10:00:00",
        f"{today_str} 10:33:00",
        f"{today_str} 10:45:00",
        "reconnected",
        datetime.now().isoformat()
    ))

    seed_additional_tables(cursor)
    conn.commit()

def seed_additional_tables(cursor):
    now_iso = datetime.now().isoformat()

    # Pre-seed demo users for all 3 distinct roles: Owner, Teacher, Student
    users = [
        ("owner@eduvault.io", "password123", "Abhishek Dwivedi (Founder & Owner)", "owner", "EduVault Technologies Inc.", now_iso),
        ("teacher@eduvault.io", "password123", "Prof. Rajesh Sharma", "teacher", "Indian Institute of Technology", now_iso),
        ("student@eduvault.io", "password123", "Abhishek Dwivedi (Student)", "student", "Stanford CS Dept", now_iso)
    ]
    cursor.executemany("""
    INSERT OR IGNORE INTO users (email, password, full_name, role, organization, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
    """, users)

    # Pre-seed courses
    courses = [
        ("course-dsa", "Advanced Data Structures & Algorithms", "Prof. Rajesh Sharma", "Computer Science", 24, 1850, 4.95, 1, "linear-gradient(135deg, #6366F1, #8B5CF6)"),
        ("course-ml", "Deep Learning & Neural Architectures", "Prof. Rajesh Sharma", "Artificial Intelligence", 18, 1420, 4.90, 1, "linear-gradient(135deg, #8B5CF6, #06B6D4)"),
        ("course-web", "Full-Stack Web Systems & High Concurrency", "Prof. Rajesh Sharma", "Engineering", 32, 2190, 4.88, 1, "linear-gradient(135deg, #06B6D4, #10B981)"),
        ("course-sec", "Cybersecurity & DRM Cryptographic Vaults", "Prof. Rajesh Sharma", "Security", 14, 980, 4.98, 1, "linear-gradient(135deg, #F43F5E, #FB923C)")
    ]
    cursor.executemany("""
    INSERT OR IGNORE INTO courses (id, title, instructor, category, lessons_count, enrolled_count, rating, drm_protected, banner_gradient)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, courses)

    # Pre-seed leaderboard
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

    # Pre-seed assessments
    assessments = [
        ("quiz-trees", "Binary Trees & BST Mastery Quiz", "Data Structures", 30, 50, 10, "Intermediate"),
        ("exam-midterm", "Midterm Examination — CS301", "Algorithms", 90, 100, 25, "Advanced"),
        ("hackathon-algo", "Speed Algorithm Challenge 2026", "Competitive Coding", 60, 150, 3, "Hard")
    ]
    cursor.executemany("""
    INSERT OR IGNORE INTO assessments (id, title, subject, duration_mins, total_marks, questions_count, difficulty)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    """, assessments)
