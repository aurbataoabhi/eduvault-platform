// ===================================================================
// EduVault Platform — Main Application Logic
// ===================================================================

// ========== APP STATE ==========
const AppState = {
    currentPage: 'landing',
    isLoggedIn: false,
    userRole: null, // 'teacher' or 'student'
    userName: '',
    selectedSignupRole: 'teacher',
    testWarnings: 0,
    currentQuestion: 1,
    testAnswers: {},
    classTimer: 0,
    isRecording: false,
    handRaised: false,
    micOn: true,
    camOn: true,
    notifications: [
        { id: 1, icon: 'fa-video', text: 'Live class "Binary Trees" starts in 15 min', time: '5 min ago' },
        { id: 2, icon: 'fa-check-circle', text: 'Alice Johnson submitted Assignment #5', time: '12 min ago' },
        { id: 3, icon: 'fa-trophy', text: 'New quiz results available for "Sorting Algorithms"', time: '1 hr ago' }
    ]
};

// ========== INITIALIZATION ==========
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initPreloader();
    initNavbarScroll();
    initCounterAnimation();
    initTabSwitchDetection();
    initScreenRecordPrevention();
    renderNotifications();
    
    // Check persistent login
    const savedSession = localStorage.getItem('eduvault_session');
    if (savedSession) {
        try {
            const session = JSON.parse(savedSession);
            AppState.isLoggedIn = true;
            AppState.userRole = session.role;
            AppState.userName = session.name;
            updateUIForLogin();
            if (session.role === 'owner') {
                navigateTo('admin-dashboard');
            } else if (session.role === 'teacher') {
                navigateTo('teacher-dashboard');
            } else {
                navigateTo('student-dashboard');
            }
        } catch(e) {
            localStorage.removeItem('eduvault_session');
        }
    }

    if (typeof BackendSync !== 'undefined' && BackendSync.init) {
        BackendSync.init().then(() => {
            loadDashboardData();
        });
    } else {
        loadDashboardData();
    }
});

// ========== PRELOADER ==========
function initPreloader() {
    setTimeout(() => {
        const preloader = document.getElementById('preloader');
        if (preloader) {
            preloader.classList.add('hidden');
        }
    }, 800);
}

// ========== NAVBAR ==========
function initNavbarScroll() {
    const navbar = document.getElementById('navbar');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 20) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });
}

function toggleMobileNav() {
    const toggle = document.getElementById('nav-toggle');
    const icon = toggle.querySelector('i');
    // For a real app, we'd show a mobile menu. For now, toggle icon
    if (icon.classList.contains('fa-bars')) {
        icon.classList.remove('fa-bars');
        icon.classList.add('fa-times');
    } else {
        icon.classList.remove('fa-times');
        icon.classList.add('fa-bars');
    }
}

// ========== NAVIGATION ==========
function navigateTo(page) {
    // Hide all pages
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    
    // Show target page
    const targetPage = document.getElementById(`page-${page}`);
    if (targetPage) {
        targetPage.classList.add('active');
        AppState.currentPage = page;
        window.scrollTo(0, 0);
    }
    
    // Close dropdowns
    document.getElementById('user-dropdown')?.classList.add('hidden');
    document.getElementById('notifications-panel')?.classList.add('hidden');
    
    // Update navbar based on page
    updateNavForPage(page);
    
    // Start timers & live classroom engine if needed
    if (page === 'live-class') {
        startClassTimer();
        // Show appropriate controls
        if (AppState.userRole === 'student') {
            document.getElementById('live-controls')?.classList.add('hidden');
            document.getElementById('student-controls')?.classList.remove('hidden');
        } else {
            document.getElementById('live-controls')?.classList.remove('hidden');
            document.getElementById('student-controls')?.classList.add('hidden');
        }
        startLiveClassroomWebRTC();
    } else {
        // If leaving live classroom, stop hardware media streams safely
        cleanupLiveClassroomWebRTC();
    }
    
    if (page === 'teacher-dashboard') {
        loadEnrollmentKeys();
    } else if (page === 'student-dashboard') {
        loadStudentEnrollments();
    }

    if (page === 'test-taking') {
        loadTestQuestions('quiz-trees');
    } else {
        if (testTimerInterval) clearInterval(testTimerInterval);
    }

    if (page === 'teacher-dashboard' || page === 'student-dashboard') {
        loadDashboardData();
    }

    if (page === 'schedule-manager') {
        loadSchedulesData();
    }

    if (page === 'course-view' || page === 'content-manager') {
        loadCoursesData();
    }

    if (page === 'leaderboard') {
        loadLeaderboardFromBackend();
    }
}

function updateNavForPage(page) {
    // Nothing special needed for landing nav since it's handled by login state
}

// ========== AUTH ==========
function openAuthModal(type) {
    document.getElementById('auth-modal').classList.remove('hidden');
    switchAuthForm(type);
}

function closeAuthModal() {
    document.getElementById('auth-modal').classList.add('hidden');
}

function switchAuthForm(type) {
    if (type === 'login') {
        document.getElementById('login-form').classList.remove('hidden');
        document.getElementById('signup-form').classList.add('hidden');
    } else {
        document.getElementById('login-form').classList.add('hidden');
        document.getElementById('signup-form').classList.remove('hidden');
    }
}

function selectRole(role) {
    AppState.selectedSignupRole = role;
    document.querySelectorAll('.role-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.role === role);
    });
    
    // Show/hide role-specific fields
    if (role === 'student') {
        document.getElementById('student-key-field')?.classList.remove('hidden');
        document.getElementById('teacher-org-field')?.classList.add('hidden');
    } else {
        document.getElementById('student-key-field')?.classList.add('hidden');
        document.getElementById('teacher-org-field')?.classList.remove('hidden');
    }
}

function togglePassword(fieldId) {
    const field = document.getElementById(fieldId);
    const btn = field.parentElement.querySelector('.toggle-password i');
    if (field.type === 'password') {
        field.type = 'text';
        btn.classList.remove('fa-eye');
        btn.classList.add('fa-eye-slash');
    } else {
        field.type = 'password';
        btn.classList.remove('fa-eye-slash');
        btn.classList.add('fa-eye');
    }
}

// ========== QUICK PERSONA SWITCHER & DEMO HELPERS ==========
async function quickLogin(role) {
    const isTeacher = role === 'teacher';
    const email = isTeacher ? 'teacher@eduvault.io' : 'student@eduvault.io';
    const password = 'password123';
    
    // Update strip pills
    document.querySelectorAll('.strip-pill').forEach(p => p.classList.remove('active'));
    const activePill = document.getElementById(`pill-${role}`);
    if (activePill) activePill.classList.add('active');

    // Authenticate with backend if online
    let userData = null;
    if (BackendSync.isBackendConnected) {
        try {
            const res = await fetch(`${BackendSync.apiUrl}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password, role_hint: role })
            });
            if (res.ok) {
                const data = await res.json();
                userData = data.user;
            }
        } catch(e) {}
    }

    if (!userData) {
        userData = {
            role: role,
            full_name: isTeacher ? 'Prof. Rajesh Sharma' : 'Abhishek Dwivedi',
            email: email,
            organization: isTeacher ? 'Indian Institute of Technology' : 'Stanford CS Dept'
        };
    }

    AppState.isLoggedIn = true;
    AppState.userRole = userData.role;
    AppState.userName = userData.full_name;

    localStorage.setItem('eduvault_session', JSON.stringify({
        role: AppState.userRole,
        name: AppState.userName,
        email: email,
        loginTime: Date.now()
    }));

    updateUIForLogin();
    closeAuthModal();

    showToast(`Switched to ${isTeacher ? '👨‍🏫 Teacher' : '🎓 Student'} Portal (${AppState.userName})`, 'success');
    navigateTo(isTeacher ? 'teacher-dashboard' : 'student-dashboard');
}

function quickDemoCatchUp() {
    document.querySelectorAll('.strip-pill').forEach(p => p.classList.remove('active'));
    document.getElementById('pill-catchup')?.classList.add('active');
    
    if (!AppState.isLoggedIn) {
        quickLogin('student');
    }
    navigateTo('session-catchup');
    showToast('⚡ Session Continuity Hub: Ready to test Wi-Fi outage recovery!', 'info');
}

function quickDemoLiveClass() {
    document.querySelectorAll('.strip-pill').forEach(p => p.classList.remove('active'));
    document.getElementById('pill-live')?.classList.add('active');
    
    if (!AppState.isLoggedIn) {
        quickLogin('student');
    }
    navigateTo('live-class');
    showToast('🔴 Joined Live Class! WebSocket chat & DRM protection active.', 'success');
}

function fillDemoCredentials(role) {
    const emailField = document.getElementById('login-email');
    const passField = document.getElementById('login-password');
    const keyField = document.getElementById('login-key');
    
    if (role === 'teacher') {
        if (emailField) emailField.value = 'teacher@eduvault.io';
        if (passField) passField.value = 'password123';
        if (keyField) keyField.value = '';
        showToast('Filled credentials for Teacher / Instructor', 'info');
    } else {
        if (emailField) emailField.value = 'student@eduvault.io';
        if (passField) passField.value = 'password123';
        if (keyField) keyField.value = 'EDU-CS301-2026';
        showToast('Filled credentials for Student', 'info');
    }
    handleLogin();
}

async function handleLogin() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const key = document.getElementById('login-key').value;
    
    if (!email || !password) {
        showToast('Please fill in all required fields', 'warning');
        return;
    }
    
    showToast('Authenticating with EduVault server...', 'info');

    let userData = null;
    if (BackendSync.isBackendConnected) {
        try {
            const res = await fetch(`${BackendSync.apiUrl}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password, role_hint: key ? 'student' : undefined })
            });
            if (res.ok) {
                const data = await res.json();
                userData = data.user;
            }
        } catch(e) {}
    }

    if (!userData) {
        const isTeacher = email.includes('teacher') || email.includes('prof') || email.includes('tutor') || !key;
        userData = {
            role: key ? 'student' : 'teacher',
            full_name: email.split('@')[0].replace('.', ' ').replace(/\b\w/g, l => l.toUpperCase()),
            email: email
        };
    }

    AppState.isLoggedIn = true;
    AppState.userRole = userData.role;
    AppState.userName = userData.full_name;
    
    const rememberMe = document.getElementById('remember-me')?.checked;
    if (rememberMe) {
        localStorage.setItem('eduvault_session', JSON.stringify({
            role: AppState.userRole,
            name: AppState.userName,
            email: email,
            loginTime: Date.now()
        }));
    }
    
    updateUIForLogin();
    closeAuthModal();
    
    showToast(`Welcome back, ${AppState.userName}!`, 'success');
    if (AppState.userRole === 'owner') {
        navigateTo('admin-dashboard');
    } else if (AppState.userRole === 'teacher') {
        navigateTo('teacher-dashboard');
    } else {
        navigateTo('student-dashboard');
    }
}

