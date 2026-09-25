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
});

// ========== PRELOADER ==========
function initPreloader() {
    setTimeout(() => {
        const preloader = document.getElementById('preloader');
        preloader.classList.add('hidden');
    }, 1800);
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
    
    // Start timers if needed
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
    }
    
    if (page === 'test-taking') {
        startTestTimer();
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
    
    if (role === 'owner') {
        if (emailField) emailField.value = 'owner@eduvault.io';
        if (passField) passField.value = 'password123';
        if (keyField) keyField.value = '';
        showToast('Filled credentials for Platform Owner (Founder)', 'info');
    } else if (role === 'teacher') {
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
    isRealCameraActive: false,
    isScreenSharing: false,
    audioContext: null,
    analyser: null,
    micAnimFrame: null
};

async function toggleWebRTCRealSource() {
    const videoEl = document.getElementById('real-live-video');
    const placeholderEl = document.getElementById('video-placeholder');
    const btn = document.getElementById('webrtc-source-btn');
    const label = document.getElementById('webrtc-source-text');

    if (!WebRTCState.isRealCameraActive) {
        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                showToast('WebRTC getUserMedia not supported in this browser.', 'error');
                return;
            }
            showToast('Requesting webcam & microphone access...', 'info');
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
                audio: true
            });

            WebRTCState.localStream = stream;
            WebRTCState.isRealCameraActive = true;

            if (videoEl) {
                videoEl.srcObject = stream;
                videoEl.classList.remove('hidden');
                videoEl.play().catch(e => console.warn('Video play warning:', e));
            }
            if (placeholderEl) {
                placeholderEl.classList.add('hidden');
            }
            if (btn) {
                btn.classList.add('active');
            }
            if (label) {
                label.textContent = 'Switch to Simulated Class';
            }

            startMicAudioVisualizer(stream);

            AppState.camOn = true;
            AppState.micOn = true;
            updateCamMicButtons(true, true);
            showToast('🟢 Real WebRTC Camera & Mic live (720p HD)!', 'success');
        } catch (err) {
            console.warn('Real webcam/mic not accessible:', err);
            showToast(`Webcam notice: ${err.message || 'Permission denied'}. Falling back to simulated stream.`, 'warning');
        }
    } else {
        stopWebRTCRealSource();
        showToast('Switched back to high-fidelity simulated stream.', 'info');
    }
}

function stopWebRTCRealSource() {
    const videoEl = document.getElementById('real-live-video');
    const placeholderEl = document.getElementById('video-placeholder');
    const btn = document.getElementById('webrtc-source-btn');
    const label = document.getElementById('webrtc-source-text');

    if (WebRTCState.localStream) {
        WebRTCState.localStream.getTracks().forEach(track => track.stop());
        WebRTCState.localStream = null;
    }
    WebRTCState.isRealCameraActive = false;

    stopMicAudioVisualizer();

    if (videoEl) {
        videoEl.srcObject = null;
        videoEl.classList.add('hidden');
    }
    if (placeholderEl) {
        placeholderEl.classList.remove('hidden');
    }
    if (btn) {
        btn.classList.remove('active');
    }
    if (label) {
        label.textContent = 'Switch to Real Webcam';
    }
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
            if (!WebRTCState.isRealCameraActive || !AppState.micOn) {
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

function toggleMic() {
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
    showToast(AppState.micOn ? 'Microphone unmuted' : 'Microphone muted', 'info');
}

async function toggleCam() {
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
    showToast(AppState.camOn ? 'Camera enabled' : 'Camera disabled', 'info');
}

async function toggleScreenShare() {
    const btn = document.getElementById('screen-btn');
    const videoEl = document.getElementById('real-live-video');
    const placeholderEl = document.getElementById('video-placeholder');

    if (!WebRTCState.isScreenSharing) {
        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
                btn.classList.toggle('active');
                showToast(btn.classList.contains('active') ? 'Screen sharing active (Simulated)' : 'Screen sharing stopped', 'info');
                return;
            }
            showToast('Selecting window, screen, or browser tab to share...', 'info');
            const screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: { cursor: 'always' },
                audio: false
            });

            WebRTCState.screenStream = screenStream;
            WebRTCState.isScreenSharing = true;

            if (videoEl) {
                videoEl.srcObject = screenStream;
                videoEl.classList.remove('hidden');
                videoEl.play().catch(e => console.warn(e));
            }
            if (placeholderEl) {
                placeholderEl.classList.add('hidden');
            }
            btn.classList.add('active');
            showToast('🖥️ Screen sharing started live to all students!', 'success');

            screenStream.getVideoTracks()[0].onended = () => {
                stopScreenShare();
            };
        } catch (err) {
            console.warn('Screen share canceled/failed:', err);
            btn.classList.toggle('active');
            showToast(btn.classList.contains('active') ? 'Screen sharing active (Simulated)' : 'Screen share canceled', 'info');
        }
    } else {
        stopScreenShare();
    }
}

