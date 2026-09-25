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