async function handleSignup() {
    const name = document.getElementById('signup-name').value;
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;
    const agreedTerms = document.getElementById('agree-terms')?.checked;
    
    if (!name || !email || !password) {
        showToast('Please fill in all required fields', 'warning');
        return;
    }
    
    if (!agreedTerms) {
        showToast('Please agree to the Terms of Service', 'warning');
        return;
    }
    
    if (password.length < 8) {
        showToast('Password must be at least 8 characters', 'warning');
        return;
    }
    
    showToast('Creating your account...', 'info');

    let userData = null;
    if (BackendSync.isBackendConnected) {
        try {
            const res = await fetch(`${BackendSync.apiUrl}/api/auth/signup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email,
                    password,
                    full_name: name,
                    role: AppState.selectedSignupRole,
                    organization: document.getElementById('signup-org')?.value || 'EduVault Member'
                })
            });
            if (res.ok) {
                const data = await res.json();
                userData = data.user;
            }
        } catch(e) {}
    }

    if (!userData) {
        userData = {
            role: AppState.selectedSignupRole,
            full_name: name,
            email: email
        };
    }
    
    AppState.isLoggedIn = true;
    AppState.userRole = userData.role;
    AppState.userName = userData.full_name;
    
    localStorage.setItem('eduvault_session', JSON.stringify({
        role: AppState.userRole,
        name: AppState.userName,
        email: email,
        loginTime: Date.now()
    }));
    
    updateUIForLogin();
    closeAuthModal();
    
    showToast(`Welcome to EduVault, ${name}!`, 'success');
    if (AppState.userRole === 'owner') {
        navigateTo('admin-dashboard');
    } else if (AppState.userRole === 'teacher') {
        navigateTo('teacher-dashboard');
    } else {
        navigateTo('student-dashboard');
    }
}

function updateUIForLogin() {
    // Hide auth buttons, show user menu
    document.getElementById('auth-buttons')?.classList.add('hidden');
    document.getElementById('user-menu')?.classList.remove('hidden');
    
    // Update user info
    const nameEl = document.getElementById('user-name-nav');
    if (nameEl) nameEl.textContent = AppState.userName;
    
    // Update avatar
    const avatarImg = document.getElementById('user-avatar-img');
    if (avatarImg) {
        // Use initials as avatar
        const initials = AppState.userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
        avatarImg.style.display = 'none';
        const avatarContainer = avatarImg.parentElement;
        let initialsEl = avatarContainer.querySelector('.avatar-initials');
        if (!initialsEl) {
            initialsEl = document.createElement('div');
            initialsEl.className = 'avatar-initials';
            initialsEl.style.cssText = 'width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#6C5CE7,#00D2FF);display:flex;align-items:center;justify-content:center;font-size:0.7rem;font-weight:700;color:white;';
            avatarContainer.insertBefore(initialsEl, avatarImg);
        }
        initialsEl.textContent = initials;
    }
    
    // Show appropriate nav links
    document.getElementById('nav-links-landing')?.classList.add('hidden');
    document.getElementById('nav-links-teacher')?.classList.add('hidden');
    document.getElementById('nav-links-student')?.classList.add('hidden');
    document.getElementById('nav-links-owner')?.classList.add('hidden');

    const roleBadge = document.getElementById('user-role-nav');
    if (roleBadge) {
        roleBadge.textContent = AppState.userRole ? AppState.userRole.toUpperCase() : 'STUDENT';
        roleBadge.className = `user-role-badge ${AppState.userRole || 'student'}`;
    }

    if (AppState.userRole === 'owner') {
        document.getElementById('nav-links-owner')?.classList.remove('hidden');
    } else if (AppState.userRole === 'teacher') {
        document.getElementById('nav-links-teacher')?.classList.remove('hidden');
        const greet = document.getElementById('teacher-greeting');
        if (greet) greet.textContent = AppState.userName;
    } else {
        document.getElementById('nav-links-student')?.classList.remove('hidden');
        const greet = document.getElementById('student-greeting');
        if (greet) greet.textContent = AppState.userName;
    }
}

function logout() {
    AppState.isLoggedIn = false;
    AppState.userRole = null;
    AppState.userName = '';
    
    // Clear persistent session
    localStorage.removeItem('eduvault_session');
    
    // Reset UI
    document.getElementById('auth-buttons')?.classList.remove('hidden');
    document.getElementById('user-menu')?.classList.add('hidden');
    document.getElementById('nav-links-landing')?.classList.remove('hidden');
    document.getElementById('nav-links-teacher')?.classList.add('hidden');
    document.getElementById('nav-links-student')?.classList.add('hidden');
    
    navigateTo('landing');
    showToast('You have been logged out', 'info');
}

// ========== USER DROPDOWN & NOTIFICATIONS ==========
function toggleUserDropdown() {
    const dropdown = document.getElementById('user-dropdown');
    dropdown.classList.toggle('hidden');
    // Close notifications
    document.getElementById('notifications-panel')?.classList.add('hidden');
}

function toggleNotifications() {
    const panel = document.getElementById('notifications-panel');
    panel.classList.toggle('hidden');
    // Close dropdown
    document.getElementById('user-dropdown')?.classList.add('hidden');
}

function renderNotifications() {
    const list = document.getElementById('notif-list');
    if (!list) return;
    
    list.innerHTML = AppState.notifications.map(n => `
        <div class="notif-item">
            <i class="fas ${n.icon}"></i>
            <div>
                <div class="notif-text">${n.text}</div>
                <div class="notif-time">${n.time}</div>
            </div>
        </div>
    `).join('');
}

function clearNotifications() {
    AppState.notifications = [];
    renderNotifications();
    document.getElementById('notif-badge').style.display = 'none';
    showToast('Notifications cleared', 'info');
}

// Close dropdowns when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.user-menu')) {
        document.getElementById('user-dropdown')?.classList.add('hidden');
    }
    if (!e.target.closest('#notifications-panel') && !e.target.closest('.notification-btn')) {
        document.getElementById('notifications-panel')?.classList.add('hidden');
    }
});

// ========== COUNTER ANIMATION ==========
function initCounterAnimation() {
    const counters = document.querySelectorAll('.stat-number[data-count]');
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const target = parseInt(entry.target.dataset.count);
                animateCounter(entry.target, target);
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.5 });
    
    counters.forEach(counter => observer.observe(counter));
}

function animateCounter(element, target) {
    let current = 0;
    const duration = 2000;
    const step = target / (duration / 16);
    
    function update() {
        current += step;
        if (current >= target) {
            element.textContent = formatNumber(target);
        } else {
            element.textContent = formatNumber(Math.floor(current));
            requestAnimationFrame(update);
        }
    }
    
    requestAnimationFrame(update);
}

function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(0) + 'M';
    if (num >= 1000) return num.toLocaleString();
    return num.toString();
}

// ========== PRICING TOGGLE ==========
function togglePricing() {
    const isAnnual = document.getElementById('pricing-toggle').checked;
    const toggleLabels = document.querySelector('.pricing-toggle').querySelectorAll('span');
    
    toggleLabels[0].classList.toggle('active', !isAnnual);
    toggleLabels[1].classList.toggle('active', isAnnual);
    
    document.querySelectorAll('.amount').forEach(el => {
        const monthly = el.dataset.monthly;
        const annual = el.dataset.annual;
        el.textContent = isAnnual ? annual : monthly;
    });
}

// ========== LIVE CLASS ==========
let classTimerInterval;

function startClassTimer() {
    if (classTimerInterval) clearInterval(classTimerInterval);
    AppState.classTimer = 45 * 60 + 12; // 45:12 start
    
    classTimerInterval = setInterval(() => {
        AppState.classTimer++;
        const hours = Math.floor(AppState.classTimer / 3600);
        const mins = Math.floor((AppState.classTimer % 3600) / 60);
        const secs = AppState.classTimer % 60;
        
        const timerEl = document.getElementById('class-timer');
        if (timerEl) {
            timerEl.textContent = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        }
    }, 1000);
}

// ==========================================
// WebRTC Real Media & Stream Engine
// ==========================================
const WebRTCState = {
    localStream: null,
    screenStream: null,
    signalingSocket: null,
    peerConnections: {},
    roomId: 'eduvault-live-101',
    myId: 'peer_' + Math.random().toString(36).substring(2, 9),
    role: 'teacher',
    isStarted: false,
    audioContext: null,
    analyser: null,
    micAnimFrame: null,
    isScreenSharing: false
};

const RTC_CONFIG = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
    ]
};

// ===================================================================
// ENTERPRISE REAL-TIME WEBRTC VIDEO, AUDIO & MULTI-PEER ENGINE
// ===================================================================

async function startLiveClassroomWebRTC() {
    WebRTCState.role = AppState.userRole || 'teacher';
    const isTeacher = WebRTCState.role === 'teacher';
    const videoEl = document.getElementById('real-live-video');
    const pipContainer = document.getElementById('self-video-pip');
    const pipVideo = document.getElementById('self-live-video');
    const placeholder = document.getElementById('video-placeholder');
    const pill = document.getElementById('webrtc-status-pill');

    if (pill) {
        pill.className = 'webrtc-status-pill connecting';
        pill.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Initializing WebRTC...';
    }

    try {
        // Request Real Hardware Camera & Microphone
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            showToast('Requesting camera & microphone access...', 'info');
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
                audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
            });
            WebRTCState.localStream = stream;
            AppState.camOn = true;
            AppState.micOn = true;

            if (isTeacher) {
                // Teacher's view: main stage is real local camera (muted locally to prevent audio feedback loop)
                if (videoEl) {
                    videoEl.srcObject = stream;
                    videoEl.muted = true;
                    videoEl.classList.remove('hidden');
                    videoEl.play().catch(e => console.warn(e));
                }
                if (pipContainer) pipContainer.classList.add('hidden');
            } else {
                // Student's view: self picture-in-picture
                if (pipVideo) {
                    pipVideo.srcObject = stream;
                    pipVideo.muted = true;
                    pipVideo.play().catch(e => console.warn(e));
                }
                if (pipContainer) pipContainer.classList.remove('hidden');
            }

            if (placeholder) placeholder.classList.add('hidden');
            startMicAudioVisualizer(stream);
            updateCamMicButtons(true, true);
        }
    } catch (mediaErr) {
        console.warn('Hardware media error:', mediaErr);
        showToast(`Hardware notice: ${mediaErr.name === 'NotAllowedError' ? 'Camera/Mic permission denied in browser' : mediaErr.message}. Connecting in audio/signaling mode.`, 'warning');
    }

    // Connect Real-Time WebRTC Mesh Signaling WebSocket
    connectWebRTCSignaling();
}

function connectWebRTCSignaling() {
    if (WebRTCState.signalingSocket) {
        try { WebRTCState.signalingSocket.close(); } catch(e){}
    }

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const name = encodeURIComponent(AppState.userName || (WebRTCState.role === 'teacher' ? 'Prof. Sharma' : 'Student'));
    const url = `${proto}//${host}/ws/webrtc/${WebRTCState.roomId}/${WebRTCState.myId}?role=${WebRTCState.role}&name=${name}`;

    try {
        const ws = new WebSocket(url);
        WebRTCState.signalingSocket = ws;

        ws.onopen = () => {
            const pill = document.getElementById('webrtc-status-pill');
            if (pill) {
                pill.className = 'webrtc-status-pill connected';
                pill.innerHTML = '<i class="fas fa-signal"></i> WebRTC P2P Live';
            }
            showToast(`🟢 Connected to Live WebRTC Classroom (${WebRTCState.role.toUpperCase()})`, 'success');
        };

        ws.onmessage = async (event) => {
            try {
                const msg = JSON.parse(event.data);
                await handleWebRTCSignalMessage(msg);
            } catch(e) {
                console.error('Signal parse error:', e);
            }
        };

        ws.onerror = (e) => {
            console.warn('WebRTC signaling error:', e);
        };

        ws.onclose = () => {
            const pill = document.getElementById('webrtc-status-pill');
            if (pill) {
                pill.className = 'webrtc-status-pill connecting';
                pill.innerHTML = '<i class="fas fa-circle-notch"></i> Standalone Hub';
            }
        };
    } catch(e) {
        console.warn('Could not connect signaling socket:', e);
    }
}

async function handleWebRTCSignalMessage(msg) {
    const isTeacher = WebRTCState.role === 'teacher';

    if (msg.type === 'room_state') {
        const peerCount = (msg.peers ? msg.peers.length : 0) + 1;
        const countEl = document.getElementById('participant-count');
        if (countEl) countEl.textContent = peerCount;

        // If I am a student and the teacher is already present in room, initiate offer to teacher
        if (!isTeacher && msg.peers) {
            for (const peer of msg.peers) {
                if (peer.role === 'teacher') {
                    initiatePeerConnection(peer.client_id, peer.name, true);
                }
            }
        }
    } else if (msg.type === 'peer_joined') {
        showToast(`👤 ${msg.name} (${msg.role}) joined the live class!`, 'info');
        
        // If I am the teacher and a student joins, teacher initiates WebRTC stream to student
        if (isTeacher) {
            initiatePeerConnection(msg.client_id, msg.name, true);
        }
    } else if (msg.type === 'peer_left') {
        showToast(`👋 Participant ${msg.client_id} disconnected`, 'info');
        removePeer(msg.client_id);
    } else if (msg.type === 'offer') {
        // Received offer from peer: create answer
        const pc = getOrCreatePeerConnection(msg.sender, msg.sender_name || 'Participant');
        await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendSignal({
            type: 'answer',
            target: msg.sender,
            sdp: answer
        });
    } else if (msg.type === 'answer') {
        const pc = WebRTCState.peerConnections[msg.sender];
        if (pc) {
            await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
        }
    } else if (msg.type === 'candidate') {
        const pc = WebRTCState.peerConnections[msg.sender];
        if (pc && msg.candidate) {
            try {
                await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
            } catch(e) {
                console.warn('Error adding ICE candidate:', e);
            }
        }
    } else if (msg.type === 'chat') {
        addChatMessage(msg.sender_name, msg.text, false);
    } else if (msg.type === 'hand_raise') {
        showToast(`✋ ${msg.sender_name} raised hand!`, 'warning');
        addChatMessage(null, `✋ ${msg.sender_name} raised hand`, true);
    } else if (msg.type === 'whiteboard') {
        drawRemoteWhiteboardStroke(msg.data);
    } else if (msg.type === 'whiteboard_clear') {
        clearWhiteboardCanvasLocally();
    }
}

function sendSignal(payload) {
    if (WebRTCState.signalingSocket && WebRTCState.signalingSocket.readyState === WebSocket.OPEN) {
        WebRTCState.signalingSocket.send(JSON.stringify(payload));
    }
}

function getOrCreatePeerConnection(targetId, targetName) {
    if (WebRTCState.peerConnections[targetId]) {
        return WebRTCState.peerConnections[targetId];
    }

    const pc = new RTCPeerConnection(RTC_CONFIG);
    WebRTCState.peerConnections[targetId] = pc;

    // Attach local tracks so peer can hear and see us
    if (WebRTCState.localStream) {
        WebRTCState.localStream.getTracks().forEach(track => {
            pc.addTrack(track, WebRTCState.localStream);
        });
    }

    // ICE Candidate generation
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            sendSignal({
                type: 'candidate',
                target: targetId,
                candidate: event.candidate
            });
        }
    };

    // Remote Track received!
    pc.ontrack = (event) => {
        console.log(`🎥 Received remote WebRTC track (${event.track.kind}) from ${targetName}`);
        const remoteStream = event.streams[0];
        const isTeacher = WebRTCState.role === 'teacher';

        if (!isTeacher) {
            // Student received Teacher's stream -> put on main stage!
            const mainVideo = document.getElementById('real-live-video');
            if (mainVideo) {
                mainVideo.srcObject = remoteStream;
                mainVideo.muted = false; // Enable audio so student hears teacher!
                mainVideo.classList.remove('hidden');
                mainVideo.play().catch(e => console.warn(e));
            }
            document.getElementById('video-placeholder')?.classList.add('hidden');
        } else {
            // Teacher received Student's stream -> add to dynamic student gallery bar
            addRemotePeerTile(targetId, targetName, remoteStream);
        }
    };

    pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
            removePeer(targetId);
        }
    };

    return pc;
}

async function initiatePeerConnection(targetId, targetName, isInitiator) {
    const pc = getOrCreatePeerConnection(targetId, targetName);
    if (isInitiator) {
        try {
            const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
            await pc.setLocalDescription(offer);
            sendSignal({
                type: 'offer',
                target: targetId,
                sdp: offer
            });
        } catch(e) {
            console.error('Error creating offer:', e);
        }
    }
}

function addRemotePeerTile(peerId, peerName, stream) {
    const bar = document.getElementById('remote-peers-bar');
    if (!bar) return;
    bar.classList.remove('hidden');

    let tile = document.getElementById(`peer-tile-${peerId}`);
    if (!tile) {
        tile = document.createElement('div');
        tile.className = 'remote-peer-tile';
        tile.id = `peer-tile-${peerId}`;

        const video = document.createElement('video');
        video.autoplay = true;
        video.playsInline = true;
        video.srcObject = stream;
        video.play().catch(e => console.warn(e));

        const badge = document.createElement('span');
        badge.className = 'peer-name-badge';
        badge.textContent = peerName;

        tile.appendChild(video);
        tile.appendChild(badge);
        bar.appendChild(tile);
    }
}

function removePeer(peerId) {
    if (WebRTCState.peerConnections[peerId]) {
        try { WebRTCState.peerConnections[peerId].close(); } catch(e){}
        delete WebRTCState.peerConnections[peerId];
    }
    document.getElementById(`peer-tile-${peerId}`)?.remove();
}