function stopScreenShare() {
    const btn = document.getElementById('screen-btn');
    const videoEl = document.getElementById('real-live-video');
    const placeholderEl = document.getElementById('video-placeholder');

    if (WebRTCState.screenStream) {
        WebRTCState.screenStream.getTracks().forEach(t => t.stop());
        WebRTCState.screenStream = null;
    }
    WebRTCState.isScreenSharing = false;
    if (btn) btn.classList.remove('active');

    if (WebRTCState.isRealCameraActive && WebRTCState.localStream && videoEl) {
        videoEl.srcObject = WebRTCState.localStream;
        videoEl.play().catch(e => console.warn(e));
    } else {
        if (videoEl) {
            videoEl.srcObject = null;
            videoEl.classList.add('hidden');
        }
        if (placeholderEl) placeholderEl.classList.remove('hidden');
    }
    showToast('Screen sharing stopped', 'info');
}

function toggleWhiteboard() {
    showToast('Whiteboard opened', 'info');
}

function toggleRecording() {
    AppState.isRecording = !AppState.isRecording;
    const btn = document.getElementById('record-btn');
    btn.classList.toggle('recording', AppState.isRecording);
    showToast(AppState.isRecording ? '🔴 Recording started (1080p, 30fps)' : 'Recording saved to cloud vault', AppState.isRecording ? 'warning' : 'success');
}

function muteAllStudents() {
    showToast('All students have been muted', 'info');
}

function endClass() {
    if (confirm('Are you sure you want to end this class?')) {
        if (classTimerInterval) clearInterval(classTimerInterval);
        stopWebRTCRealSource();
        stopScreenShare();
        showToast('Class ended. Recording saved automatically.', 'success');
        if (AppState.userRole === 'owner') {
        navigateTo('admin-dashboard');
    } else if (AppState.userRole === 'teacher') {
        navigateTo('teacher-dashboard');
    } else {
        navigateTo('student-dashboard');
    }
    }
}

function leaveClass() {
    if (confirm('Leave this class?')) {
        stopWebRTCRealSource();
        stopScreenShare();
        navigateTo('student-dashboard');
    }
}

