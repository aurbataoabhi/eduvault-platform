from pydantic import BaseModel, Field
from typing import List, Optional, Any, Dict

class ChatMessageCreate(BaseModel):
    session_id: str
    sender_name: str
    sender_role: str = "student" # 'student', 'teacher', 'system'
    content: str
    message_type: str = "text"   # 'text', 'instruction', 'system'

class ChatMessageResponse(BaseModel):
    id: int
    session_id: str
    sender_name: str
    sender_role: str
    message_type: str
    content: str
    timestamp: str
    time_display: str
    is_missed: bool

class InstructionCreate(BaseModel):
    session_id: str
    type: str = "instruction" # 'instruction', 'assignment', 'resource', 'announcement'
    title: str
    content: str
    video_timestamp: Optional[str] = "00:00:00"
    instructor: str = "Prof. Sharma"
    resource_json: Optional[str] = None

class HeartbeatRequest(BaseModel):
    user_id: str
    session_id: str

class DisconnectSimulationRequest(BaseModel):
    user_id: str
    session_id: str
    outage_reason: str = "Power outage / Wi-Fi dropped"
    duration_minutes: int = 12

class CatchUpResponse(BaseModel):
    session_id: str
    session_title: str
    user_id: str
    status: str
    missed_start_time: Optional[str]
    missed_end_time: Optional[str]
    missed_duration: Optional[str]
    missed_messages_count: int
    missed_instructions_count: int
    missed_chat: List[Dict[str, Any]]
    missed_instructions: List[Dict[str, Any]]
    jump_recording_timestamp: str
    ai_summary: Optional[Dict[str, Any]]

# Auth & User Models
class LoginRequest(BaseModel):
    email: str
    password: str
    role_hint: Optional[str] = None

class SignupRequest(BaseModel):
    email: str
    password: str
    full_name: str
    role: str = "student"
    organization: Optional[str] = None

class UserResponse(BaseModel):
    id: int
    email: str
    full_name: str
    role: str
    organization: Optional[str] = None
    token: str

# Course Model
class CourseCreate(BaseModel):
    title: str
    instructor: str
    category: str
    drm_protected: bool = True

# Assessment Submission Model
class TestSubmissionRequest(BaseModel):
    test_id: str
    student_name: str
    answers: Dict[str, str]
    time_spent_secs: int = 300
    tab_switches: int = 0

# AI Query Model
class AIAskRequest(BaseModel):
    question: str
    context_topic: Optional[str] = "Data Structures & Algorithms"
    student_name: Optional[str] = "Student"

# Real-World Creator Models
class AssessmentCreate(BaseModel):
    title: str
    subject: str
    duration_mins: int = 30
    total_marks: int = 50
    difficulty: str = "Intermediate"
    questions: Optional[List[Dict[str, Any]]] = None

class ScheduleCreate(BaseModel):
    title: str
    instructor: str
    date: str
    time: str
    duration: str = "1 hr"
    course_id: Optional[str] = None

class ProfileUpdateRequest(BaseModel):
    full_name: Optional[str] = None
    organization: Optional[str] = None
    new_password: Optional[str] = None

class EnrollmentKeyCreate(BaseModel):
    course_id: str
    batch_name: str
    max_uses: int = 50
    permissions: Optional[List[str]] = ["live", "recordings", "materials", "tests", "exercises"]

class EnrollmentKeyClaimRequest(BaseModel):
    key_code: str
    student_name: Optional[str] = "Student"
    student_email: Optional[str] = "student@eduvault.io"

class RecordingCreate(BaseModel):
    title: str
    instructor: str
    duration: str = "1:00:00"
    quality: str = "HD 1080p"
    video_url: Optional[str] = "/assets/videos/lecture.mp4"
    session_id: Optional[str] = "dsa-bt-live"
    drm_protected: bool = True
    download_policy: str = "in_app_only" # in_app_only | disabled | allowed

class RecordingDRMPolicyUpdate(BaseModel):
    drm_protected: bool = True
    download_policy: str = "in_app_only"

# Whiteboard & Stream Models
class WhiteboardStrokeCreate(BaseModel):
    session_id: str
    user_id: Optional[str] = "teacher"
    user_role: Optional[str] = "teacher"
    stroke_type: Optional[str] = "stroke"
    stroke_data: Dict[str, Any]

class StreamSettingsUpdate(BaseModel):
    server_url: Optional[str] = None
    stream_key: Optional[str] = None
    youtube_rtmp_url: Optional[str] = None
    youtube_stream_key: Optional[str] = None
    simulcast_enabled: Optional[bool] = None
    resolution: Optional[str] = None
    video_bitrate: Optional[str] = None
    audio_bitrate: Optional[str] = None

class SimulcastToggleRequest(BaseModel):
    enabled: bool
    youtube_stream_key: Optional[str] = None

# Curriculum & Arranger Models
class CurriculumModuleCreate(BaseModel):
    title: str
    course_id: Optional[str] = None
    description: Optional[str] = None
    sort_order: Optional[int] = None

class CurriculumItemCreate(BaseModel):
    title: str
    course_id: Optional[str] = None
    module_id: Optional[int] = None
    item_type: str = "video" # 'video', 'pdf', 'quiz', 'exercise'
    duration_or_size: Optional[str] = "30:00"
    content_ref: Optional[str] = None
    sort_order: Optional[int] = None

class ReorderItem(BaseModel):
    id: int
    sort_order: int

class ReorderModule(BaseModel):
    id: int
    sort_order: int
    items: Optional[List[ReorderItem]] = None

class CurriculumReorderRequest(BaseModel):
    modules: Optional[List[ReorderModule]] = None
    items: Optional[List[ReorderItem]] = None