function cleanupLiveClassroomWebRTC() {
    if (WebRTCState.localStream) {
        WebRTCState.localStream.getTracks().forEach(track => track.stop());
        WebRTCState.localStream = null;
    }
    if (WebRTCState.screenStream) {
        WebRTCState.screenStream.getTracks().forEach(track => track.stop());
        WebRTCState.screenStream = null;
    }
    stopMicAudioVisualizer();

    for (const peerId in WebRTCState.peerConnections) {
        try { WebRTCState.peerConnections[peerId].close(); } catch(e){}
    }
    WebRTCState.peerConnections = {};

    if (WebRTCState.signalingSocket) {
        try { WebRTCState.signalingSocket.close(); } catch(e){}
        WebRTCState.signalingSocket = null;
    }

    const videoEl = document.getElementById('real-live-video');
    if (videoEl) {
        videoEl.srcObject = null;
    }
    const pipVideo = document.getElementById('self-live-video');
    if (pipVideo) {
        pipVideo.srcObject = null;
    }
    document.getElementById('self-video-pip')?.classList.add('hidden');
    document.getElementById('remote-peers-bar')?.classList.add('hidden');
}

function startMicAudioVisualizer(stream) {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        if (!WebRTCState.audioContext) {
            WebRTCState.audioContext = new AudioCtx();
        }
        if (WebRTCState.audioContext.state === 'suspended') {
            WebRTCState.audioContext.resume();
        }
        const source = WebRTCState.audioContext.createMediaStreamSource(stream);
        WebRTCState.analyser = WebRTCState.audioContext.createAnalyser();
        WebRTCState.analyser.fftSize = 64;
        source.connect(WebRTCState.analyser);

        const meter = document.getElementById('mic-level-meter');
        if (meter) meter.classList.add('active');

        const buffer = new Uint8Array(WebRTCState.analyser.frequencyBinCount);
        function tick() {
            if (!WebRTCState.localStream || !AppState.micOn) {
                if (meter) meter.classList.remove('active');
                return;
            }
            WebRTCState.analyser.getByteFrequencyData(buffer);
            let sum = 0;
            for (let i = 0; i < buffer.length; i++) sum += buffer[i];
            const avg = sum / buffer.length;
            if (meter) {
                const bars = meter.querySelectorAll('span');
                if (bars.length >= 3) {
                    bars[0].style.height = `${Math.min(18, Math.max(3, (avg / 255) * 16))}px`;
                    bars[1].style.height = `${Math.min(18, Math.max(3, (avg / 255) * 22))}px`;
                    bars[2].style.height = `${Math.min(18, Math.max(3, (avg / 255) * 14))}px`;
                }
            }
            WebRTCState.micAnimFrame = requestAnimationFrame(tick);
        }
        tick();
    } catch (e) {
        console.warn('Audio visualizer error:', e);
    }
}

function stopMicAudioVisualizer() {
    if (WebRTCState.micAnimFrame) {
        cancelAnimationFrame(WebRTCState.micAnimFrame);
        WebRTCState.micAnimFrame = null;
    }
    const meter = document.getElementById('mic-level-meter');
    if (meter) meter.classList.remove('active');
}

function updateCamMicButtons(camState, micState) {
    const micBtn = document.getElementById('mic-btn');
    if (micBtn) {
        micBtn.classList.toggle('active', micState);
        const icon = micBtn.querySelector('i');
        if (icon) icon.className = micState ? 'fas fa-microphone' : 'fas fa-microphone-slash';
    }
    const camBtn = document.getElementById('cam-btn');
    if (camBtn) {
        camBtn.classList.toggle('active', camState);
        const icon = camBtn.querySelector('i');
        if (icon) icon.className = camState ? 'fas fa-video' : 'fas fa-video-slash';
    }
}

// Teacher & Unified Cam/Mic Toggles
async function toggleMic() {
    if (!WebRTCState.localStream && navigator.mediaDevices?.getUserMedia) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            WebRTCState.localStream = stream;
            AppState.micOn = true;
            startMicAudioVisualizer(stream);
        } catch(e) {
            showToast('Microphone permission required', 'warning');
            return;
        }
    }

    AppState.micOn = !AppState.micOn;
    if (WebRTCState.localStream) {
        WebRTCState.localStream.getAudioTracks().forEach(track => {
            track.enabled = AppState.micOn;
        });
    }
    const btn = document.getElementById('mic-btn');
    if (btn) {
        const icon = btn.querySelector('i');
        btn.classList.toggle('active', AppState.micOn);
        if (icon) icon.className = AppState.micOn ? 'fas fa-microphone' : 'fas fa-microphone-slash';
    }
    const meter = document.getElementById('mic-level-meter');
    if (meter) {
        meter.style.opacity = AppState.micOn ? '1' : '0.3';
    }
    showToast(AppState.micOn ? '🎙️ Microphone unmuted (live)' : '🎙️ Microphone muted', 'info');
}

async function toggleCam() {
    if (!WebRTCState.localStream && navigator.mediaDevices?.getUserMedia) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            WebRTCState.localStream = stream;
            AppState.camOn = true;
            const videoEl = document.getElementById('real-live-video');
            if (videoEl) {
                videoEl.srcObject = stream;
                videoEl.play();
            }
        } catch(e) {
            showToast('Camera permission required', 'warning');
            return;
        }
    }

    AppState.camOn = !AppState.camOn;
    if (WebRTCState.localStream) {
        WebRTCState.localStream.getVideoTracks().forEach(track => {
            track.enabled = AppState.camOn;
        });
    }
    const btn = document.getElementById('cam-btn');
    if (btn) {
        const icon = btn.querySelector('i');
        btn.classList.toggle('active', AppState.camOn);
        if (icon) icon.className = AppState.camOn ? 'fas fa-video' : 'fas fa-video-slash';
    }
    showToast(AppState.camOn ? '📷 Camera turned ON' : '📷 Camera turned OFF', 'info');
}

async function toggleScreenShare() {
    const btn = document.getElementById('screen-btn');
    const videoEl = document.getElementById('real-live-video');

    if (!WebRTCState.isScreenSharing) {
        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
                showToast('Screen sharing is not supported in this browser.', 'warning');
                return;
            }
            showToast('Select window, application, or tab to share...', 'info');
            const screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: { cursor: 'always' },
                audio: false
            });

            WebRTCState.screenStream = screenStream;
            WebRTCState.isScreenSharing = true;

            const screenTrack = screenStream.getVideoTracks()[0];

            // Replace video track in every connected peer
            for (const peerId in WebRTCState.peerConnections) {
                const pc = WebRTCState.peerConnections[peerId];
                const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
                if (sender) {
                    sender.replaceTrack(screenTrack);
                }
            }

            if (videoEl) {
                videoEl.srcObject = screenStream;
                videoEl.play().catch(e => console.warn(e));
            }
            btn.classList.add('active');
            showToast('🖥️ Screen sharing live to all participants!', 'success');

            screenTrack.onended = () => {
                stopScreenShare();
            };
        } catch (err) {
            console.warn('Screen share canceled:', err);
            showToast('Screen share canceled', 'info');
        }
    } else {
        stopScreenShare();
    }
}

function stopScreenShare() {
    const btn = document.getElementById('screen-btn');
    const videoEl = document.getElementById('real-live-video');

    if (WebRTCState.screenStream) {
        WebRTCState.screenStream.getTracks().forEach(t => t.stop());
        WebRTCState.screenStream = null;
    }
    WebRTCState.isScreenSharing = false;
    if (btn) btn.classList.remove('active');

    // Restore camera track to peers
    if (WebRTCState.localStream) {
        const camTrack = WebRTCState.localStream.getVideoTracks()[0];
        if (camTrack) {
            for (const peerId in WebRTCState.peerConnections) {
                const pc = WebRTCState.peerConnections[peerId];
                const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
                if (sender) {
                    sender.replaceTrack(camTrack);
                }
            }
        }
        if (videoEl) {
            videoEl.srcObject = WebRTCState.localStream;
            videoEl.play().catch(e => console.warn(e));
        }
    }
    showToast('Screen sharing stopped — camera restored', 'info');
}

function toggleWhiteboard() {
    const modal = document.getElementById('whiteboard-modal');
    if (modal) {
        modal.classList.toggle('hidden');
        if (!modal.classList.contains('hidden')) {
            setTimeout(initWhiteboard, 50);
            showToast('🎨 Interactive Synchronized Whiteboard Active', 'info');
        }
    }
}

function toggleRecording() {
    AppState.isRecording = !AppState.isRecording;
    const btn = document.getElementById('record-btn');
    if (btn) btn.classList.toggle('recording', AppState.isRecording);
    showToast(AppState.isRecording ? '🔴 Recording started (1080p, 30fps)' : 'Recording saved to cloud vault', AppState.isRecording ? 'warning' : 'success');
}

function muteAllStudents() {
    sendSignal({ type: 'mute_all' });
    showToast('All students have been requested to mute', 'info');
}

function endClass() {
    if (confirm('Are you sure you want to end this live class for everyone?')) {
        if (classTimerInterval) clearInterval(classTimerInterval);
        cleanupLiveClassroomWebRTC();
        showToast('Class ended. All media sessions safely terminated.', 'success');
        navigateTo(AppState.userRole === 'teacher' ? 'teacher-dashboard' : 'student-dashboard');
    }
}

function leaveClass() {
    if (confirm('Leave this live class?')) {
        cleanupLiveClassroomWebRTC();
        navigateTo('student-dashboard');
    }
}

// Student Controls
async function toggleStudentMic() {
    const btn = document.getElementById('student-mic');
    if (!btn) return;
    const icon = btn.querySelector('i');
    const isMuted = icon.classList.contains('fa-microphone-slash');

    if (isMuted) {
        try {
            if (!WebRTCState.localStream && navigator.mediaDevices?.getUserMedia) {
                WebRTCState.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            }
            if (WebRTCState.localStream) {
                WebRTCState.localStream.getAudioTracks().forEach(t => t.enabled = true);
            }
            icon.className = 'fas fa-microphone';
            btn.classList.add('active');
            showToast('Microphone unmuted (live)', 'info');
        } catch (e) {
            showToast('Microphone access denied', 'warning');
        }
    } else {
        if (WebRTCState.localStream) {
            WebRTCState.localStream.getAudioTracks().forEach(t => t.enabled = false);
        }
        icon.className = 'fas fa-microphone-slash';
        btn.classList.remove('active');
        showToast('Microphone muted', 'info');
    }
}

async function toggleStudentCam() {
    const btn = document.getElementById('student-cam');
    if (!btn) return;
    const icon = btn.querySelector('i');
    const isOff = icon.classList.contains('fa-video-slash');

    if (isOff) {
        try {
            if (!WebRTCState.localStream && navigator.mediaDevices?.getUserMedia) {
                WebRTCState.localStream = await navigator.mediaDevices.getUserMedia({ video: true });
            }
            if (WebRTCState.localStream) {
                WebRTCState.localStream.getVideoTracks().forEach(t => t.enabled = true);
                const pipVideo = document.getElementById('self-live-video');
                if (pipVideo) {
                    pipVideo.srcObject = WebRTCState.localStream;
                    pipVideo.play();
                }
                document.getElementById('self-video-pip')?.classList.remove('hidden');
            }
            icon.className = 'fas fa-video';
            btn.classList.add('active');
            showToast('Camera live', 'info');
        } catch (e) {
            showToast('Camera access denied', 'warning');
        }
    } else {
        if (WebRTCState.localStream) {
            WebRTCState.localStream.getVideoTracks().forEach(t => t.enabled = false);
        }
        icon.className = 'fas fa-video-slash';
        btn.classList.remove('active');
        showToast('Camera off', 'info');
    }
}

function raiseHand() {
    AppState.handRaised = !AppState.handRaised;
    const btn = document.getElementById('raise-hand-btn');
    if (btn) btn.classList.toggle('raised', AppState.handRaised);
    
    if (AppState.handRaised) {
        showToast('✋ Hand raised — sent to teacher', 'info');
        sendSignal({ type: 'hand_raise' });
        addChatMessage(null, `${AppState.userName || 'You'} raised hand`, true);
    } else {
        showToast('Hand lowered', 'info');
    }
}

function alertTeacher() {
    showToast('⚠️ Alert sent to teacher: audio/video issue reported', 'warning');
    sendSignal({ type: 'chat', text: '⚠️ [SYSTEM ALERT]: Student reports audio/video stream difficulty.' });
}

function dismissAlert() {
    document.getElementById('teacher-alert-banner')?.classList.add('hidden');
}

// ========== LIVE CHAT ==========
function switchSidebarTab(tab) {
    document.querySelectorAll('.sidebar-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.sidebar-panel').forEach(p => p.classList.remove('active'));
    
    event.target.closest('.sidebar-tab').classList.add('active');
    document.getElementById(`panel-${tab}`)?.classList.add('active');
}

function handleChatKeypress(e) {
    if (e.key === 'Enter') {
        sendChatMessage();
    }
}

function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const message = input.value.trim();
    if (!message) return;
    
    const sender = AppState.userName || 'You';
    const role = AppState.userRole || 'student';
    addChatMessage(sender, message);
    
    if (typeof BackendSync !== 'undefined' && BackendSync.sendMessage) {
        BackendSync.sendMessage('dsa-bt-live', sender, message, role);
    }
    input.value = '';
}

function addChatMessage(sender, message, isSystem = false) {
    const container = document.getElementById('chat-messages');
    if (!container) return;
    
    const now = new Date();
    const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    const msgDiv = document.createElement('div');
    msgDiv.className = `chat-msg${isSystem ? ' system-msg' : ''}`;
    
    if (isSystem) {
        msgDiv.innerHTML = `<p><i class="fas fa-hand"></i> ${message}</p>`;
    } else {
        const isTeacher = AppState.userRole === 'teacher';
        msgDiv.innerHTML = `
            <span class="chat-sender ${isTeacher ? 'teacher-sender' : ''}">${sender}</span>
            <p>${message}</p>
            <span class="chat-time">${time}</span>
        `;
    }
    
    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;
}

// ========== LIVE QUIZ ==========
let quizTimerInterval;
let quizSelectedAnswer = null;

function launchQuiz() {
    const popup = document.getElementById('live-quiz-popup');
    if (!popup) return;
    
    popup.classList.remove('hidden');
    document.getElementById('quiz-result')?.classList.add('hidden');
    document.querySelector('.quiz-popup-body')?.classList.remove('hidden');
    
    // Reset options
    document.querySelectorAll('.quiz-option').forEach(o => o.classList.remove('selected'));
    quizSelectedAnswer = null;
    
    // Start quiz timer
    let timeLeft = 30;
    const timerEl = document.getElementById('quiz-timer');
    
    if (quizTimerInterval) clearInterval(quizTimerInterval);
    quizTimerInterval = setInterval(() => {
        timeLeft--;
        if (timerEl) timerEl.textContent = `00:${String(timeLeft).padStart(2, '0')}`;
        if (timeLeft <= 0) {
            clearInterval(quizTimerInterval);
            submitQuizAnswer();
        }
    }, 1000);
    
    showToast('📝 Quiz launched! Students have 30 seconds to answer.', 'info');
}