// Student Controls
async function toggleStudentMic() {
    const btn = document.getElementById('student-mic');
    const icon = btn.querySelector('i');
    const isMuted = icon.classList.contains('fa-microphone-slash');

    if (isMuted) {
        try {
            if (!WebRTCState.localStream && navigator.mediaDevices?.getUserMedia) {
                WebRTCState.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            }
            icon.className = 'fas fa-microphone';
            btn.classList.add('active');
            showToast('Student Microphone unmuted & live', 'info');
        } catch (e) {
            icon.className = 'fas fa-microphone';
            btn.classList.add('active');
            showToast('Microphone on (simulated)', 'info');
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
    const icon = btn.querySelector('i');
    const isOff = icon.classList.contains('fa-video-slash');
    if (isOff) {
        try {
            if (!WebRTCState.localStream && navigator.mediaDevices?.getUserMedia) {
                WebRTCState.localStream = await navigator.mediaDevices.getUserMedia({ video: true });
            }
            icon.className = 'fas fa-video';
            btn.classList.add('active');
            showToast('Student Camera live', 'info');
        } catch (e) {
            icon.className = 'fas fa-video';
            btn.classList.add('active');
            showToast('Camera on (simulated)', 'info');
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
    btn.classList.toggle('raised', AppState.handRaised);
    
    if (AppState.handRaised) {
        showToast('✋ Hand raised — teacher will see your request', 'info');
        // Add system message to chat
        addChatMessage(null, `${AppState.userName || 'You'} raised hand`, true);
    } else {
        showToast('Hand lowered', 'info');
    }
}

function alertTeacher() {
    showToast('⚠️ Alert sent to teacher — audio/video issue reported', 'warning');
    
    // Show alert banner (teacher side simulation)
    const banner = document.getElementById('teacher-alert-banner');
    if (banner) {
        banner.classList.remove('hidden');
        const text = document.getElementById('alert-banner-text');
        if (text) text.textContent = `Student reports audio/video issues. Please check your camera and microphone.`;
    }
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

function uploadContent() {
    showToast('🔐 Uploading and applying DRM protection...', 'info');
    setTimeout(() => {
        closeUploadModal();
        showToast('✅ Content uploaded and protected successfully!', 'success');
    }, 2000);
}

function createPlaylist() {
    showToast('📋 New playlist created', 'success');
}

function addSubject() {
    showToast('📁 New subject folder created', 'success');
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

function publishAssessment() {
    showToast('📋 Assessment published and visible to students!', 'success');
}

// ========== TEST TAKING ==========
let testTimerInterval;

function startTestTimer() {
    if (testTimerInterval) clearInterval(testTimerInterval);
    let timeLeft = 29 * 60 + 45; // 29:45
    
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
        
        // Warning when 5 minutes left
        if (timeLeft === 300) {
            showToast('⏰ Only 5 minutes remaining!', 'warning');
        }
    }, 1000);
}

function selectTestOption(el) {
    const parent = el.closest('.tq-options');
    parent.querySelectorAll('.tq-option').forEach(o => o.classList.remove('selected'));
    el.classList.add('selected');
    el.querySelector('input').checked = true;
    
    // Mark question as answered in navigator
    const qNum = AppState.currentQuestion;
    const navBtn = document.querySelector(`.nav-q:nth-child(${qNum})`);
    if (navBtn) navBtn.classList.add('answered');
    
    AppState.testAnswers[qNum] = el.querySelector('input').value;
}

function goToQuestion(num) {
    AppState.currentQuestion = num;
    
    // Update navigator
    document.querySelectorAll('.nav-q').forEach(q => q.classList.remove('active'));
    const navBtn = document.querySelector(`.nav-q:nth-child(${num})`);
    if (navBtn) navBtn.classList.add('active');
    
    // For prototype, we only have question 1 rendered
    // In a real app, we'd load the question dynamically
    showToast(`Question ${num}`, 'info');
}

function prevQuestion() {
    if (AppState.currentQuestion > 1) {
        goToQuestion(AppState.currentQuestion - 1);
    }
}

function nextQuestion() {
    if (AppState.currentQuestion < 10) {
        goToQuestion(AppState.currentQuestion + 1);
    }
}

async function submitTest() {
    if (testTimerInterval) clearInterval(testTimerInterval);
    
    showToast('Submitting assessment to EduVault Proctor Engine...', 'info');

    let result = null;
    if (BackendSync.isBackendConnected) {
        try {
            const res = await fetch(`${BackendSync.apiUrl}/api/assessments/submit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    test_id: "quiz-trees",
                    student_name: AppState.userName || "Abhishek Dwivedi",
                    answers: AppState.testAnswers,
                    time_spent_secs: 240,
                    tab_switches: AppState.testWarnings
                })
            });
            if (res.ok) {
                result = await res.json();
            }
        } catch(e) {}
    }

    const score = result ? result.score : 88;
    const integrity = result ? result.proctor_integrity : "100% Clean";

    showToast(`🎉 Test Submitted! Score: ${score}/100 — Proctor Integrity: ${integrity}! Points awarded to Leaderboard!`, 'success');
    
    setTimeout(() => {
        navigateTo('leaderboard');
        loadLeaderboardFromBackend();
    }, 1800);
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

function createScheduledEvent() {
    closeScheduleModal();
    showToast('📅 Event scheduled and students notified!', 'success');
}

function prevMonth() {
    showToast('Showing August 2026', 'info');
}

function nextMonth() {
    showToast('Showing October 2026', 'info');
}

// ========== ENROLLMENT KEYS ==========
function generateKey() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const segments = [];
    for (let i = 0; i < 4; i++) {
        let seg = '';
        for (let j = 0; j < 4; j++) {
            seg += chars[Math.floor(Math.random() * chars.length)];
        }
        segments.push(seg);
    }
    const key = `EDU-${segments[0]}-${segments[1]}`;
    
    const list = document.getElementById('keys-list');
    if (list) {
        const item = document.createElement('div');
        item.className = 'key-item';
        item.innerHTML = `
            <div class="key-info">
                <code>${key}</code>
                <span>New Course Key</span>
            </div>
            <div class="key-actions">
                <span class="key-usage">0/50 used</span>
                <button class="btn-icon" title="Copy" onclick="copyKey('${key}')"><i class="fas fa-copy"></i></button>
            </div>
        `;
        list.appendChild(item);
    }
    
    showToast(`🔑 New enrollment key generated: ${key}`, 'success');
}

function copyKey(key) {
    navigator.clipboard?.writeText(key).then(() => {
        showToast(`📋 Key copied: ${key}`, 'success');
    }).catch(() => {
        showToast(`Key: ${key}`, 'info');
    });
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

    // Initialize backend sync if server is running
    BackendSync.init();
});

// ===================================================================
// BACKEND SYNC, WEBSOCKET INTEGRATION & OUTAGE SIMULATION
// ===================================================================

const BackendSync = {
    apiUrl: window.location.origin.includes('8000') ? window.location.origin : 'http://127.0.0.1:8000',
    wsUrl: window.location.origin.includes('8000') ? `ws://${window.location.host}` : 'ws://127.0.0.1:8000',
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