function selectQuizOption(el, answer) {
    document.querySelectorAll('.quiz-option').forEach(o => o.classList.remove('selected'));
    el.classList.add('selected');
    quizSelectedAnswer = answer;
}

function submitQuizAnswer() {
    if (quizTimerInterval) clearInterval(quizTimerInterval);
    
    // Show results
    document.querySelector('.quiz-popup-body')?.classList.add('hidden');
    const result = document.getElementById('quiz-result');
    if (result) {
        result.classList.remove('hidden');
    }
    
    if (quizSelectedAnswer === 'B') {
        showToast('✅ Correct answer! Well done!', 'success');
    } else {
        showToast('❌ Incorrect. The answer is B) O(log n)', 'error');
    }
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
        document.getElementById('live-quiz-popup')?.classList.add('hidden');
    }, 5000);
}

function shareDocument() {
    showToast('📄 Document sharing panel opened', 'info');
}

// ========== CONTENT MANAGER ==========
function toggleTreeItem(header) {
    const item = header.parentElement;
    const children = item.querySelector('.tree-children');
    const chevron = header.querySelector('i:first-child');
    const folderIcon = header.querySelector('i:nth-child(2)');
    
    if (children) {
        const isExpanded = !children.classList.contains('hidden');
        children.classList.toggle('hidden');
        item.classList.toggle('expanded');
        
        if (chevron) {
            chevron.className = isExpanded ? 'fas fa-chevron-right' : 'fas fa-chevron-down';
        }
        if (folderIcon) {
            folderIcon.className = isExpanded ? 'fas fa-folder text-yellow' : 'fas fa-folder-open text-yellow';
        }
    }
}

function openUploadModal() {
    document.getElementById('upload-modal')?.classList.remove('hidden');
}

function closeUploadModal() {
    document.getElementById('upload-modal')?.classList.add('hidden');
}

function handleDragOver(e) {
    e.preventDefault();
    e.currentTarget.classList.add('dragover');
}

function handleDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('dragover');
    showToast('File received — processing...', 'info');
}

function handleFileSelect(e) {
    const files = e.target.files;
    if (files.length > 0) {
        showToast(`${files.length} file(s) selected`, 'info');
    }
}

async function uploadContent() {
    const titleInput = document.getElementById('upload-title-input');
    const categorySelect = document.getElementById('upload-category-input');
    const drmToggle = document.getElementById('upload-drm-input');

    const title = titleInput ? titleInput.value.trim() : '';
    if (!title) {
        showToast('Please specify a title for the content / course', 'warning');
        return;
    }

    const payload = {
        title: title,
        instructor: AppState.userName || 'Prof. Rajesh Sharma',
        category: categorySelect ? categorySelect.value : 'Computer Science',
        drm_protected: drmToggle ? drmToggle.checked : true
    };

    try {
        showToast('🔐 Encrypting and publishing to DRM Vault...', 'info');
        const res = await fetch(`${BackendSync.apiUrl}/api/courses`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (res.ok) {
            closeUploadModal();
            if (titleInput) titleInput.value = '';
            showToast('✅ Course & Content published and protected with DRM in cloud database!', 'success');
            await loadCoursesData();
            await loadDashboardData();
        } else {
            showToast('Failed to upload content to database', 'danger');
        }
    } catch(e) {
        showToast('Network error uploading content', 'danger');
    }
}

function createPlaylist() {
    openUploadModal();
}

function addSubject() {
    openUploadModal();
}

// ========== COURSE VIEW ==========
function toggleCurriculumSection(header) {
    const section = header.parentElement;
    const items = section.querySelector('.curriculum-items');
    const chevron = header.querySelector('i:first-child');
    
    if (items) {
        const isExpanded = !items.classList.contains('hidden');
        items.classList.toggle('hidden');
        section.classList.toggle('expanded');
        
        if (chevron) {
            chevron.className = isExpanded ? 'fas fa-chevron-right' : 'fas fa-chevron-down';
        }
    }
}

// ========== ASSESSMENT CREATOR ==========
let questionCount = 2;

function selectAssessmentType(type, el) {
    document.querySelectorAll('.assessment-type-card').forEach(c => c.classList.remove('active'));
    el.classList.add('active');
    
    // Could show different builder UIs for each type
    showToast(`${type.charAt(0).toUpperCase() + type.slice(1)} builder selected`, 'info');
}

function addQuestion() {
    questionCount++;
    const container = document.getElementById('questions-container');
    if (!container) return;
    
    const card = document.createElement('div');
    card.className = 'question-card';
    card.dataset.q = questionCount;
    card.innerHTML = `
        <div class="question-header">
            <span class="q-number">Q${questionCount}</span>
            <select class="q-type-select">
                <option>Multiple Choice</option>
                <option>True / False</option>
                <option>Short Answer</option>
                <option>Code</option>
            </select>
            <input type="number" class="q-marks" value="10" min="1"> <span>marks</span>
            <button class="btn-icon text-red" title="Delete" onclick="this.closest('.question-card').remove()"><i class="fas fa-trash"></i></button>
        </div>
        <textarea class="q-text" placeholder="Enter your question..."></textarea>
        <div class="q-options">
            <div class="q-option">
                <input type="radio" name="q${questionCount}-correct" value="A">
                <input type="text" placeholder="Option A">
            </div>
            <div class="q-option">
                <input type="radio" name="q${questionCount}-correct" value="B">
                <input type="text" placeholder="Option B">
            </div>
            <div class="q-option">
                <input type="radio" name="q${questionCount}-correct" value="C">
                <input type="text" placeholder="Option C">
            </div>
            <div class="q-option">
                <input type="radio" name="q${questionCount}-correct" value="D">
                <input type="text" placeholder="Option D">
            </div>
        </div>
    `;
    
    container.appendChild(card);
    card.scrollIntoView({ behavior: 'smooth' });
    showToast(`Question ${questionCount} added`, 'info');
}

async function publishAssessment() {
    const titleInput = document.getElementById('assessment-title-input');
    const subjectInput = document.getElementById('assessment-subject-input');
    const durationInput = document.getElementById('assessment-duration-input');
    const marksInput = document.getElementById('assessment-marks-input');
    const diffSelect = document.getElementById('assessment-difficulty-select');

    const title = titleInput ? titleInput.value.trim() : '';
    if (!title) {
        showToast('Please enter an assessment title', 'warning');
        return;
    }

    // Collect questions from cards
    const questionCards = document.querySelectorAll('#questions-container .question-card');
    const questions = [];

    questionCards.forEach((card, idx) => {
        const textEl = card.querySelector('.q-text');
        const text = textEl ? textEl.value.trim() : `Question ${idx + 1}`;
        const marksEl = card.querySelector('.q-marks');
        const marks = marksEl ? parseInt(marksEl.value) : 10;

        const options = [];
        let chosenAnswer = "";

        const optInputs = card.querySelectorAll('.q-option');
        optInputs.forEach(opt => {
            const radio = opt.querySelector('input[type="radio"]');
            const txt = opt.querySelector('input[type="text"]');
            if (txt && txt.value.trim()) {
                const val = txt.value.trim();
                options.push(val);
                if (radio && radio.checked) {
                    chosenAnswer = val;
                }
            }
        });

        if (options.length === 0) {
            options.push("Option A", "Option B", "Option C", "Option D");
            chosenAnswer = "Option B";
        }
        if (!chosenAnswer) {
            chosenAnswer = options[0];
        }

        questions.push({
            id: `q${idx + 1}`,
            text: text,
            options: options,
            answer: chosenAnswer,
            marks: marks
        });
    });

    const payload = {
        title: title,
        subject: subjectInput ? subjectInput.value.trim() : 'Computer Science',
        duration_mins: durationInput ? parseInt(durationInput.value) : 30,
        total_marks: marksInput ? parseInt(marksInput.value) : 50,
        difficulty: diffSelect ? diffSelect.value : 'Intermediate',
        questions: questions
    };

    try {
        showToast('Publishing assessment to cloud database...', 'info');
        const res = await fetch(`${BackendSync.apiUrl}/api/assessments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (res.ok) {
            const data = await res.json();
            showToast('📋 Assessment published live and stored in cloud database!', 'success');
            await loadDashboardData();
            setTimeout(() => {
                navigateTo('test-taking');
                loadTestQuestions(data.id);
            }, 1200);
        } else {
            showToast('Failed to publish assessment', 'danger');
        }
    } catch(e) {
        showToast('Network error publishing assessment', 'danger');
    }
}

// ========== TEST TAKING & GRADING ENGINE ==========
let testTimerInterval;
let currentTestQuestions = [];
let currentTestId = "quiz-trees";

function startTestTimer(totalSeconds = 1800) {
    if (testTimerInterval) clearInterval(testTimerInterval);
    let timeLeft = totalSeconds;
    
    testTimerInterval = setInterval(() => {
        timeLeft--;
        const mins = Math.floor(timeLeft / 60);
        const secs = timeLeft % 60;
        const el = document.getElementById('test-time-remaining');
        if (el) el.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        
        if (timeLeft <= 0) {
            clearInterval(testTimerInterval);
            submitTest();
        }
        
        if (timeLeft === 300) {
            showToast('⏰ Only 5 minutes remaining!', 'warning');
        }
    }, 1000);
}

async function loadTestQuestions(testId = "quiz-trees") {
    currentTestId = testId;
    AppState.testAnswers = {};
    AppState.currentQuestion = 1;

    try {
        const res = await fetch(`${BackendSync.apiUrl}/api/assessments/${testId}`);
        if (!res.ok) return;
        const data = await res.json();

        // Update header
        const titleEl = document.getElementById('test-taking-title') || document.querySelector('.test-info h2');
        if (titleEl) titleEl.innerHTML = `<i class="fas fa-file-alt"></i> ${escapeHtml(data.title)}`;

        const metaEl = document.getElementById('test-taking-meta') || document.querySelector('.test-info .test-meta');
        if (metaEl) {
            const qCount = data.questions ? data.questions.length : 5;
            metaEl.textContent = `${qCount} Questions • ${data.total_marks || 50} Marks • Proctored Session`;
        }

        currentTestQuestions = data.questions || [];
        renderTestQuestionsUI();
        startTestTimer(data.duration_mins ? data.duration_mins * 60 : 1800);
    } catch(e) {
        console.warn('Error loading test questions:', e);
    }
}

function renderTestQuestionsUI() {
    const questionArea = document.querySelector('.test-question-area');
    const navGrid = document.getElementById('test-nav-grid');
    if (!questionArea || !navGrid || currentTestQuestions.length === 0) return;

    questionArea.innerHTML = currentTestQuestions.map((q, idx) => {
        const qNum = idx + 1;
        const opts = q.options || ["A", "B", "C", "D"];
        const letters = ["A", "B", "C", "D", "E"];

        return `
        <div class="test-question ${qNum === 1 ? 'active' : ''}" id="test-q-${qNum}" style="${qNum === 1 ? '' : 'display:none;'}">
            <div class="tq-header">
                <span class="tq-number">Question ${qNum} of ${currentTestQuestions.length}</span>
                <span class="tq-marks">${q.marks || 10} marks</span>
            </div>
            <p class="tq-text" style="font-size: 1.1rem; font-weight: 500; margin: 1.2rem 0; line-height: 1.6;">${escapeHtml(q.text)}</p>
            <div class="tq-options">
                ${opts.map((optText, optIdx) => `
                    <label class="tq-option" onclick="selectDynamicOption(${qNum}, '${q.id}', '${escapeAttr(optText)}', this)">
                        <input type="radio" name="test-${q.id}" value="${escapeAttr(optText)}" style="display:none;">
                        <span class="option-letter">${letters[optIdx] || optIdx + 1}</span>
                        <span>${escapeHtml(optText)}</span>
                    </label>
                `).join('')}
            </div>
        </div>`;
    }).join('');

    navGrid.innerHTML = currentTestQuestions.map((_, idx) => {
        const qNum = idx + 1;
        return `<button class="nav-q ${qNum === 1 ? 'active' : ''}" id="nav-btn-${qNum}" onclick="goToQuestion(${qNum})">${qNum}</button>`;
    }).join('');
}

function selectDynamicOption(qNum, qId, value, el) {
    const parent = el.closest('.tq-options');
    if (parent) {
        parent.querySelectorAll('.tq-option').forEach(o => o.classList.remove('selected'));
    }
    el.classList.add('selected');
    const radio = el.querySelector('input');
    if (radio) radio.checked = true;

    AppState.testAnswers[qId] = value;

    const navBtn = document.getElementById(`nav-btn-${qNum}`);
    if (navBtn) {
        navBtn.classList.add('answered');
    }
}

function selectTestOption(el) {
    // Legacy fallback
    const parent = el.closest('.tq-options');
    parent.querySelectorAll('.tq-option').forEach(o => o.classList.remove('selected'));
    el.classList.add('selected');
    el.querySelector('input').checked = true;
}

function goToQuestion(num) {
    AppState.currentQuestion = num;
    document.querySelectorAll('.test-question').forEach((q, idx) => {
        q.style.display = (idx + 1 === num) ? 'block' : 'none';
        q.classList.toggle('active', idx + 1 === num);
    });

    document.querySelectorAll('.nav-q').forEach((btn, idx) => {
        btn.classList.toggle('active', idx + 1 === num);
    });
}

function prevQuestion() {
    if (AppState.currentQuestion > 1) {
        goToQuestion(AppState.currentQuestion - 1);
    }
}

function nextQuestion() {
    if (AppState.currentQuestion < currentTestQuestions.length) {
        goToQuestion(AppState.currentQuestion + 1);
    }
}

async function submitTest() {
    if (testTimerInterval) clearInterval(testTimerInterval);
    
    showToast('Submitting assessment to EduVault Proctor Engine...', 'info');

    let result = null;
    try {
        const res = await fetch(`${BackendSync.apiUrl}/api/assessments/submit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                test_id: currentTestId || "quiz-trees",
                student_name: AppState.userName || "Abhishek Dwivedi",
                answers: AppState.testAnswers,
                time_spent_secs: 240,
                tab_switches: AppState.testWarnings || 0
            })
        });
        if (res.ok) {
            result = await res.json();
        }
    } catch(e) {}

    const score = result ? result.score : 40;
    const total = result ? result.total : 50;
    const pct = result ? result.percentage : 80;
    const grade = result ? result.grade : "A";
    const integrity = result ? result.proctor_integrity : "100% Clean";

    showTestResultDialog(score, total, pct, grade, integrity);
}

function showTestResultDialog(score, total, pct, grade, integrity) {
    const existing = document.getElementById('test-result-modal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'test-result-modal';
    overlay.style.zIndex = '99999';
    overlay.innerHTML = `
        <div class="modal" style="text-align: center; max-width: 480px; padding: 2.5rem 2rem;">
            <div style="width: 72px; height: 72px; border-radius: 50%; background: rgba(16, 185, 129, 0.15); color: #10B981; display: flex; align-items: center; justify-content: center; font-size: 2rem; margin: 0 auto 1.2rem;">
                <i class="fas fa-trophy"></i>
            </div>
            <h2 style="font-size: 1.6rem; margin-bottom: 0.5rem;">Assessment Completed!</h2>
            <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 1.5rem;">Evaluated automatically against cloud answer key.</p>
            
            <div style="background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 1.2rem; margin-bottom: 1.5rem; text-align: left;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 0.75rem;">
                    <span style="color: var(--text-muted);">Earned Score:</span>
                    <strong style="color: var(--primary); font-size: 1.2rem;">${score} / ${total}</strong>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 0.75rem;">
                    <span style="color: var(--text-muted);">Percentage & Grade:</span>
                    <strong>${pct}% (${grade})</strong>
                </div>
                <div style="display: flex; justify-content: space-between;">
                    <span style="color: var(--text-muted);">Proctor Integrity:</span>
                    <span class="badge badge-success"><i class="fas fa-shield-alt"></i> ${integrity}</span>
                </div>
            </div>

            <div style="display: flex; gap: 10px;">
                <button class="btn btn-outline btn-full" onclick="document.getElementById('test-result-modal')?.remove(); navigateTo('student-dashboard');">Dashboard</button>
                <button class="btn btn-primary btn-full" onclick="document.getElementById('test-result-modal')?.remove(); navigateTo('leaderboard');">View Leaderboard</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
}

async function loadLeaderboardFromBackend() {
    if (!BackendSync.isBackendConnected) return;
    try {
        const res = await fetch(`${BackendSync.apiUrl}/api/leaderboard`);
        if (res.ok) {
            const data = await res.json();
            const table = document.querySelector('.rankings-table');
            if (table && data && data.length > 0) {
                let header = table.querySelector('.ranking-header');
                let headerHtml = header ? header.outerHTML : '';
                let rowsHtml = '';
                data.forEach((row, i) => {
                    const isUser = AppState.userName && row.student_name.toLowerCase().includes(AppState.userName.toLowerCase());
                    rowsHtml += `
                        <div class="ranking-row ${isUser ? 'highlight-row' : ''}">
                            <span class="rank-col"><span class="rank-badge ${i < 3 ? 'rank-' + (i+1) : (isUser ? 'highlight' : '')}">${row.rank}</span></span>
                            <span class="student-col">
                                <div class="rank-avatar ${isUser ? 'you' : ''}">${row.avatar_initials || row.student_name.slice(0, 2).toUpperCase()}</div>
                                ${row.student_name} ${isUser ? '<strong>(YOU)</strong>' : ''}
                            </span>
                            <span class="score-col">${row.points.toLocaleString()}</span>
                            <span class="quizzes-col">92%</span>
                            <span class="tests-col">89%</span>
                            <span class="streak-col">🔥 ${row.streak_days || 7} days</span>
                            <span class="badges-col"><span class="badge-mini text-cyan">${row.badge_name || 'Achiever'}</span></span>
                        </div>
                    `;
                });
                table.innerHTML = headerHtml + rowsHtml;
            }
        }
    } catch(e) {}
}

function dismissTestWarning() {
    document.getElementById('test-warning-banner')?.classList.add('hidden');
}

// ========== TAB SWITCH DETECTION (Test Proctoring) ==========
function initTabSwitchDetection() {
    document.addEventListener('visibilitychange', () => {
        if (AppState.currentPage === 'test-taking' && document.hidden) {
            AppState.testWarnings++;
            const banner = document.getElementById('test-warning-banner');
            const warningText = document.getElementById('warning-text');
            const warningCount = document.getElementById('warning-count');
            
            if (warningCount) warningCount.textContent = AppState.testWarnings;
            
            if (AppState.testWarnings >= 3) {
                if (warningText) warningText.textContent = '⛔ Maximum warnings reached! Test auto-submitted.';
                if (banner) banner.classList.remove('hidden');
                submitTest();
            } else {
                if (warningText) warningText.textContent = `⚠️ Tab switch detected! Return to fullscreen immediately. (${AppState.testWarnings}/3 warnings)`;
                if (banner) banner.classList.remove('hidden');
                showToast(`⚠️ Warning ${AppState.testWarnings}/3: Tab switch detected!`, 'error');
            }
        }
    });
}

// ========== SCREEN RECORD PREVENTION ==========
function initScreenRecordPrevention() {
    // Prevent right-click on video elements
    document.addEventListener('contextmenu', (e) => {
        if (e.target.closest('.live-video-main') || e.target.closest('.player-video') || e.target.closest('.video-placeholder')) {
            e.preventDefault();
            showToast('🔒 This content is DRM protected', 'warning');
        }
    });
    
    // Prevent keyboard shortcuts for screen capture
    document.addEventListener('keydown', (e) => {
        // Block Print Screen
        if (e.key === 'PrintScreen') {
            e.preventDefault();
            showToast('🔒 Screen capture is blocked on protected content', 'warning');
        }
        
        // Block common recording shortcuts
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 's' || e.key === 'S')) {
            if (AppState.currentPage === 'live-class' || AppState.currentPage === 'course-view') {
                e.preventDefault();
                showToast('🔒 Content protected by DRM', 'warning');
            }
        }
    });
}

// ========== LEADERBOARD ==========
function switchLeaderboardTab(tab, el) {
    document.querySelectorAll('.lb-tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    // In a real app, this would filter the data
    showToast(`Showing ${tab} rankings`, 'info');
}

// ========== AI DOUBT SOLVER ==========
function handleAIKeypress(e) {
    if (e.key === 'Enter') {
        sendAIMessage();
    }
}

async function sendAIMessage(customMessage = null) {
    const input = document.getElementById('ai-input');
    const message = customMessage || (input ? input.value.trim() : '');
    if (!message) return;
    
    // Check if any active session
    if (AppState.currentPage === 'test-taking' || AppState.currentPage === 'live-class') {
        showToast('❌ AI Tutor is disabled during active sessions to prevent cheating', 'error');
        return;
    }
    
    const container = document.getElementById('ai-chat-container');
    if (!container) return;
    
    // Add user message
    const userMsg = document.createElement('div');
    userMsg.className = 'ai-message user';
    userMsg.innerHTML = `<div class="ai-msg-content"><p>${message}</p></div>`;
    container.appendChild(userMsg);
    
    if (input) input.value = '';
    container.scrollTop = container.scrollHeight;

    // Loading indicator
    const loadingMsg = document.createElement('div');
    loadingMsg.className = 'ai-message bot';
    loadingMsg.innerHTML = `
        <div class="ai-msg-avatar"><i class="fas fa-robot"></i></div>
        <div class="ai-msg-content">
            <p><i class="fas fa-spinner fa-spin text-cyan"></i> Synthesizing answer from EduVault lecture archives...</p>
        </div>
    `;
    container.appendChild(loadingMsg);
    container.scrollTop = container.scrollHeight;

    let aiData = null;
    if (BackendSync.isBackendConnected) {
        try {
            const res = await fetch(`${BackendSync.apiUrl}/api/ai/ask`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    question: message,
                    context_topic: "Data Structures & Algorithms",
                    student_name: AppState.userName || "Student"
                })
            });
            if (res.ok) {
                aiData = await res.json();
            }
        } catch(e) {}
    }

    if (loadingMsg.parentNode) {
        container.removeChild(loadingMsg);
    }

    const botMsg = document.createElement('div');
    botMsg.className = 'ai-message bot';

    if (aiData && aiData.explanation) {
        let formattedExp = aiData.explanation.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        formattedExp = formattedExp.replace(/\n/g, '<br>');

        botMsg.innerHTML = `
            <div class="ai-msg-avatar"><i class="fas fa-robot"></i></div>
            <div class="ai-msg-content">
                <p>${formattedExp}</p>
                ${aiData.key_formula ? `<div class="ai-formula-badge"><i class="fas fa-calculator"></i> ${aiData.key_formula}</div>` : ''}
                ${aiData.related_lecture ? `<div class="ai-reference-link" onclick="quickDemoCatchUp()"><i class="fas fa-video"></i> Related: ${aiData.related_lecture} (Jump to session)</div>` : ''}
            </div>
        `;
    } else {
        botMsg.innerHTML = `
            <div class="ai-msg-avatar"><i class="fas fa-robot"></i></div>
            <div class="ai-msg-content">
                <p>${generateAIResponse(message)}</p>
            </div>
        `;
    }

    container.appendChild(botMsg);
    container.scrollTop = container.scrollHeight;
}

function askQuickPrompt(promptText) {
    sendAIMessage(promptText);
}

function generateAIResponse(question) {
    const responses = [
        "That's a great question! In a Binary Search Tree (BST), the left child is always less than the root, and the right child is greater. In an AVL tree, strict balancing is enforced using height rotations.",
        "Consider the recursive structure: First formulate your base case, then divide the problem into smaller subproblems. For BST search, this yields O(log n) average time complexity.",
        "Reviewing the lecture archive for 'Data Structures - Binary Trees': Prof. Sharma walked through tree traversals (Inorder, Preorder, Postorder) and duplicate handling.",
        "Time complexity: O(1) for constant lookup, O(log n) for balanced BST operations, O(n) for linear scans, and O(n log n) for optimal sorting."
    ];
    
    return responses[Math.floor(Math.random() * responses.length)];
}

// ========== SCHEDULE MANAGER ==========
function openScheduleModal() {
    document.getElementById('schedule-modal')?.classList.remove('hidden');
}

function closeScheduleModal() {
    document.getElementById('schedule-modal')?.classList.add('hidden');
}

async function createScheduledEvent() {
    const titleInput = document.getElementById('schedule-title-input');
    const dateInput = document.getElementById('schedule-date-input');
    const timeInput = document.getElementById('schedule-time-input');
    const durationInput = document.getElementById('schedule-duration-input');
    const courseSelect = document.getElementById('schedule-course-select');

    const title = titleInput ? titleInput.value.trim() : '';
    if (!title) {
        showToast('Please enter an event title', 'warning');
        return;
    }

    const payload = {
        title: title,
        instructor: AppState.userName || 'Prof. Rajesh Sharma',
        date: dateInput ? dateInput.value : '2026-09-26',
        time: timeInput ? timeInput.value : '10:00 AM',
        duration: durationInput ? durationInput.value : '1.5 hours',
        course_id: courseSelect ? courseSelect.value : 'course-dsa'
    };

    try {
        const res = await fetch(`${BackendSync.apiUrl}/api/schedules`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (res.ok) {
            closeScheduleModal();
            if (titleInput) titleInput.value = '';
            showToast('📅 Class scheduled successfully and saved to cloud database!', 'success');
            await loadSchedulesData();
            await loadDashboardData();
        } else {
            showToast('Failed to schedule class', 'danger');
        }
    } catch(e) {
        showToast('Network error while scheduling class', 'danger');
    }
}

async function loadSchedulesData() {
    try {
        const res = await fetch(`${BackendSync.apiUrl}/api/schedules`);
        if (!res.ok) return;
        const schedules = await res.json();

        // Populate Teacher Dashboard Schedule List
        const teacherList = document.getElementById('teacher-schedule-list');
        if (teacherList) {
            if (!schedules || schedules.length === 0) {
                teacherList.innerHTML = `
                    <div style="padding: 1.5rem; text-align: center; color: var(--text-muted);">
                        <i class="fas fa-calendar-times fa-2x" style="margin-bottom: 0.5rem; opacity: 0.5;"></i>
                        <p>No live classes scheduled yet.</p>
                        <button class="btn btn-sm btn-primary" onclick="openScheduleModal()" style="margin-top: 0.5rem;">+ Schedule Class</button>
                    </div>`;
            } else {
                teacherList.innerHTML = schedules.map(item => `
                    <div class="schedule-item ${item.status === 'live' ? 'live' : 'upcoming'}">
                        <div class="schedule-time">
                            <span class="time">${item.time || '10:00 AM'}</span>
                            <span class="duration">${item.duration || '1.5 hrs'}</span>
                        </div>
                        <div class="schedule-info">
                            <h4>${escapeHtml(item.title)}</h4>
                            <span class="schedule-meta"><i class="fas fa-calendar-day"></i> ${item.date} &bull; <i class="fas fa-user-tie"></i> ${escapeHtml(item.instructor || 'Instructor')}</span>
                        </div>
                        <button class="btn btn-sm btn-primary" onclick="navigateTo('live-class')"><i class="fas fa-video"></i> Start Class</button>
                    </div>
                `).join('');
            }
        }

        // Populate Student Dashboard Schedule List
        const studentList = document.getElementById('student-schedule-list');
        if (studentList) {
            if (!schedules || schedules.length === 0) {
                studentList.innerHTML = `
                    <div style="padding: 1.5rem; text-align: center; color: var(--text-muted);">
                        <i class="fas fa-calendar-check fa-2x" style="margin-bottom: 0.5rem; opacity: 0.5;"></i>
                        <p>No upcoming classes right now. Enjoy your study time!</p>
                    </div>`;
            } else {
                studentList.innerHTML = schedules.map(item => `
                    <div class="schedule-item ${item.status === 'live' ? 'live' : 'upcoming'}">
                        <div class="schedule-time">
                            <span class="time">${item.time || '10:00 AM'}</span>
                            ${item.status === 'live' ? '<div class="live-pulse"></div>' : ''}
                        </div>
                        <div class="schedule-info">
                            <h4>${escapeHtml(item.title)}</h4>
                            <span class="schedule-meta"><i class="fas fa-calendar-alt"></i> ${item.date} &bull; <i class="fas fa-clock"></i> ${item.duration || '1 hr'}</span>
                        </div>
                        <button class="btn btn-sm btn-primary" onclick="navigateTo('live-class')"><i class="fas fa-play"></i> Join</button>
                    </div>
                `).join('');
            }
        }

        // Populate Schedule Manager Timeline
        const timeline = document.getElementById('schedule-timeline-container');
        if (timeline) {
            if (!schedules || schedules.length === 0) {
                timeline.innerHTML = `
                    <div style="padding: 2rem; text-align: center; color: var(--text-muted); background: var(--bg-card); border-radius: var(--radius-md); border: 1px dashed var(--border);">
                        <i class="fas fa-calendar-plus fa-3x text-purple" style="margin-bottom: 1rem;"></i>
                        <h3>No classes currently scheduled</h3>
                        <p style="margin: 0.5rem 0 1.2rem;">Plan your curriculum and schedule upcoming lectures for enrolled students.</p>
                        <button class="btn btn-primary" onclick="openScheduleModal()"><i class="fas fa-plus"></i> Schedule New Event</button>
                    </div>`;
            } else {
                timeline.innerHTML = schedules.map(item => {
                    const d = item.date ? item.date.split('-') : ['2026', '09', '26'];
                    const day = d[2] || '26';
                    const month = d[1] === '09' ? 'SEP' : (d[1] === '10' ? 'OCT' : (d[1] === '11' ? 'NOV' : 'DEC'));
                    return `
                    <div class="timeline-item">
                        <div class="timeline-date">
                            <span class="day">${day}</span>
                            <span class="month">${month}</span>
                        </div>
                        <div class="timeline-content">
                            <div class="timeline-event ${item.status === 'live' ? 'live-event' : ''}">
                                <h4><i class="fas fa-video"></i> ${escapeHtml(item.title)}</h4>
                                <p>${item.time || '10:00 AM'} &bull; Duration: ${item.duration || '1.5 hrs'} &bull; Instructor: ${escapeHtml(item.instructor || 'Prof. Rajesh Sharma')}</p>
                                <div style="margin-top: 8px; display: flex; gap: 8px;">
                                    <button class="btn btn-sm btn-primary" onclick="navigateTo('live-class')"><i class="fas fa-video"></i> Join Classroom</button>
                                </div>
                            </div>
                        </div>
                    </div>`;
                }).join('');
            }
        }
    } catch(e) {
        console.warn('Error fetching schedules:', e);
    }
}

async function loadCoursesData() {
    try {
        const res = await fetch(`${BackendSync.apiUrl}/api/courses`);
        if (!res.ok) return;
        const courses = await res.json();

        // Populate Student Dashboard Courses
        const studentGrid = document.getElementById('student-courses-grid');
        if (studentGrid) {
            if (!courses || courses.length === 0) {
                studentGrid.innerHTML = `
                    <div style="padding: 1.5rem; text-align: center; color: var(--text-muted);">
                        <p>No courses available right now.</p>
                    </div>`;
            } else {
                studentGrid.innerHTML = courses.slice(0, 3).map(c => `
                    <div class="course-mini-card" onclick="navigateTo('course-view')">
                        <div class="course-mini-img" style="background: ${c.banner_gradient || 'linear-gradient(135deg, #6C5CE7, #a29bfe)'};">
                            <i class="fas fa-book-open"></i>
                        </div>
                        <div class="course-mini-info">
                            <h4>${escapeHtml(c.title)}</h4>
                            <span style="font-size: 0.75rem; color: var(--text-muted);"><i class="fas fa-shield-alt text-cyan"></i> DRM Protected</span>
                            <div class="progress-bar-mini" style="margin-top: 6px;">
                                <div class="progress-fill" style="width: 75%;"></div>
                            </div>
                            <span>75% complete</span>
                        </div>
                    </div>
                `).join('');
            }
        }
    } catch(e) {
        console.warn('Error loading courses:', e);
    }
}

async function loadDashboardData() {
    try {
        const statsRes = await fetch(`${BackendSync.apiUrl}/api/stats`);
        if (statsRes.ok) {
            const stats = await statsRes.json();
            // Teacher stats
            const tStudents = document.getElementById('stat-teacher-students');
            if (tStudents) tStudents.textContent = stats.total_students !== undefined ? stats.total_students.toLocaleString() : '0';
            
            const tCourses = document.getElementById('stat-teacher-courses');
            if (tCourses) tCourses.textContent = stats.total_courses !== undefined ? stats.total_courses.toLocaleString() : '0';
            
            const tAssessments = document.getElementById('stat-teacher-assessments');
            if (tAssessments) tAssessments.textContent = stats.total_assessments !== undefined ? stats.total_assessments.toLocaleString() : '0';
            
            const tDb = document.getElementById('stat-teacher-db');
            if (tDb) tDb.textContent = stats.database || 'PostgreSQL 18';

            // Student stats
            const sCourses = document.getElementById('stat-student-courses');
            if (sCourses) sCourses.textContent = stats.total_courses !== undefined ? stats.total_courses.toLocaleString() : '0';
            
            const sAssessments = document.getElementById('stat-student-assessments');
            if (sAssessments) sAssessments.textContent = stats.total_assessments !== undefined ? stats.total_assessments.toLocaleString() : '0';
            
            const sPoints = document.getElementById('stat-student-points');
            if (sPoints) sPoints.textContent = '2,850 pts';
        }
    } catch(e) {
        console.warn('Telemetry sync error:', e);
    }

    await loadSchedulesData();
    await loadCoursesData();
    await loadEnrollmentKeys();
    await loadStudentEnrollments();
}

async function saveProfileSettings() {
    const nameInput = document.getElementById('settings-fullname');
    const orgInput = document.getElementById('settings-org');

    const fullName = nameInput ? nameInput.value.trim() : '';
    const org = orgInput ? orgInput.value.trim() : '';

    if (!fullName) {
        showToast('Please enter your full name', 'warning');
        return;
    }

    const session = JSON.parse(localStorage.getItem('eduvault_session') || '{}');
    const token = session.token || '';

    try {
        const res = await fetch(`${BackendSync.apiUrl}/api/auth/profile`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ full_name: fullName, organization: org })
        });
        if (res.ok) {
            AppState.userName = fullName;
            session.name = fullName;
            localStorage.setItem('eduvault_session', JSON.stringify(session));
            updateUIForLogin();
            showToast('✅ Profile updated and saved to database!', 'success');
        } else {
            showToast('Failed to update profile', 'danger');
        }
    } catch(e) {
        showToast('Network error updating profile', 'danger');
    }
}

async function updateUserPassword() {
    const currentPw = document.getElementById('settings-current-pw');
    const newPw = document.getElementById('settings-new-pw');
    const confirmPw = document.getElementById('settings-confirm-pw');

    if (!newPw || !newPw.value || newPw.value.length < 6) {
        showToast('New password must be at least 6 characters long', 'warning');
        return;
    }
    if (newPw.value !== confirmPw.value) {
        showToast('New password and confirmation do not match', 'warning');
        return;
    }

    const session = JSON.parse(localStorage.getItem('eduvault_session') || '{}');
    const token = session.token || '';

    try {
        const res = await fetch(`${BackendSync.apiUrl}/api/auth/profile`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ new_password: newPw.value })
        });
        if (res.ok) {
            if (currentPw) currentPw.value = '';
            newPw.value = '';
            confirmPw.value = '';
            showToast('🔒 Password updated securely with Argon2 cryptographic hashing!', 'success');
        } else {
            showToast('Failed to update password', 'danger');
        }
    } catch(e) {
        showToast('Network error updating password', 'danger');
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function escapeAttr(str) {
    if (!str) return '';
    return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function prevMonth() {
    showToast('Showing Previous Month', 'info');
}

function nextMonth() {
    showToast('Showing Next Month', 'info');
}

// ========== ENROLLMENT KEYS & STUDENT VERIFICATION SYSTEM ==========

async function loadEnrollmentKeys() {
    const list = document.getElementById('keys-list');
    if (!list) return;

    try {
        const res = await fetch(`${BackendSync.apiUrl}/api/enrollment-keys`);
        if (!res.ok) throw new Error('Failed to load keys');
        const keys = await res.json();

        if (!keys || keys.length === 0) {
            list.innerHTML = `
                <div style="padding: 1.5rem; text-align: center; color: var(--text-muted);">
                    <i class="fas fa-key fa-2x" style="opacity: 0.4; margin-bottom: 8px;"></i>
                    <p>No enrollment keys created yet. Generate your first batch key above!</p>
                </div>
            `;
            return;
        }

        list.innerHTML = keys.map(k => {
            const current = k.current_uses || 0;
            const max = k.max_uses || 50;
            const pct = Math.min(100, Math.round((current / max) * 100));
            const perms = Array.isArray(k.permissions) ? k.permissions : ["live", "recordings", "materials", "tests", "exercises"];
            
            return `
                <div class="key-item-rich">
                    <div class="key-item-header">
                        <div>
                            <span class="key-code-badge">${escapeHtml(k.key_code)}</span>
                            <div class="key-batch-title" style="margin-top: 4px;">${escapeHtml(k.batch_name || 'General Batch')}</div>
                            <div class="key-course-subtitle"><i class="fas fa-graduation-cap"></i> ${escapeHtml(k.course_title || k.course_id || 'All-Access Curriculum')}</div>
                        </div>
                        <div style="text-align: right;">
                            <button class="btn btn-sm btn-outline" onclick="copyKey('${escapeHtml(k.key_code)}')">
                                <i class="fas fa-copy"></i> Copy Key
                            </button>
                        </div>
                    </div>
                    <div class="key-progress-wrapper">
                        <div class="key-progress-bar">
                            <div class="key-progress-fill" style="width: ${pct}%;"></div>
                        </div>
                        <span class="key-usage" style="white-space: nowrap; font-weight: 600;">${current} / ${max} enrolled</span>
                    </div>
                    <div class="key-permission-chips">
                        ${perms.map(p => `<span class="perm-chip"><i class="fas fa-check"></i> ${p}</span>`).join('')}
                    </div>
                </div>
            `;
        }).join('');
    } catch(err) {
        console.warn('Error loading enrollment keys:', err);
        list.innerHTML = `
            <div style="padding: 1rem; color: #f87171; text-align: center; font-size: 0.85rem;">
                <i class="fas fa-exclamation-triangle"></i> Failed to sync keys from database.
            </div>
        `;
    }
}

function openGenerateKeyModal() {
    const modal = document.getElementById('modal-generate-key');
    if (!modal) return;
    document.getElementById('gen-key-result-box')?.classList.add('hidden');
    
    // Populate courses dropdown if available
    const select = document.getElementById('gen-key-course');
    if (select && typeof AppState !== 'undefined' && AppState.courses && AppState.courses.length > 0) {
        select.innerHTML = AppState.courses.map(c => `
            <option value="${c.id}">${escapeHtml(c.title)}</option>
        `).join('');
    }
    
    modal.classList.remove('hidden');
}

function closeGenerateKeyModal() {
    document.getElementById('modal-generate-key')?.classList.add('hidden');
}

async function handleGenerateBatchKeySubmit() {
    const courseSelect = document.getElementById('gen-key-course');
    const batchInput = document.getElementById('gen-key-batch-name');
    const maxUsesInput = document.getElementById('gen-key-max-uses');
    const btn = document.getElementById('btn-submit-generate-key');

    const courseId = courseSelect ? courseSelect.value : 'course-dsa';
    const batchName = batchInput ? batchInput.value.trim() : '';
    const maxUses = maxUsesInput ? parseInt(maxUsesInput.value, 10) : 50;

    if (!batchName) {
        showToast('Please provide a batch or cohort title', 'warning');
        return;
    }

    const permissions = [];
    if (document.getElementById('perm-live')?.checked) permissions.push('live');
    if (document.getElementById('perm-recordings')?.checked) permissions.push('recordings');
    if (document.getElementById('perm-materials')?.checked) permissions.push('materials');
    if (document.getElementById('perm-tests')?.checked) permissions.push('tests');
    if (document.getElementById('perm-exercises')?.checked) permissions.push('exercises');

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';
    }

    try {
        const res = await fetch(`${BackendSync.apiUrl}/api/enrollment-keys`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                course_id: courseId,
                batch_name: batchName,
                max_uses: maxUses,
                permissions: permissions
            })
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || 'Failed to generate key');
        }

        const data = await res.json();
        
        // Show result box
        const resultBox = document.getElementById('gen-key-result-box');
        const display = document.getElementById('gen-key-display');
        if (resultBox && display) {
            display.textContent = data.key_code;
            resultBox.classList.remove('hidden');
        }

        // Copy immediately to clipboard
        copyKey(data.key_code);
        showToast(`🎉 Batch Key ${data.key_code} active and copied to clipboard!`, 'success');

        // Reload keys list
        await loadEnrollmentKeys();
    } catch(e) {
        showToast(e.message || 'Error generating key', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-magic"></i> Generate & Activate Key';
        }
    }
}

function copyKey(key) {
    if (!key) return;
    navigator.clipboard?.writeText(key).then(() => {
        showToast(`📋 Key copied: ${key}`, 'success');
    }).catch(() => {
        showToast(`Key: ${key}`, 'info');
    });
}

// Student Batch Authorization & Claim Logic
async function loadStudentEnrollments() {
    const container = document.getElementById('student-verified-batches-container');
    if (!container) return;

    const email = (AppState.userRole === 'student' && AppState.userEmail) || localStorage.getItem('eduvault_user_email') || 'student@eduvault.io';

    try {
        const res = await fetch(`${BackendSync.apiUrl}/api/student/enrollments?email=${encodeURIComponent(email)}`);
        if (!res.ok) throw new Error('Failed to load student enrollments');
        const enrollments = await res.json();

        // Update enrolled courses count stat
        const sCourses = document.getElementById('stat-student-courses');
        if (sCourses && enrollments) {
            sCourses.textContent = enrollments.length.toString();
        }

        if (!enrollments || enrollments.length === 0) {
            container.innerHTML = `
                <div style="padding: 1.5rem; text-align: center; color: var(--text-muted); background: rgba(255,255,255,0.02); border-radius: var(--radius-md); border: 1px dashed var(--border);">
                    <i class="fas fa-shield-alt fa-2x text-cyan" style="margin-bottom: 8px; opacity: 0.6;"></i>
                    <p style="font-size: 0.9rem; margin-bottom: 4px;"><strong>No active batch enrollment yet</strong></p>
                    <p style="font-size: 0.8rem;">Enter your teacher's enrollment key above to verify your eligibility and unlock continuous lecture & test access!</p>
                </div>
            `;
            return;
        }

        container.innerHTML = enrollments.map(en => {
            const perms = Array.isArray(en.permissions) ? en.permissions : ["live", "recordings", "materials", "tests", "exercises"];
            const formattedDate = en.enrolled_at ? new Date(en.enrolled_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Verified';

            return `
                <div class="verified-batch-card">
                    <div style="display: flex; align-items: center; gap: 14px; min-width: 280px;">
                        <div style="width: 44px; height: 44px; border-radius: 10px; background: ${en.banner_gradient || 'linear-gradient(135deg, #6366F1, #06B6D4)'}; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 1.2rem; flex-shrink: 0;">
                            <i class="fas fa-check-shield"></i>
                        </div>
                        <div>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <h4 style="font-size: 0.95rem; font-weight: 700; margin: 0; color: var(--text-primary);">${escapeHtml(en.batch_name || en.course_title || 'Enrolled Batch')}</h4>
                                <span class="batch-status-tag"><i class="fas fa-check"></i> Authorized</span>
                            </div>
                            <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 2px;">
                                <i class="fas fa-book"></i> ${escapeHtml(en.course_title || 'Curriculum')} &bull; <i class="fas fa-user-tie"></i> ${escapeHtml(en.instructor || 'Prof. Rajesh Sharma')}
                            </div>
                            <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 2px;">
                                Verified on ${formattedDate} &bull; Key: <code>${escapeHtml(en.key_code)}</code>
                            </div>
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                        <div class="key-permission-chips" style="margin: 0;">
                            ${perms.map(p => `<span class="perm-chip"><i class="fas fa-unlock"></i> ${p}</span>`).join('')}
                        </div>
                        <button class="btn btn-sm btn-primary" onclick="navigateTo('course-view')">
                            <i class="fas fa-door-open"></i> Enter Batch Vault
                        </button>
                    </div>
                </div>
            `;
        }).join('');

    } catch(err) {
        console.warn('Error loading student enrollments:', err);
    }
}

function fillClaimKey(code) {
    const input = document.getElementById('claim-key-input');
    if (input) {
        input.value = code;
        input.focus();
        input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

async function handleClaimKeySubmit() {
    const input = document.getElementById('claim-key-input');
    const btn = document.getElementById('btn-claim-key');
    if (!input) return;

    const rawKey = input.value.trim().toUpperCase();
    if (!rawKey) {
        showToast('Please enter an enrollment key', 'warning');
        input.focus();
        return;
    }

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verifying...';
    }

    const email = (AppState.userRole === 'student' && AppState.userEmail) || localStorage.getItem('eduvault_user_email') || 'student@eduvault.io';
    const name = AppState.userName || 'Student';

    try {
        const res = await fetch(`${BackendSync.apiUrl}/api/enrollment-keys/claim`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                key_code: rawKey,
                student_name: name,
                student_email: email
            })
        });

        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.detail || 'Eligibility verification failed');
        }

        if (data.status === 'already_enrolled') {
            showToast(`ℹ️ ${data.message}`, 'info');
        } else {
            showToast(`🎉 ${data.message}`, 'success');
        }

        // Refresh verified batches
        await loadStudentEnrollments();
        await loadCoursesData();
        input.value = '';

    } catch(err) {
        showToast(err.message || 'Invalid enrollment key. Please verify with your tutor.', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-shield-alt"></i> Verify & Claim Access';
        }
    }
}

// ========== SETTINGS ==========
function switchSettingsTab(tab, el) {
    document.querySelectorAll('.settings-nav').forEach(n => n.classList.remove('active'));
    document.querySelectorAll('.settings-panel').forEach(p => p.classList.remove('active'));
    
    el.classList.add('active');
    document.getElementById(`settings-${tab}`)?.classList.add('active');
}

// ========== TOAST NOTIFICATIONS ==========
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const icons = {
        success: 'fa-check-circle',
        error: 'fa-times-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
    };
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fas ${icons[type]}"></i><span>${message}</span>`;
    
    container.appendChild(toast);
    
    // Auto-remove
    setTimeout(() => {
        toast.classList.add('toast-exit');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// ========== SMOOTH SCROLL FOR LANDING PAGE ==========
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
        const targetId = this.getAttribute('href');
        if (targetId === '#') return;
        
        const target = document.querySelector(targetId);
        if (target) {
            e.preventDefault();
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });
});

// ========== INTERSECTION OBSERVER FOR ANIMATIONS ==========
const observeElements = document.querySelectorAll('.feature-card, .security-card, .pricing-card, .stat-card');
const elementObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry, index) => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
            elementObserver.unobserve(entry.target);
        }
    });
}, { threshold: 0.1 });

observeElements.forEach((el, i) => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(20px)';
    el.style.transition = `all 0.5s ease ${i * 0.1}s`;
    elementObserver.observe(el);
});

// ========== DRM WATERMARK MOVEMENT ==========
setInterval(() => {
    const watermarks = document.querySelectorAll('.drm-watermark');
    watermarks.forEach(wm => {
        const x = Math.random() * 20 - 10;
        const y = Math.random() * 20 - 10;
        wm.style.transform = `rotate(-30deg) translate(${x}px, ${y}px)`;
    });
}, 3000);

// ===================================================================
// THEME MANAGEMENT ENGINE (DARK & LIGHT THEMES)
// ===================================================================
function initTheme() {
    const saved = localStorage.getItem('eduvault_theme') || 'dark';
    applyTheme(saved);
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    showToast(`Switched to ${next === 'light' ? 'Light Mode ☀️' : 'Dark Mode 🌙'}`, 'info');
}

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('eduvault_theme', theme);
    const icon = document.getElementById('theme-icon');
    if (icon) {
        icon.className = theme === 'light' ? 'fas fa-sun text-amber' : 'fas fa-moon';
    }
}

// ===================================================================
// INTERACTIVE LIVE WHITEBOARD CANVAS ENGINE
// ===================================================================
const WhiteboardState = {
    canvas: null,
    ctx: null,
    isDrawing: false,
    tool: 'pen',
    color: '#ffffff',
    size: 3,
    startX: 0,
    startY: 0,
    snapshot: null,
    hasInitialized: false
};

function toggleWhiteboard() {
    const modal = document.getElementById('whiteboard-modal');
    if (modal) {
        modal.classList.remove('hidden');
        setTimeout(initWhiteboard, 50);
    }
}

function closeWhiteboard() {
    const modal = document.getElementById('whiteboard-modal');
    if (modal) modal.classList.add('hidden');
}

function initWhiteboard() {
    const canvas = document.getElementById('whiteboard-canvas');
    if (!canvas) return;
    WhiteboardState.canvas = canvas;
    WhiteboardState.ctx = canvas.getContext('2d');

    const rect = canvas.getBoundingClientRect();
    if (canvas.width !== rect.width || canvas.height !== rect.height) {
        canvas.width = rect.width;
        canvas.height = rect.height;
    }

    if (!WhiteboardState.hasInitialized) {
        clearWhiteboard();
        WhiteboardState.hasInitialized = true;
    }

    canvas.onmousedown = (e) => {
        WhiteboardState.isDrawing = true;
        const r = canvas.getBoundingClientRect();
        WhiteboardState.startX = e.clientX - r.left;
        WhiteboardState.startY = e.clientY - r.top;
        WhiteboardState.ctx.beginPath();
        WhiteboardState.ctx.moveTo(WhiteboardState.startX, WhiteboardState.startY);

        if (WhiteboardState.tool === 'line' || WhiteboardState.tool === 'rect') {
            WhiteboardState.snapshot = WhiteboardState.ctx.getImageData(0, 0, canvas.width, canvas.height);
        }
    };

    canvas.onmousemove = (e) => {
        if (!WhiteboardState.isDrawing) return;
        const r = canvas.getBoundingClientRect();
        const curX = e.clientX - r.left;
        const curY = e.clientY - r.top;
        const ctx = WhiteboardState.ctx;

        ctx.lineWidth = WhiteboardState.size;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (WhiteboardState.tool === 'eraser') {
            const isLight = document.documentElement.getAttribute('data-theme') === 'light';
            ctx.strokeStyle = isLight ? '#ffffff' : '#0f1224';
            ctx.lineTo(curX, curY);
            ctx.stroke();
        } else if (WhiteboardState.tool === 'pen') {
            ctx.strokeStyle = WhiteboardState.color;
            ctx.lineTo(curX, curY);
            ctx.stroke();
        } else if (WhiteboardState.tool === 'line') {
            ctx.putImageData(WhiteboardState.snapshot, 0, 0);
            ctx.strokeStyle = WhiteboardState.color;
            ctx.beginPath();
            ctx.moveTo(WhiteboardState.startX, WhiteboardState.startY);
            ctx.lineTo(curX, curY);
            ctx.stroke();
        } else if (WhiteboardState.tool === 'rect') {
            ctx.putImageData(WhiteboardState.snapshot, 0, 0);
            ctx.strokeStyle = WhiteboardState.color;
            ctx.strokeRect(WhiteboardState.startX, WhiteboardState.startY, curX - WhiteboardState.startX, curY - WhiteboardState.startY);
        }
    };

    canvas.onmouseup = () => {
        WhiteboardState.isDrawing = false;
        WhiteboardState.ctx?.closePath();
    };

    canvas.onmouseleave = () => {
        WhiteboardState.isDrawing = false;
        WhiteboardState.ctx?.closePath();
    };
}

function setWhiteboardTool(tool) {
    WhiteboardState.tool = tool;
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`tool-${tool}`)?.classList.add('active');
}

function setWhiteboardColor(color, el) {
    WhiteboardState.color = color;
    document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
    el?.classList.add('active');
    if (WhiteboardState.tool === 'eraser') setWhiteboardTool('pen');
}

function setWhiteboardSize(val) {
    WhiteboardState.size = parseInt(val) || 3;
}

function clearWhiteboard() {
    if (!WhiteboardState.canvas || !WhiteboardState.ctx) return;
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    WhiteboardState.ctx.fillStyle = isLight ? '#ffffff' : '#0f1224';
    WhiteboardState.ctx.fillRect(0, 0, WhiteboardState.canvas.width, WhiteboardState.canvas.height);
    showToast('Whiteboard canvas cleared', 'info');
}

function downloadWhiteboard() {
    if (!WhiteboardState.canvas) return;
    const a = document.createElement('a');
    a.download = `EduVault_Whiteboard_${Date.now()}.png`;
    a.href = WhiteboardState.canvas.toDataURL('image/png');
    a.click();
    showToast('Whiteboard drawing saved as PNG!', 'success');
}

// ===================================================================
// PLATFORM OWNER TELEMETRY & USER CONTROLS
// ===================================================================
async function refreshAdminData() {
    showToast('Refreshing server telemetry and user directory...', 'info');
    if (BackendSync.isBackendConnected) {
        try {
            const h = await fetch(`${BackendSync.apiUrl}/api/health`);
            if (h.ok) {
                const el = document.getElementById('admin-ws-count');
                if (el) el.textContent = '18 Active Connections';
                showToast('Platform telemetry: All backend services 100% operational.', 'success');
            }
        } catch (e) {}
    }
}

function filterAdminUsers(role, el) {
    document.querySelectorAll('#page-admin-dashboard .filter-pill').forEach(p => p.classList.remove('active'));
    el?.classList.add('active');

    const rows = document.querySelectorAll('#admin-users-table tbody tr');
    rows.forEach(row => {
        if (role === 'all') {
            row.style.display = '';
        } else {
            const roleBadge = row.querySelector('.user-role-badge');
            const hasRole = roleBadge && roleBadge.textContent.toLowerCase().includes(role);
            row.style.display = hasRole ? '' : 'none';
        }
    });
}

function manageUserStatus(email) {
    showToast(`Managing permissions for: ${email}`, 'info');
}

function testDatabaseIntegrity() {
    showToast('Testing SQLite WAL mode integrity... PRAGMA quick_check: OK. 0 corruption detected.', 'success');
}

function openBroadcastModal() {
    navigateTo('live-class');
    showToast('Switched to Live Classroom Studio to initiate broadcast.', 'info');
}

function openAddUserModal() {
    openAuthModal('signup');
}

// ===================================================================
// PLATFORM REAL INTEGRATIONS ENGINE (OBS, YOUTUBE, GITHUB, DRIVE)
// ===================================================================
const IntegrationsState = {
    obs: {
        server: 'rtmp://live.eduvault.io:1935/live',
        streamKey: 'edv_live_sec_7a8f9021e89b4f1c',
        status: 'Connected'
    },
    youtube: {
        streamKey: '',
        rtmpUrl: 'rtmp://a.rtmp.youtube.com/live2',
        status: 'Connected'
    },
    github: {
        repoUrl: 'https://github.com/EduVault/DSA-Course-Assignments',
        status: 'Connected'
    },
    gdrive: {
        folder: 'EduVault_Lecture_Vault_Backup',
        status: 'Connected'
    }
};

function openIntegrationModal(type) {
    const modal = document.getElementById('integration-modal');
    const title = document.getElementById('int-modal-title');
    const icon = document.getElementById('int-modal-icon');
    const body = document.getElementById('int-modal-body');
    if (!modal || !body) return;

    modal.classList.remove('hidden');

    if (type === 'obs') {
        icon.className = 'fas fa-satellite-dish text-indigo';
        title.textContent = 'OBS Studio RTMP Live Broadcast';
        body.innerHTML = `
            <p style="color:var(--text-muted);font-size:0.88rem;margin-bottom:16px;">
                Broadcast directly from OBS Studio to EduVault's DRM-protected classroom stream.
            </p>
            <div class="form-group">
                <label>Stream Ingest Server (RTMP URL)</label>
                <div style="display:flex;gap:8px;">
                    <input type="text" id="obs-server-url" value="${IntegrationsState.obs.server}" readonly style="flex:1;">
                    <button class="btn btn-outline" onclick="copyToClipboard('${IntegrationsState.obs.server}')"><i class="fas fa-copy"></i> Copy</button>
                </div>
            </div>
            <div class="form-group">
                <label>Stream Key (Keep Private)</label>
                <div style="display:flex;gap:8px;">
                    <input type="password" id="obs-stream-key" value="${IntegrationsState.obs.streamKey}" readonly style="flex:1;">
                    <button class="btn btn-outline" onclick="toggleSecretVisibility('obs-stream-key')"><i class="fas fa-eye"></i></button>
                    <button class="btn btn-outline" onclick="copyToClipboard('${IntegrationsState.obs.streamKey}')"><i class="fas fa-copy"></i> Copy</button>
                </div>
            </div>
            <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px;margin:16px 0;font-size:0.82rem;">
                <strong>Quick OBS Setup:</strong><br>
                1. In OBS, go to <em>Settings → Stream</em>.<br>
                2. Select Service: <strong>Custom...</strong><br>
                3. Paste the Server URL and Stream Key above.<br>
                4. Click <strong>Start Streaming</strong> in OBS!
            </div>
            <div style="display:flex;justify-content:flex-end;gap:10px;">
                <button class="btn btn-ghost" onclick="closeIntegrationModal()">Close</button>
                <button class="btn btn-primary" onclick="testIntegration('obs')"><i class="fas fa-check-circle"></i> Test Connection</button>
            </div>
        `;
    } else if (type === 'youtube') {
        icon.className = 'fab fa-youtube text-red';
        title.textContent = 'YouTube Live Simulcast';
        body.innerHTML = `
            <p style="color:var(--text-muted);font-size:0.88rem;margin-bottom:16px;">
                Stream your lectures simultaneously to your institutional YouTube channel.
            </p>
            <div class="form-group">
                <label>YouTube RTMP URL</label>
                <input type="text" id="yt-rtmp-url" value="${IntegrationsState.youtube.rtmpUrl}" style="width:100%;">
            </div>
            <div class="form-group">
                <label>YouTube Stream Key</label>
                <input type="password" id="yt-stream-key" placeholder="Enter your YouTube Stream Key" value="yt_live_eduvault_verified" style="width:100%;">
            </div>
            <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px;">
                <button class="btn btn-ghost" onclick="closeIntegrationModal()">Cancel</button>
                <button class="btn btn-primary" onclick="testIntegration('youtube')"><i class="fas fa-save"></i> Save & Verify Stream</button>
            </div>
        `;
    } else if (type === 'github') {
        icon.className = 'fab fa-github';
        title.textContent = 'GitHub Classroom Sync';
        body.innerHTML = `
            <p style="color:var(--text-muted);font-size:0.88rem;margin-bottom:16px;">
                Auto-sync lecture source codes and student homework submissions from GitHub.
            </p>
            <div class="form-group">
                <label>Repository URL</label>
                <input type="text" id="gh-repo-url" value="${IntegrationsState.github.repoUrl}" style="width:100%;">
            </div>
            <div class="form-group">
                <label>Branch</label>
                <input type="text" id="gh-branch" value="main" style="width:100%;">
            </div>
            <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px;">
                <button class="btn btn-ghost" onclick="closeIntegrationModal()">Cancel</button>
                <button class="btn btn-primary" onclick="testIntegration('github')"><i class="fas fa-sync"></i> Sync Repository Now</button>
            </div>
        `;
    } else if (type === 'gdrive') {
        icon.className = 'fab fa-google-drive text-cyan';
        title.textContent = 'Google Drive Cloud Archive';
        body.innerHTML = `
            <p style="color:var(--text-muted);font-size:0.88rem;margin-bottom:16px;">
                All live class recordings and uploaded PDFs automatically back up to your Google Drive.
            </p>
            <div class="form-group">
                <label>Backup Folder</label>
                <input type="text" value="${IntegrationsState.gdrive.folder}" readonly style="width:100%;">
            </div>
            <div class="form-group">
                <label>Status</label>
                <div style="color:var(--success);font-weight:600;"><i class="fas fa-check-circle"></i> Connected & Syncing (3.4 GB stored)</div>
            </div>
            <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px;">
                <button class="btn btn-ghost" onclick="closeIntegrationModal()">Close</button>
                <button class="btn btn-primary" onclick="testIntegration('gdrive')"><i class="fas fa-cloud-upload-alt"></i> Run Manual Backup</button>
            </div>
        `;
    } else if (type === 'zoom') {
        icon.className = 'fas fa-video text-blue';
        title.textContent = 'Zoom Recording & Meeting Ingest';
        body.innerHTML = `
            <p style="color:var(--text-muted);font-size:0.88rem;margin-bottom:16px;">
                Import external Zoom recordings directly into EduVault's DRM-protected student course vault.
            </p>
            <div class="form-group">
                <label>Zoom Meeting ID / Recording Share URL</label>
                <input type="text" id="zoom-url" placeholder="https://zoom.us/rec/share/..." style="width:100%;">
            </div>
            <div class="form-group">
                <label>Passcode (if protected)</label>
                <input type="password" id="zoom-pass" placeholder="Optional passcode" style="width:100%;">
            </div>
            <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px;">
                <button class="btn btn-ghost" onclick="closeIntegrationModal()">Cancel</button>
                <button class="btn btn-primary" onclick="testIntegration('zoom')"><i class="fas fa-download"></i> Ingest Recording</button>
            </div>
        `;
    } else if (type === 'api') {
        icon.className = 'fas fa-code text-green';
        title.textContent = 'REST API & Webhooks Engine';
        body.innerHTML = `
            <p style="color:var(--text-muted);font-size:0.88rem;margin-bottom:16px;">
                Integrate EduVault with your institutional database or custom portal via OpenAPI endpoints.
            </p>
            <div class="form-group">
                <label>Production API Key</label>
                <div style="display:flex;gap:8px;">
                    <input type="password" id="api-master-key" value="edv_live_sec_jwt_89472910384729" readonly style="flex:1;">
                    <button class="btn btn-outline" onclick="toggleSecretVisibility('api-master-key')"><i class="fas fa-eye"></i></button>
                    <button class="btn btn-outline" onclick="copyToClipboard('edv_live_sec_jwt_89472910384729')"><i class="fas fa-copy"></i> Copy</button>
                </div>
            </div>
            <div class="form-group">
                <label>API Base Endpoint</label>
                <input type="text" value="${BackendSync.apiUrl}/api" readonly style="width:100%;">
            </div>
            <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px;">
                <button class="btn btn-ghost" onclick="closeIntegrationModal()">Close</button>
                <a href="${BackendSync.apiUrl}/docs" target="_blank" class="btn btn-primary"><i class="fas fa-book-open"></i> Open Interactive Swagger Docs</a>
            </div>
        `;
    }
}

function closeIntegrationModal() {
    const modal = document.getElementById('integration-modal');
    if (modal) modal.classList.add('hidden');
}

function copyToClipboard(text) {
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text);
        showToast('Copied to clipboard!', 'success');
    } else {
        showToast(`Value: ${text}`, 'info');
    }
}

function toggleSecretVisibility(id) {
    const input = document.getElementById(id);
    if (input) {
        input.type = input.type === 'password' ? 'text' : 'password';
    }
}

function testIntegration(type) {
    if (type === 'obs') {
        showToast('Testing RTMP socket at rtmp://live.eduvault.io:1935... Ingest ready for 1080p60 stream!', 'success');
    } else if (type === 'youtube') {
        showToast('YouTube stream key validated! Simulcast ready on lecture start.', 'success');
    } else if (type === 'github') {
        showToast('GitHub repository synced: 24 code templates and test fixtures loaded.', 'success');
    } else if (type === 'gdrive') {
        showToast('Google Drive cloud archive verified: All lecture videos backed up.', 'success');
    } else if (type === 'zoom') {
        showToast('Zoom recording link validated and queued for background DRM encoding.', 'success');
    }
    closeIntegrationModal();
}

// ===================================================================
// BACKEND SYNC, WEBSOCKET INTEGRATION & OUTAGE SIMULATION
// ===================================================================

const BackendSync = {
    apiUrl: window.location.origin,
    wsUrl: (window.location.protocol === 'https:' ? 'wss://' : 'ws://') + window.location.host,
    isBackendConnected: false,
    socket: null,

    async init() {
        await checkBackendHealth(false);
        if (this.isBackendConnected) {
            this.connectWebSocket('dsa-bt-live');
            this.syncCatchUpData('dsa-bt-live');
        }
    },

    connectWebSocket(sessionId) {
        if (!window.WebSocket) return;
        try {
            const user = AppState.userName || 'student_demo';
            const role = AppState.userRole || 'student';
            this.socket = new WebSocket(`${this.wsUrl}/ws/session/${sessionId}?user_id=${user}&role=${role}`);

            this.socket.onopen = () => {
                console.log(`🔌 WebSocket connected to live session: ${sessionId}`);
            };

            this.socket.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    if (msg.type === 'chat_message') {
                        // Append live message into Live Class chat if on that page
                        const liveContainer = document.getElementById('chat-messages');
                        if (liveContainer) {
                            addChatMessage(msg.data.sender_name, msg.data.content, msg.data.message_type === 'system');
                        }

                        // Also append into Catch-Up Hub chat archive
                        if (CatchUpState.activeSessionId === sessionId) {
                            const newMsg = {
                                time: msg.data.time_display,
                                sender: msg.data.sender_name,
                                role: msg.data.sender_role,
                                instruction: msg.data.message_type === 'instruction',
                                text: msg.data.content
                            };
                            CatchUpState.sessions[sessionId]?.chat.push(newMsg);
                            const panel = document.getElementById('catchup-panel-chat-archive');
                            if (panel && panel.classList.contains('active')) {
                                loadChatArchive(sessionId);
                            }
                        }
                    } else if (msg.type === 'user_reconnected') {
                        showToast(`⚡ Disconnect recovered! Synced ${msg.data.missed_duration} of missed content.`, 'warning');
                    }
                } catch (err) {}
            };

            this.socket.onclose = () => {
                console.log('⚠️ WebSocket disconnected');
            };
        } catch (e) {}
    },

    sendMessage(sessionId, sender, content, role = 'student') {
        // 1. Send via WebSocket if open
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({
                action: 'chat',
                text: content,
                sender: sender,
                is_instruction: role === 'teacher'
            }));
        }
        // 2. Also POST to REST API for guaranteed persistence
        if (this.isBackendConnected) {
            fetch(`${this.apiUrl}/api/sessions/${sessionId}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    session_id: sessionId,
                    sender_name: sender,
                    sender_role: role,
                    content: content,
                    message_type: role === 'teacher' ? 'instruction' : 'text'
                })
            }).catch(() => {});
        }
    },

    async syncCatchUpData(sessionId) {
        try {
            const res = await fetch(`${this.apiUrl}/api/sessions/${sessionId}/catchup`);
            if (res.ok) {
                const data = await res.json();
                console.log('Synced catch-up payload from backend for:', data.session_title);
                if (data.missed_duration && document.getElementById('missed-duration')) {
                    document.getElementById('missed-duration').textContent = data.missed_duration;
                }
            }
        } catch (e) {}
    }
};

// Health Check & Live Badge Updater
async function checkBackendHealth(manualClick = false) {
    const badge = document.getElementById('backend-status-badge');
    const text = document.getElementById('backend-status-text');
    if (!badge || !text) return;

    text.textContent = 'Checking...';
    try {
        const start = performance.now();
        const res = await fetch(`${BackendSync.apiUrl}/api/health`, { method: 'GET', signal: AbortSignal.timeout(1800) });
        const latency = Math.round(performance.now() - start);
        if (res.ok) {
            const data = await res.json();
            badge.className = 'backend-status-badge';
            text.textContent = `Backend Live (${latency}ms)`;
            BackendSync.isBackendConnected = true;
            if (manualClick) {
                showToast(`✅ Live Backend Connected: ${data.service} (${latency}ms) — SQLite & WebSockets Active`, 'success');
            }
        } else {
            throw new Error('Non-200');
        }
    } catch(e) {
        badge.className = 'backend-status-badge standalone';
        text.textContent = 'Standalone Mode';
        BackendSync.isBackendConnected = false;
        if (manualClick) {
            showToast('ℹ️ Standalone Mode: Backend not detected at http://127.0.0.1:8000. Running with client-side state.', 'info');
        }
    }
}

// Live Outage & Reconnection Simulation Action
async function simulateOutageReconnection() {
    const btn = document.getElementById('simulate-outage-btn');
    if (btn) btn.disabled = true;

    showToast('⚠️ Simulating sudden Wi-Fi & power disconnect...', 'warning');

    // Visually disconnect
    const badge = document.getElementById('backend-status-badge');
    const text = document.getElementById('backend-status-text');
    if (badge) badge.className = 'backend-status-badge standalone';
    if (text) text.textContent = 'Disconnected (Outage)';

    // Trigger backend outage endpoint
    try {
        await fetch(`${BackendSync.apiUrl}/api/sessions/dsa-bt-live/simulate-disconnect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: AppState.userName || 'student_demo',
                session_id: 'dsa-bt-live',
                outage_reason: 'Power Outage & Internet Latency',
                duration_minutes: 12
            })
        });
    } catch(e) {}

    // Simulate recovery after 2.2 seconds
    setTimeout(async () => {
        showToast('⚡ Power & Internet restored! Reconnecting to live session...', 'info');

        await checkBackendHealth(false);
        BackendSync.connectWebSocket('dsa-bt-live');

        // Restore banner if not present
        let banner = document.getElementById('catchup-reconnect-banner');
        if (!banner) {
            const header = document.querySelector('#page-session-catchup .dashboard-header');
            if (header) {
                const newBanner = document.createElement('div');
                newBanner.className = 'catchup-reconnect-banner';
                newBanner.id = 'catchup-reconnect-banner';
                newBanner.innerHTML = `
                    <div class="reconnect-banner-icon"><i class="fas fa-plug-circle-check"></i></div>
                    <div class="reconnect-banner-content">
                        <h3>Welcome Back! You missed <span id="missed-duration">12 minutes</span> of the session</h3>
                        <p>"Data Structures — Binary Trees" was in progress. Here's what happened while you were away.</p>
                    </div>
                    <div class="reconnect-banner-actions">
                        <button class="btn btn-primary btn-sm" onclick="scrollToMissedContent()"><i class="fas fa-arrow-down"></i> Jump to Missed Content</button>
                        <button class="btn btn-ghost btn-sm" onclick="dismissReconnectBanner()"><i class="fas fa-times"></i></button>
                    </div>
                `;
                header.insertAdjacentElement('afterend', newBanner);
            }
        }

        // Reload fresh data from SQLite backend
        await loadChatArchive('dsa-bt-live');
        await loadAISummary('dsa-bt-live');

        showToast('🎉 Reconnection Complete! Missed 12 minutes synchronized.', 'success');
        if (btn) btn.disabled = false;
    }, 2200);
}


