// --- Constants ---
const LEVELS = {
    'secondary': { name: 'المرحلة الثانوية', emoji: '<i data-lucide="building-2" class="w-6 h-6 inline-block text-blue-500"></i>', teacherPass: '1001', studentPass: '10010' },
    'middle': { name: 'المرحلة المتوسطة', emoji: '<i data-lucide="school" class="w-6 h-6 inline-block text-amber-500"></i>', teacherPass: '2002', studentPass: '20020' },
    'upper_elem': { name: 'الابتدائية العليا', emoji: '<i data-lucide="backpack" class="w-6 h-6 inline-block text-red-500"></i>', teacherPass: '3003', studentPass: '30030' },
    'lower_elem': { name: 'الابتدائية الأولية', emoji: '<i data-lucide="hexagon" class="w-6 h-6 inline-block text-indigo-500"></i>', teacherPass: '4004', studentPass: '40040' }
};

const MASTER_TEACHER_PASS = "123456"; // Can access selector

// --- State Management ---
const state = {
    isTeacher: false,
    isParent: false,          // NEW: Parent role
    parentPhone: null,        // NEW: Parent's phone for lookup
    parentStudents: [],       // NEW: Students found for parent
    currentLevel: null, // Null indicates not logged in
    currentView: 'home',
    students: [],
    competitions: [],
    groups: [],
    scores: [],
    darkMode: localStorage.getItem('darkMode') === 'true',
    studentPassword: null, // For student mode authentication persistence

};

// --- Supabase Realtime Listeners ---
let studentsUnsubscribe = null;
let competitionsUnsubscribe = null;
let activeGroupsUnsubscribe = null;
let scoresUnsubscribe = null;
let homeStudentsUnsubscribe = null;
let homeGroupsUnsubscribe = null;

// --- Global Error Handler for Debugging ---
window.onerror = function (msg, url, line, col, error) {
    var errorDiv = document.getElementById('error-display');
    if (!errorDiv) {
        errorDiv = document.createElement('div');
        errorDiv.id = 'error-display';
        errorDiv.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:red;color:white;padding:10px;font-size:10px;z-index:9999;max-height:100px;overflow:auto;';
        document.body.appendChild(errorDiv);
    }
    errorDiv.innerHTML += '<div>Error: ' + msg + ' at ' + line + ':' + col + '</div>';
    return false;
};

// --- Helpers ---
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

// --- Toast Notification ---
function showToast(msg, type = 'success') {
    const toast = $('#toast');
    const toastMsg = $('#toast-msg');
    if (!toast) return;

    // Reset classes - MAXIMUM Z-INDEX to ensure visibility over everything (including modals)
    toast.className = 'fixed top-20 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full shadow-lg z-[9999] transition-all duration-300 flex items-center gap-3 min-w-[200px] justify-center text-white';

    if (type === 'error') toast.classList.add('bg-red-600');
    else if (type === 'success') toast.classList.add('bg-green-600');
    else toast.classList.add('bg-gray-800');

    toastMsg.textContent = msg;
    toast.classList.remove('hidden', 'opacity-0', 'translate-y-[-20px]');

    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-[-20px]');
        setTimeout(() => toast.classList.add('hidden'), 300);
    }, 3000);
}

function toggleModal(id, show = true) {
    const modal = $(`#${id}`);
    if (!modal) return;
    if (show) modal.classList.remove('hidden');
    else modal.classList.add('hidden');
}
window.closeModal = (id) => toggleModal(id, false);

// --- Image Compression Utility ---
async function compressImage(file, maxWidth = 300, maxHeight = 300, quality = 0.7) {
    if (!file) return null;
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > maxWidth) {
                        height *= maxWidth / width;
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width *= maxHeight / height;
                        height = maxHeight;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
        };
    });
}

// --- Authentication & Persistence ---

function loadAuth() {
    const savedLevel = localStorage.getItem('auth_level');
    const savedRole = localStorage.getItem('auth_role');
    const savedParentPhone = localStorage.getItem('auth_parent_phone');
    const savedStudentId = localStorage.getItem('auth_student_id');

    // Parent login
    if (savedRole === 'parent' && savedParentPhone) {
        state.isParent = true;
        state.parentPhone = savedParentPhone;
        return true;
    }

    if (savedLevel && LEVELS[savedLevel]) {
        state.currentLevel = savedLevel;
        state.isTeacher = savedRole === 'teacher';
        if (savedRole === 'student') {
            if (savedStudentId) {
                window._currentLoggedInStudentId = savedStudentId;
            } else {
                return false; // Incomplete student session, force logout to avoid bug
            }
        }
        return true; // Logged in
    }
    return false; // Not logged in
}

function saveAuth() {
    if (state.isParent && state.parentPhone) {
        localStorage.setItem('auth_role', 'parent');
        localStorage.setItem('auth_parent_phone', state.parentPhone);
    } else if (state.currentLevel) {
        localStorage.setItem('auth_level', state.currentLevel);
        localStorage.setItem('auth_role', state.isTeacher ? 'teacher' : 'student');
        if (!state.isTeacher && window._currentLoggedInStudentId) {
            localStorage.setItem('auth_student_id', window._currentLoggedInStudentId);
        }
    }
}

function logout() {
    // 1. Unsubscribe from all active listeners
    if (studentsUnsubscribe) { studentsUnsubscribe(); studentsUnsubscribe = null; }
    if (competitionsUnsubscribe) { competitionsUnsubscribe(); competitionsUnsubscribe = null; }
    if (activeGroupsUnsubscribe) { activeGroupsUnsubscribe(); activeGroupsUnsubscribe = null; }
    if (scoresUnsubscribe) { scoresUnsubscribe(); scoresUnsubscribe = null; }
    if (homeStudentsUnsubscribe) { homeStudentsUnsubscribe(); homeStudentsUnsubscribe = null; }
    if (homeGroupsUnsubscribe) { homeGroupsUnsubscribe(); homeGroupsUnsubscribe = null; }

    state.isTeacher = false;
    state.isParent = false;
    state.parentPhone = null;
    state.parentStudents = [];
    state.currentLevel = null;
    state.students = [];
    state.competitions = [];
    state.scores = [];

    localStorage.removeItem('auth_level');
    localStorage.removeItem('auth_role');
    localStorage.removeItem('auth_parent_phone');

    // Show Auth Modal
    showAuthModal();
}

function showAuthModal() {
    // Hide App Content
    $('#app-content-wrapper').classList.add('hidden'); // We will wrap content in index.html
    $('#auth-overlay').classList.remove('hidden');
}

function handleLogin(type) {
    // type: 'student' | 'teacher' | 'parent'
    $('#auth-options-panel').classList.add('hidden');

    if (type === 'student') {
        $('#student-login-panel').classList.remove('hidden');
    } else if (type === 'parent') {
        $('#parent-login-panel').classList.remove('hidden');
    } else {
        $('#teacher-login-panel').classList.remove('hidden');
    }
}

function backToAuthHome() {
    $('#student-login-panel').classList.add('hidden');
    $('#teacher-login-panel').classList.add('hidden');
    $('#parent-login-panel').classList.add('hidden');
    $('#auth-options-panel').classList.remove('hidden');
}

async function verifyStudentLevel() {
    const levelKey = $('#student-level-select').value;
    const password = $('#student-level-password-input').value;

    if (!levelKey || !LEVELS[levelKey]) {
        showToast("الرجاء اختيار المرحلة", "error");
        return;
    }

    const correctPass = LEVELS[levelKey].studentPass;

    if (password === correctPass) {
        // Fetch students for this level
        try {
            const q = window.firebaseOps.query(
                window.firebaseOps.collection(window.db, "students"),
                window.firebaseOps.where("level", "==", levelKey)
            );
            const snap = await window.firebaseOps.getDocs(q);
            
            const students = [];
            snap.forEach(doc => {
                const data = doc.data();
                data.id = doc.id;
                students.push(data);
            });

            // Populate select
            const nameSelect = $('#student-name-select');
            nameSelect.innerHTML = '<option value="" disabled selected>-- اختر اسمك --</option>' + 
                students.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
            
            if(students.length === 0) {
                showToast("لا يوجد طلاب مسجلين في هذه المرحلة", "error");
                return;
            }

            // Store level for step 2
            window._tempStudentLevel = levelKey;
            window._tempLevelStudents = students;

            $('#student-step-1').classList.add('hidden');
            $('#student-step-2').classList.remove('hidden');
        } catch(e) {
            console.error(e);
            showToast("خطأ في جلب بيانات الطلاب", "error");
        }
    } else {
        showToast("كلمة مرور المرحلة غير صحيحة", "error");
    }
}

function performStudentLogin() {
    const studentId = $('#student-name-select').value;
    const personalPassword = $('#student-personal-password-input').value;

    if (!studentId) {
        showToast("الرجاء اختيار اسمك", "error");
        return;
    }

    const student = window._tempLevelStudents.find(s => s.id === studentId);
    
    if (!student) {
        showToast("طالب غير موجود", "error");
        return;
    }

    if (!student.password) {
        showToast("لم يتم تعيين كلمة مرور شخصية لك بعد، راجع المعلم", "error");
        return;
    }

    if (personalPassword === student.password) {
        state.currentLevel = window._tempStudentLevel;
        state.isTeacher = false;
        state.studentPassword = personalPassword;
        window._currentLoggedInStudentId = student.id; // Store current student
        completeLogin();
    } else {
        showToast("كلمة المرور الشخصية غير صحيحة", "error");
    }
}

function performTeacherLogin() {
    const password = $('#teacher-password-input').value;
    const selectedLevel = $('#teacher-level-select').value;

    // 1. Master Password Logic (Universal Access)
    if (password === MASTER_TEACHER_PASS) {
        if (selectedLevel) {
            // Level selected -> Log in directly
            finishTeacherLogin(selectedLevel);
        } else {
            // No level selected -> Show Level Selector Grid (Legacy/Admin Node)
            $('#teacher-password-section').classList.add('hidden');
            $('#teacher-level-selection').classList.remove('hidden');
            const container = $('#teacher-level-grid');
            container.innerHTML = Object.entries(LEVELS).map(([key, config]) => `
                 <button onclick="finishTeacherLogin('${key}')" class="p-4 bg-teal-50 dark:bg-gray-700 rounded-xl border border-teal-100 dark:border-gray-600 hover:border-teal-500 transition text-center">
                    <div class="text-2xl mb-2">${config.emoji}</div>
                    <div class="text-sm font-bold text-gray-800 dark:text-gray-100">${config.name}</div>
                 </button>
            `).join('');
        }
        return;
    }

    // 2. Strict Level Logic
    if (!selectedLevel) {
        showToast("الرجاء اختيار المرحلة أولاً", "error");
        return;
    }

    // Check if password matches ONLY the selected level
    const config = LEVELS[selectedLevel];
    if (config && password === config.teacherPass) {
        finishTeacherLogin(selectedLevel);
    } else {
        showToast("كلمة المرور غير صحيحة للمرحلة المختارة", "error");
    }
}

function finishTeacherLogin(levelKey) {
    state.currentLevel = levelKey;
    state.isTeacher = true;
    completeLogin();
}

// --- Parent Login ---
function normalizePhone(phone) {
    if (!phone) return '';
    // Remove all non-digits
    let cleaned = phone.replace(/[^0-9]/g, '');
    // Saudi format: 05xxxxxxxx -> 966xxxxxxxx
    if (cleaned.startsWith('05') && cleaned.length === 10) {
        cleaned = '966' + cleaned.substring(1);
    } else if (cleaned.startsWith('5') && cleaned.length === 9) {
        cleaned = '966' + cleaned;
    }
    // For international numbers, keep as-is
    return cleaned;
}

// Helper: returns true if the value is a displayable image (base64 OR external URL)
function isImgSrc(src) {
    if (!src) return false;
    return src.startsWith('data:image') || src.startsWith('http') || src.startsWith('blob:');
}

async function performParentLogin() {
    const phoneInput = $('#parent-phone-input').value.trim();
    const phone = normalizePhone(phoneInput);

    if (!phone || phone.length < 9) {
        showToast("الرجاء إدخال رقم جوال صحيح", "error");
        return;
    }

    showToast("جاري البحث عن الطلاب...");

    try {
        // Search across ALL levels for students with this parentPhone
        const q = window.firebaseOps.query(
            window.firebaseOps.collection(window.db, "students"),
            window.firebaseOps.where("parentPhone", "==", phone)
        );

        const snap = await window.firebaseOps.getDocs(q);

        if (snap.empty) {
            showToast("لا يوجد طلاب مسجلين بهذا الرقم", "error");
            return;
        }

        // Found students
        state.parentStudents = [];
        snap.forEach(doc => {
            var dData = doc.data();
            dData.id = doc.id;
            state.parentStudents.push(dData);
        });

        state.isParent = true;
        state.parentPhone = phone;
        completeParentLogin();

    } catch (e) {
        console.error(e);
        showToast("خطأ في البحث", "error");
    }
}

function completeParentLogin() {
    saveAuth();
    $('#auth-overlay').classList.add('hidden');
    $('#app-content-wrapper').classList.remove('hidden');
    $('#loading').classList.add('hidden');
    $('#view-container').classList.remove('hidden');

    updateUIMode();

    // Start Global Sync (optional for parent, but good for shared level data if any)
    startGlobalDataSync();

    router.navigate('parent'); // NEW route for parent dashboard

    showToast(`مرحباً بك! تم العثور على ${state.parentStudents.length} طالب/طالبة`);
}

function completeLogin() {
    saveAuth();
    $('#auth-overlay').classList.add('hidden');
    $('#app-content-wrapper').classList.remove('hidden');

    // Update UI headers
    updateUIMode();

    // Start Global Sync
    startGlobalDataSync();

    // Load Data
    const startView = state.isParent ? 'parent' : (state.isTeacher ? 'home' : 'students');
    router.navigate(startView);

    showToast(`مرحباً بك في ${LEVELS[state.currentLevel].name}`);

    // Explicitly show content
    $('#loading').classList.add('hidden');
    $('#view-container').classList.remove('hidden');

    // Pre-load Quran Data to make search instant
    if (typeof QuranService !== 'undefined') {
        QuranService.loadData();
    }
}

function updateUIMode() {
    const btn = $('#mode-btn'); // This is now logout button or status
    const label = $('#current-mode-label');
    const badge = $('#level-badge');
    const header = $('header');
    const nav = $('nav');

    // Hide header/nav for parent mode
    if (state.isParent) {
        if (header) header.classList.add('hidden');
        if (nav) nav.classList.add('hidden');
        return; // Parent has its own UI
    } else {
        if (header) header.classList.remove('hidden');
        if (nav) nav.classList.remove('hidden');
    }

    const levelName = (LEVELS[state.currentLevel] ? LEVELS[state.currentLevel].name : '...');

    if (badge) {
        badge.textContent = levelName;
        badge.classList.remove('hidden');
    }

    if (state.isTeacher) {
        label.textContent = `${levelName} - معلم`;
        label.className = "text-xs text-yellow-300 font-bold";
        btn.innerHTML = '<i data-lucide="log-out" class="w-5 h-5"></i>';
        btn.onclick = logout; // Bind logout
        btn.className = "p-2 bg-red-800/80 rounded-full hover:bg-red-600 transition text-white border border-red-500/50";
    } else {
        label.textContent = `${levelName} - طالب`;
        label.className = "text-xs text-teal-200 mt-0.5";
        btn.innerHTML = '<i data-lucide="log-out" class="w-5 h-5"></i>'; // Also logout for student to switch level
        btn.onclick = logout;
        btn.className = "p-2 bg-teal-800/80 rounded-full hover:bg-teal-600 transition text-white border border-teal-500/50";
    }

    refreshAllData();
}

function refreshAllData() {
    if (state.currentView === 'home') renderHome();
    if (state.currentView === 'competitions') renderCompetitions();
    if (state.currentView === 'students') renderStudents();
}

// --- Router ---
const router = {
    routes: {
        home: renderHome,
        competitions: renderCompetitions,
        students: renderStudents,
        settings: renderSettings,
        parent: renderParentDashboard
    },
    cleanup() {
        // Unsubscribe from all active listeners to prevent memory leaks/lag
        if (studentsUnsubscribe) { studentsUnsubscribe(); studentsUnsubscribe = null; }
        if (competitionsUnsubscribe) { competitionsUnsubscribe(); competitionsUnsubscribe = null; }
        if (activeGroupsUnsubscribe) { activeGroupsUnsubscribe(); activeGroupsUnsubscribe = null; }
        if (scoresUnsubscribe) { scoresUnsubscribe(); scoresUnsubscribe = null; }
        if (homeStudentsUnsubscribe) { homeStudentsUnsubscribe(); homeStudentsUnsubscribe = null; }
        if (homeGroupsUnsubscribe) { homeGroupsUnsubscribe(); homeGroupsUnsubscribe = null; }
    },
    // History-aware navigation
    navigate(view) {
        if (state.currentView === view) return;
        // Push to history
        history.pushState({ view: view }, '', `#${view}`);
        this.render(view);
    },

    // Render the view (internal)
    render(view) {
        // Cleanup previous view's listeners
        this.cleanup();

        state.currentView = view;
        $$('.nav-item').forEach(el => {
            const isActive = el.dataset.target === view;
            if (isActive) {
                el.classList.add('text-teal-600', 'dark:text-teal-400');
                el.classList.remove('text-gray-400');
            } else {
                el.classList.remove('text-teal-600', 'dark:text-teal-400');
                el.classList.add('text-gray-400');
            }
        });

        const container = $('#view-container');
        // Simple loading indicator for better UX
        container.innerHTML = '<div class="flex justify-center p-8"><i data-lucide="loader-2" class="animate-spin w-8 h-8 text-teal-600"></i></div>';
        lucide.createIcons();

        // Small delay to allow UI to paint loading state if needed, or just execute
        setTimeout(() => {
            if (this.routes[view]) {
                this.routes[view]();
            }
        }, 10);
    }
};

// --- View Renderers ---

function renderHome() {
    const container = $('#view-container');

    container.innerHTML = `
        <div class="space-y-6 animate-fade-in">
            <div class="bg-gradient-to-br from-teal-500 to-emerald-600 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden">
                <div class="absolute -right-10 -top-10 bg-white/10 w-40 h-40 rounded-full blur-2xl"></div>
                <div class="absolute -left-10 -bottom-10 bg-black/10 w-40 h-40 rounded-full blur-2xl"></div>
                
                <div class="relative z-10 text-center">
                    <h2 class="text-2xl font-bold mb-1">لوحة المتصدرين</h2>
                    <p class="text-teal-100 text-sm">أفضل الطلاب أداءً - ${(LEVELS[state.currentLevel] ? LEVELS[state.currentLevel].name : '')}</p>
                    
                    <div id="top-3-container" class="mt-6 flex justify-center gap-4">
                        <i data-lucide="loader-2" class="w-8 h-8 animate-spin text-white"></i>
                    </div>
                </div>
            </div>

            ${state.isTeacher ? `
            <div class="grid grid-cols-3 gap-3">
                <button onclick="router.navigate('students')" class="bg-white dark:bg-gray-800 p-3 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col items-center gap-2 hover:border-teal-500 transition">
                    <div class="bg-teal-100 dark:bg-teal-900/40 p-2.5 rounded-xl text-teal-600 dark:text-teal-400">
                        <i data-lucide="user-plus" class="w-5 h-5"></i>
                    </div>
                    <span class="font-medium text-[11px] sm:text-xs">إدارة الطلاب</span>
                </button>
                <button onclick="router.navigate('competitions')" class="bg-white dark:bg-gray-800 p-3 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col items-center gap-2 hover:border-teal-500 transition">
                    <div class="bg-purple-100 dark:bg-purple-900/40 p-2.5 rounded-xl text-purple-600 dark:text-purple-400">
                        <i data-lucide="trophy" class="w-5 h-5"></i>
                    </div>
                    <span class="font-medium text-[11px] sm:text-xs">إدارة المسابقات</span>
                </button>
                <button onclick="openQuranSearchModal()" class="bg-white dark:bg-gray-800 p-3 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col items-center gap-2 hover:border-emerald-500 transition">
                    <div class="bg-emerald-100 dark:bg-emerald-900/40 p-2.5 rounded-xl text-emerald-600 dark:text-emerald-400">
                        <i data-lucide="book" class="w-5 h-5"></i>
                    </div>
                    <span class="font-medium text-[11px] sm:text-xs">بحث المصحف</span>
                </button>
            </div>
            ` : ''}

            <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="font-bold text-gray-800 dark:text-gray-100">المجموعات المتميزة</h3>
                    <span class="text-teal-600 text-xs font-bold bg-teal-50 dark:bg-teal-900/30 px-2 py-1 rounded-lg">الأعلى نقاطاً</span>
                </div>
                <div id="top-groups-list" class="space-y-3">
                     <div class="text-center py-4 text-gray-400 text-sm">جاري التحميل...</div>
                </div>
            </div>
        </div>
    `;

    // Fetch GLOBAL students for leaderboard calculation, scoped to LEVEL
    if (homeStudentsUnsubscribe) homeStudentsUnsubscribe();

    // Query filtered by current level
    const q = window.firebaseOps.query(
        window.firebaseOps.collection(window.db, "students"),
        window.firebaseOps.where("level", "==", state.currentLevel)
    );

    homeStudentsUnsubscribe = window.firebaseOps.onSnapshot(q, (snap) => {
        state.students = [];
        snap.forEach(function (d) {
            var data = d.data();
            data.id = d.id;
            state.students.push(data);
        });
        calculateLeaderboard();
    });

    if (scoresUnsubscribe) {
        scoresUnsubscribe();
    }

    // Listen to scores
    scoresUnsubscribe = window.firebaseOps.onSnapshot(window.firebaseOps.collection(window.db, "scores"), (snapshot) => {
        const scores = [];
        snapshot.forEach(doc => scores.push(doc.data()));
        state.scores = scores;
        calculateLeaderboard();
    });

    lucide.createIcons();
}

function calculateLeaderboard() {
    // 0. Filter by Active Competition (if any)
    const activeComp = state.competitions.find(function (c) { return c.active; });

    // 1. Calculate Student Totals
    const studentTotals = state.students.map(function (student) {
        const myScores = state.scores.filter(function (s) {
            if (s.studentId !== student.id) return false;
            if (activeComp) return s.competitionId === activeComp.id;
            return true;
        });
        const total = myScores.reduce(function (sum, score) { return sum + parseInt(score.points); }, 0);
        var sClone = Object.assign({}, student);
        sClone.totalScore = total;
        return sClone;
    }).sort(function (a, b) { return b.totalScore - a.totalScore; });

    updateTop3UI(studentTotals.slice(0, 3));

    // 2. Calculate Group Totals (students sum + group_scores bonus)
    const gq = window.firebaseOps.query(window.firebaseOps.collection(window.db, "groups"));
    window.firebaseOps.getDocs(gq).then(function (snap) {
        const allGroups = [];
        snap.forEach(function (d) {
            var data = d.data();
            data.id = d.id;
            allGroups.push(data);
        });

        const validGroups = allGroups.filter(function (g) {
            if (g.level && g.level !== state.currentLevel) return false;
            if (activeComp) return g.competitionId === activeComp.id;
            return true;
        });

        // Fetch group_scores for bonus points
        const gsq = window.firebaseOps.query(window.firebaseOps.collection(window.db, "group_scores"));
        window.firebaseOps.getDocs(gsq).then(function (gsSnap) {
            const groupBonusMap = {};
            gsSnap.forEach(function (d) {
                var gs = d.data();
                if (activeComp && gs.competitionId !== activeComp.id) return;
                if (!groupBonusMap[gs.groupId]) groupBonusMap[gs.groupId] = 0;
                groupBonusMap[gs.groupId] += (parseInt(gs.points) || 0);
            });

            const groupTotals = validGroups.map(function (group) {
                var membersScore = 0;
                if (group.members) {
                    group.members.forEach(function (mId) {
                        var sItem = studentTotals.find(function (s) { return s.id === mId; });
                        membersScore += sItem ? sItem.totalScore : 0;
                    });
                }
                var bonusScore = groupBonusMap[group.id] || 0;
                var gFinal = Object.assign({}, group);
                gFinal.totalScore = membersScore + bonusScore;
                gFinal.bonusScore = bonusScore;
                return gFinal;
            }).sort(function (a, b) { return b.totalScore - a.totalScore; });

            updateTopGroupsUI(groupTotals.slice(0, 5));
        }).catch(function(err) {
            console.warn("Could not fetch group_scores (table may not exist yet):", err);
            // Fallback without group bonus points
            const groupTotals = validGroups.map(function (group) {
                var membersScore = 0;
                if (group.members) {
                    group.members.forEach(function (mId) {
                        var sItem = studentTotals.find(function (s) { return s.id === mId; });
                        membersScore += sItem ? sItem.totalScore : 0;
                    });
                }
                var gFinal = Object.assign({}, group);
                gFinal.totalScore = membersScore;
                gFinal.bonusScore = 0;
                return gFinal;
            }).sort(function (a, b) { return b.totalScore - a.totalScore; });

            updateTopGroupsUI(groupTotals.slice(0, 5));
        });
    });
}

function updateTop3UI(top3) {
    const container = $('#top-3-container');
    if (!container) return;

    if (top3.length === 0) {
        container.innerHTML = '<p class="text-white/70 text-sm pb-4">لا توجد بيانات بعد</p>';
        return;
    }

    // تصميم جديد أفضل - قائمة بسيطة وواضحة
    const medals = ['🥇', '🥈', '🥉'];
    const bgColors = ['bg-yellow-500/20', 'bg-gray-400/20', 'bg-orange-500/20'];

    container.innerHTML = `
        <div class="w-full space-y-2">
            ${top3.map((student, i) => {
        const iconHtml = isImgSrc(student.icon)
            ? `<img src="${student.icon}" class="w-full h-full object-cover">`
            : (student.icon || '👤');
        return `
                <div class="flex items-center gap-3 ${bgColors[i]} backdrop-blur-sm rounded-xl px-3 py-2">
                    <span class="text-xl">${medals[i]}</span>
                    <div class="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center text-lg overflow-hidden border-2 border-white/50 shrink-0">
                        ${iconHtml}
                    </div>
                    <div class="flex-1 min-w-0">
                        <p class="font-bold text-white text-sm truncate">${student.name}</p>
                    </div>
                    <div class="bg-white/20 px-3 py-1 rounded-lg">
                        <span class="font-bold text-white">${student.totalScore}</span>
                        <span class="text-white/70 text-xs">نقطة</span>
                    </div>
                </div>
            `}).join('')}
        </div>
    `;
}

function updateTopGroupsUI(groups) {
    const list = $('#top-groups-list');
    if (!list) return;

    if (groups.length === 0) {
        list.innerHTML = '<p class="text-center text-gray-400 text-sm py-4">لا توجد مجموعات</p>';
        return;
    }

    list.innerHTML = groups.map((g, i) => {
        const isImg = isImgSrc(g.icon);
        const iconHtml = isImg
            ? `<div class="w-10 h-10 rounded-full overflow-hidden border border-gray-200"><img src="${g.icon}" class="w-full h-full object-cover"></div>`
            : `<div class="text-2xl">${g.emoji || g.icon || '🛡️'}</div>`;

        return `
        <div class="flex items-center gap-4 p-3 rounded-xl bg-gray-50 dark:bg-gray-700/50">
            ${iconHtml}
            <div class="flex-1">
                <h4 class="font-bold text-sm text-gray-800 dark:text-gray-100">${g.name}</h4>
                <p class="text-xs text-gray-500">مجموع النقاط: ${g.totalScore}</p>
            </div>
            <span class="font-bold text-teal-600 text-lg">#${i + 1}</span>
        </div>
    `}).join('');
}

function renderCompetitions() {
    const container = $('#view-container');
    container.innerHTML = `
        <div class="space-y-4 animate-fade-in">
            <div class="flex justify-between items-center mb-2">
                <h2 class="text-xl font-bold">المسابقات - ${(LEVELS[state.currentLevel] ? LEVELS[state.currentLevel].name : '')}</h2>
                ${state.isTeacher ? `
                <button onclick="openAddCompetitionModal()" class="bg-teal-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg hover:bg-teal-700 transition flex items-center gap-2">
                    <i data-lucide="plus" class="w-4 h-4"></i>
                    جديد
                </button>
                ` : ''}
            </div>
            
            <div id="competitions-list" class="space-y-4 min-h-[100px] relative">
                <div class="bg-white dark:bg-gray-800 rounded-2xl p-8 py-12 text-center border-2 border-dashed border-gray-200 dark:border-gray-700">
                    <i data-lucide="loader-2" class="w-8 h-8 text-teal-600 animate-spin mx-auto mb-2"></i>
                    <p class="text-gray-500 text-sm">جاري التحميل...</p>
                </div>
            </div>
        </div>
        </div>
    `;

    // Ensure modals are in body
    ensureGlobalModals();

    // Supabase Listener
    if (competitionsUnsubscribe) {
        competitionsUnsubscribe();
        competitionsUnsubscribe = null;
    }

    const q = window.firebaseOps.query(
        window.firebaseOps.collection(window.db, "competitions")
    );

    competitionsUnsubscribe = window.firebaseOps.onSnapshot(q, function (snapshot) {
        const comps = [];
        snapshot.forEach(function (doc) {
            var data = doc.data();
            data.id = doc.id;
            // Filter by level or 'general' (documents without level field)
            if (!data.level || data.level === state.currentLevel) {
                comps.push(data);
            }
        });
        // Client-side Sort (Supabase returns ISO strings)
        comps.sort(function (a, b) {
            const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return bTime - aTime;
        });
        state.competitions = comps;
        updateCompetitionsListUI();
    });
    lucide.createIcons();
}

function updateCompetitionsListUI() {
    const list = $('#competitions-list');
    if (!list) return;

    if (state.competitions.length === 0) {
        list.innerHTML = `
            <div class="bg-white dark:bg-gray-800 rounded-2xl p-8 py-12 text-center border-2 border-dashed border-gray-200 dark:border-gray-700">
                <div class="inline-block p-4 bg-gray-100 dark:bg-gray-700 rounded-full mb-4">
                    <i data-lucide="trophy" class="w-8 h-8 text-gray-400"></i>
                </div>
                <h3 class="text-gray-900 dark:text-white font-bold">لا توجد مسابقات حالياً</h3>
                <p class="text-gray-500 text-sm mt-1">المسابقات التي يتم إنشاؤها ستظهر هنا</p>
            </div>
        `;
    } else {
        list.innerHTML = state.competitions.map(comp => `
            <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 hover:shadow-md transition border border-transparent hover:border-teal-100 dark:hover:border-teal-900">
                <div class="flex items-center gap-4 mb-3">
                    <div class="w-12 h-12 bg-teal-50 dark:bg-teal-900/20 rounded-xl flex items-center justify-center text-2xl">
                        ${comp.icon || '🏆'}
                    </div>
                    <div>
                        <h3 class="font-bold text-gray-900 dark:text-white">${comp.name}</h3>
                        <p class="text-xs text-gray-500">${comp.level ? (LEVELS[comp.level] ? LEVELS[comp.level].name : 'عام') : 'عام'}</p>
                    </div>
                ${state.isTeacher ? `
                <div class="mr-auto flex gap-1">
                    <button onclick="toggleCompetitionActive('${comp.id}')" class="p-2 rounded-lg transition ${comp.active ? 'text-yellow-500 bg-yellow-50' : 'text-gray-300 hover:text-yellow-500 hover:bg-yellow-50'}" title="${comp.active ? 'نشطة (تظهر للطلاب)' : 'تفعيل للعرض'}">
                        <i data-lucide="star" class="w-4 h-4 ${comp.active ? 'fill-yellow-500' : ''}"></i>
                    </button>
                    <button onclick="openEditCompetition('${comp.id}')" class="p-2 text-teal-600 hover:bg-teal-50 rounded-lg transition" title="تعديل">
                        <i data-lucide="edit-2" class="w-4 h-4"></i>
                    </button>
                    <button onclick="resetCompetition('${comp.id}')" class="p-2 text-orange-500 hover:bg-orange-50 rounded-lg transition" title="تصفير الدرجات">
                        <i data-lucide="refresh-ccw" class="w-4 h-4"></i>
                    </button>
                    <button onclick="deleteCompetition('${comp.id}')" class="p-2 text-red-400 hover:bg-red-50 rounded-lg transition" title="حذف">
                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                    </button>
                </div>
                ` : ''}
                </div>
                
                <div class="grid grid-cols-2 gap-2 mt-4">
                    ${state.isTeacher ? `
                    <button onclick="openGradingSession('${comp.id}')" class="bg-teal-600 text-white py-2 rounded-xl text-sm font-bold hover:bg-teal-700 transition flex items-center justify-center gap-2">
                        <i data-lucide="star" class="w-4 h-4"></i>
                        رصد درجات
                    </button>
                    ` : ''}
                     <button onclick="openManageGroups('${comp.id}', '${comp.name}')" class="${state.isTeacher ? '' : 'col-span-2'} bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 py-2 rounded-xl text-sm font-bold hover:bg-gray-200 transition flex items-center justify-center gap-2">
                        <i data-lucide="users" class="w-4 h-4"></i>
                        المجموعات
                    </button>
                </div>
            </div>
        `).join('');
    }
    lucide.createIcons();
}

function renderStudents() {
    const container = $('#view-container');

    if (!state.isTeacher && !state.isParent && window._currentLoggedInStudentId) {
        window.firebaseOps.getDoc(window.firebaseOps.doc(window.db, "students", window._currentLoggedInStudentId))
            .then(docSnap => {
                if (state.currentView !== 'students') return; // Prevent async overwrite if user navigated away
                if(docSnap.exists()) {
                    window._currentStudentRecord = docSnap.data();
                    window._currentStudentRecord.id = docSnap.id;
                    openStudentReport(window._currentLoggedInStudentId);
                } else {
                    container.innerHTML = '<p class="text-center p-8">خطأ: لم يتم العثور على الطالب</p>';
                }
            });
        return;
    }

    container.innerHTML = `
        <div class="space-y-4 animate-fade-in">
            <div class="flex justify-between items-center mb-2">
                <h2 class="text-xl font-bold">الطلاب - ${(LEVELS[state.currentLevel] ? LEVELS[state.currentLevel].name : '')}</h2>
                ${state.isTeacher ? `
                <button onclick="openAddStudentModal()" class="bg-teal-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg hover:bg-teal-700 transition flex items-center gap-2">
                    <i data-lucide="user-plus" class="w-4 h-4"></i>
                    جديد
                </button>
                ` : ''}
            </div>

            <!-- Search Bar -->
            <div class="relative mb-2">
                <i data-lucide="search" class="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2"></i>
                <input type="text" id="student-search-input" oninput="filterStudents(this.value)" 
                    class="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl pr-10 pl-4 py-2.5 text-sm focus:outline-none focus:border-teal-500 transition" 
                    placeholder="بحث بالاسم أو رقم الجوال...">
            </div>

            <div id="students-list" class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm divide-y divide-gray-100 dark:divide-gray-700 overflow-hidden min-h-[100px] relative">
                <div class="flex flex-col items-center justify-center py-8 text-gray-400">
                     <i data-lucide="loader-2" class="w-6 h-6 animate-spin mb-2"></i>
                     <p class="text-xs">جاري جلب الطلاب...</p>
                </div>
            </div>
        </div>
        </div>
    `;

    // Ensure modals are in body
    ensureGlobalModals();

    // Performance: If we have cached data, show it immediately
    if (state.students && state.students.length > 0) {
        updateStudentsListUI();
    }

    // Listener
    if (studentsUnsubscribe) {
        studentsUnsubscribe();
        studentsUnsubscribe = null;
    }

    const q = window.firebaseOps.query(
        window.firebaseOps.collection(window.db, "students"),
        window.firebaseOps.where("level", "==", state.currentLevel)
        // orderBy removed to avoid Index Error
    );

    studentsUnsubscribe = window.firebaseOps.onSnapshot(q, (snapshot) => {
        const students = [];
        snapshot.forEach((doc) => {
            var data = doc.data();
            data.id = doc.id;
            students.push(data);
        });
        // Client-side Sort (Supabase returns ISO strings for created_at)
        students.sort((a, b) => {
            const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return bTime - aTime;
        });
        state.students = students;
        updateStudentsListUI();
    });
    lucide.createIcons();
}

function updateStudentsListUI() {
    const list = $('#students-list');
    if (!list) return;

    if (state.students.length === 0) {
        list.innerHTML = `
            <div class="flex flex-col items-center justify-center py-12 text-gray-400">
                <i data-lucide="users" class="w-12 h-12 mb-3 opacity-20"></i>
                <p class="text-sm font-medium">لا يوجد طلاب حتى الآن</p>
                ${state.isTeacher ? '<p class="text-xs mt-1">اضغط على "جديد" لإضافة طلاب</p>' : ''}
            </div>
        `;
    } else {
        list.innerHTML = state.students.map(student => {
            const isImg = isImgSrc(student.icon);
            const iconHtml = isImg
                ? `<img src="${student.icon}" class="w-full h-full object-cover">`
                : (student.icon || '👤');

            return `
            <div class="p-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition group border-b border-gray-100 dark:border-gray-700 last:border-0">
                <div onclick="openStudentReport('${student.id}')" class="w-12 h-12 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center text-xl shadow-sm border border-gray-200 dark:border-gray-600 overflow-hidden cursor-pointer shrink-0">
                    ${iconHtml}
                </div>
                <div class="flex-1 min-w-0" onclick="openStudentReport('${student.id}')" style="cursor:pointer">
                    <h4 class="font-bold text-gray-800 dark:text-gray-100 truncate">${student.name}</h4>
                    <div class="flex flex-wrap gap-1 text-xs text-gray-500 mt-0.5">
                        ${(state.isTeacher && student.studentNumber) ? `<span class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-[10px] text-gray-500 tracking-wider">${student.studentNumber}</span>` : ''}
                        ${student.password ? '<span class="text-green-500">🔐</span>' : '<span class="text-orange-400">⚠️ بدون كلمة مرور</span>'}
                    </div>
                </div>
                <div class="flex gap-1 shrink-0">
                    <button onclick="event.stopPropagation(); openEditStudent('${student.id}')" class="p-2 text-gray-400 hover:text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-900/20 rounded-lg transition" title="تعديل">
                        <i data-lucide="edit-2" class="w-4 h-4"></i>
                    </button>
                    ${state.isTeacher ? `
                    <button onclick="event.stopPropagation(); confirmDeleteStudent('${student.id}')" class="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition" title="حذف">
                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                    </button>
                    ` : ''}
                </div>
            </div>
        `}).join('');
        lucide.createIcons();
    }
}

// نقل الطالب لمرحلة أخرى - فتح نافذة الاختيار
function openTransferStudent(studentId) {
    const student = state.students.find(s => s.id === studentId);
    if (!student) return;

    // تعبئة بيانات النافذة
    $('#transfer-student-id').value = studentId;
    $('#transfer-student-name').textContent = `نقل "${student.name}" إلى مرحلة أخرى`;

    // تعبئة قائمة المراحل (استثناء المرحلة الحالية)
    const select = $('#transfer-target-level');
    select.innerHTML = '<option value="">-- اختر المرحلة --</option>';

    Object.entries(LEVELS).forEach(([key, val]) => {
        if (key !== state.currentLevel) {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = `${val.emoji} ${val.name}`;
            select.appendChild(option);
        }
    });

    toggleModal('transfer-modal', true);
    lucide.createIcons();
}

// تأكيد نقل الطالب
async function confirmTransferStudent() {
    const studentId = $('#transfer-student-id').value;
    const targetLevel = $('#transfer-target-level').value;

    if (!studentId || !targetLevel) {
        showToast("يرجى اختيار المرحلة", "error");
        return;
    }

    try {
        await window.firebaseOps.updateDoc(
            window.firebaseOps.doc(window.db, "students", studentId),
            { level: targetLevel, updatedAt: new Date() }
        );
        showToast(`تم نقل الطالب إلى ${LEVELS[targetLevel].name}`);
        closeModal('transfer-modal');
    } catch (e) {
        console.error(e);
        showToast("فشل النقل", "error");
    }
}

function renderSettings() {
    const container = $('#view-container');

    // Load teacher info if teacher
    let teacherInfoHTML = '';
    if (state.isTeacher) {
        teacherInfoHTML = `
             <!-- Teacher Contact Info -->
             <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border">
                 <h3 class="font-bold mb-4 flex items-center gap-2"><i data-lucide="users" class="w-5 h-5 text-purple-600"></i> المعلمون</h3>
                 <p class="text-xs text-gray-500 mb-3">هذه البيانات ستظهر لولي الأمر للتواصل</p>
                 
                 <!-- Teachers List -->
                 <div id="teachers-list" class="space-y-2 mb-4">
                     <div class="text-center py-2 text-gray-400"><i data-lucide="loader-2" class="w-5 h-5 animate-spin mx-auto"></i></div>
                 </div>

                 <!-- Add New Teacher -->
                 <div class="border-t pt-4 mt-4">
                     <h4 class="font-bold text-sm mb-3 text-purple-600">➕ إضافة معلم جديد</h4>
                     <div class="space-y-3">
                         <div>
                             <label class="block text-sm font-bold mb-1">اسم المعلم</label>
                             <input type="text" id="teacher-name-setting" class="w-full bg-gray-50 dark:bg-gray-700 border rounded-xl px-4 py-2" placeholder="الأستاذ محمد">
                         </div>
                         <div>
                             <label class="block text-sm font-bold mb-1">رقم الجوال (WhatsApp)</label>
                             <input type="tel" id="teacher-phone-setting" dir="ltr" class="w-full bg-gray-50 dark:bg-gray-700 border rounded-xl px-4 py-2 text-left" placeholder="966xxxxxxxxx">
                             <p class="text-xs text-gray-400 mt-1">الأرقام السعودية: أدخل 966 أو 05</p>
                         </div>
                         <button onclick="addNewTeacher()" class="w-full py-2 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-700 transition">
                             إضافة المعلم
                         </button>
                     </div>
                 </div>
             </div>
        `;
    }

    container.innerHTML = `
        <div class="space-y-4 animate-fade-in">
             <h2 class="text-xl font-bold mb-4">الإعدادات</h2>
             
             <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm">
                 <div class="flex items-center justify-between">
                     <div class="flex items-center gap-3">
                         <div class="bg-gray-100 dark:bg-gray-700 p-2 rounded-lg">
                             <i data-lucide="moon" class="w-5 h-5 text-gray-600 dark:text-gray-300"></i>
                         </div>
                         <span class="font-medium">الوضع الليلي</span>
                     </div>
                     <button onclick="toggleTheme()" class="w-12 h-7 ${state.darkMode ? 'bg-teal-600' : 'bg-gray-200'} rounded-full relative transition-colors duration-300">
                         <div class="w-5 h-5 bg-white rounded-full absolute top-1 ${state.darkMode ? 'left-6' : 'left-1'} transition-all duration-300 shadow-sm"></div>
                     </button>
                 </div>
             </div>




             ${teacherInfoHTML}

             ${state.isTeacher ? `
             <!-- Export & Tools -->
             <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border">
                 <h3 class="font-bold mb-3 flex items-center gap-2"><i data-lucide="wrench" class="w-5 h-5 text-teal-600"></i> أدوات</h3>
                 <div class="grid grid-cols-2 gap-3">
                     <button onclick="openReportsModal()" class="col-span-2 flex items-center justify-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-100 dark:border-red-800 hover:bg-red-100 transition">
                         <i data-lucide="file-text" class="w-5 h-5 text-red-600"></i>
                         <span class="text-xs font-bold text-red-700 dark:text-red-400">إنشاء تقرير المجموعات (PDF)</span>
                     </button>
                     <button onclick="openBulkWhatsAppModal()" class="col-span-2 flex items-center justify-center gap-2 p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-100 dark:border-emerald-800 hover:bg-emerald-100 transition">
                         <i data-lucide="message-circle" class="w-5 h-5 text-emerald-600"></i>
                         <span class="text-xs font-bold text-emerald-700 dark:text-emerald-400">واتساب مجمع</span>
                     </button>
                 </div>
             </div>
             ` : ''}

             <div class="text-center text-xs text-gray-400 mt-8 mb-4">
                 <p>مسابقات ابن تيمية - إصدار v4.3.0</p>
                 <p class="opacity-50 mt-1 font-light">تم إنشاء هذا التطبيق بواسطة أكرم عقل</p>
             </div>
        </div>
    `;
    lucide.createIcons();

    // Load existing teachers list
    if (state.isTeacher) {
        loadTeachersList();
    }
}

function forceUpdateApp() {
    showToast("جاري التحديث الشامل...");

    // 1. Unregister all service workers if possible
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(function (registrations) {
            for (var i = 0; i < registrations.length; i++) {
                registrations[i].unregister();
            }
        });
    }

    // 2. Clear caches
    if ('caches' in window) {
        caches.keys().then(function (names) {
            for (var name of names) caches.delete(name);
        });
    }

    // 3. Reload with force (cache: reload)
    setTimeout(function () {
        window.location.reload(true);
    }, 1000);
}

async function loadTeachersList() {
    const listContainer = $('#teachers-list');
    if (!listContainer) return;

    try {
        const q = window.firebaseOps.query(
            window.firebaseOps.collection(window.db, "teachers"),
            window.firebaseOps.where("level", "==", state.currentLevel)
        );
        const snap = await window.firebaseOps.getDocs(q);

        if (snap.empty) {
            listContainer.innerHTML = '<p class="text-center text-gray-400 text-sm py-2">لا يوجد معلمون مسجلون حالياً</p>';
            return;
        }

        let html = '';
        snap.forEach(doc => {
            const t = doc.data();
            html += `
            <div class="flex items-center justify-between bg-gray-50 dark:bg-gray-700 rounded-xl p-3">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 bg-purple-100 dark:bg-purple-900 rounded-full flex items-center justify-center text-lg">👨‍🏫</div>
                    <div>
                        <p class="font-bold text-sm">${t.name}</p>
                        <p class="text-xs text-gray-500" dir="ltr">${t.phone}</p>
                    </div>
                </div>
                <button onclick="deleteTeacher('${doc.id}')" class="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition">
                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>
            </div>
            `;
        });

        listContainer.innerHTML = html;
        lucide.createIcons();
    } catch (e) {
        console.error("Error loading teachers:", e);
        listContainer.innerHTML = '<p class="text-center text-red-500 text-sm py-2">خطأ في تحميل البيانات</p>';
    }
}

async function addNewTeacher() {
    const nameEl = $('#teacher-name-setting');
    const phoneEl = $('#teacher-phone-setting');
    const name = nameEl ? nameEl.value.trim() : '';
    let phone = phoneEl ? phoneEl.value.trim() : '';

    if (!name || !phone) {
        showToast("الرجاء إدخال الاسم والرقم", "error");
        return;
    }

    // Normalize phone
    phone = normalizePhone(phone);

    try {
        const data = {
            name,
            phone,
            level: state.currentLevel,
            createdAt: new Date().toISOString()
        };

        await window.firebaseOps.addDoc(window.firebaseOps.collection(window.db, "teachers"), data);
        showToast("تم إضافة المعلم بنجاح ✅");

        // Clear inputs
        $('#teacher-name-setting').value = '';
        $('#teacher-phone-setting').value = '';

        // Reload list
        loadTeachersList();
    } catch (e) {
        console.error(e);
        showToast("خطأ في الإضافة", "error");
    }
}

async function deleteTeacher(teacherId) {
    // Create confirmation modal instead of confirm() which may not work in WebView
    let modal = document.getElementById('confirm-delete-teacher-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'confirm-delete-teacher-modal';
        document.body.appendChild(modal);
    }

    modal.className = 'fixed inset-0 bg-black/50 z-[150] flex items-center justify-center p-4 backdrop-blur-sm';
    modal.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-xs p-6 shadow-2xl text-center">
            <div class="bg-red-100 dark:bg-red-900/30 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-red-600 dark:text-red-400">
                <i data-lucide="trash-2" class="w-8 h-8"></i>
            </div>
            <h3 class="font-bold text-lg mb-2">حذف المعلم؟</h3>
            <p class="text-gray-500 text-sm mb-6">هل أنت متأكد من حذف هذا المعلم؟</p>
            <div class="flex gap-3">
                <button onclick="document.getElementById('confirm-delete-teacher-modal').remove()" class="flex-1 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600">إلغاء</button>
                <button onclick="confirmDeleteTeacher('${teacherId}')" class="flex-1 py-2 rounded-xl bg-red-600 text-white hover:bg-red-700 shadow-lg">حذف</button>
            </div>
        </div>
    `;

    lucide.createIcons();
}

async function confirmDeleteTeacher(teacherId) {
    const teacherModal = document.getElementById('confirm-delete-teacher-modal');
    if (teacherModal) teacherModal.remove();
    try {
        await window.firebaseOps.deleteDoc(window.firebaseOps.doc(window.db, "teachers", teacherId));
        showToast("تم حذف المعلم");
        loadTeachersList();
    } catch (e) {
        console.error(e);
        showToast("خطأ في الحذف", "error");
    }
}

function toggleTheme() {
    state.darkMode = !state.darkMode;
    applyTheme();
    localStorage.setItem('darkMode', state.darkMode);
}

function applyTheme() {
    if (state.darkMode) {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
}



// --- Modals HTML generation to keep JS clean ---
// Implement Data Wipe Functions here (Global Scope)
// Data Wipe Functions Removed per user request

function getStudentModalHTML() {
    return `
    <div id="student-modal" class="fixed inset-0 bg-black/50 z-[100] hidden flex items-center justify-center p-0 sm:p-4 backdrop-blur-sm">
        <div class="bg-white dark:bg-gray-800 rounded-t-3xl sm:rounded-2xl w-full max-w-md p-6 shadow-2xl h-[90vh] sm:h-auto overflow-y-auto">
             <h3 id="student-modal-title" class="text-lg font-bold mb-6">إضافة طالب جديد</h3>
             <form id="student-form" onsubmit="handleSaveStudent(event)">
                 <input type="hidden" id="student-id">
                 
                 <div class="mb-4 flex flex-col items-center gap-3">
                        <div id="student-emoji-preview" class="w-24 h-24 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center text-4xl shadow-inner border-2 border-dashed border-gray-300 dark:border-gray-600 overflow-hidden">
                            👤
                        </div>
                        <div class="flex gap-2">
                             <button type="button" onclick="openImagePicker()" class="flex items-center gap-2 px-4 py-2 bg-teal-50 dark:bg-teal-900/30 text-teal-600 rounded-xl text-sm font-medium hover:bg-teal-100 transition">
                                 <i data-lucide="image" class="w-4 h-4"></i>
                                 رفع صورة
                             </button>
                             <button type="button" onclick="openEmojiPicker()" class="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-900/30 text-amber-600 rounded-xl text-sm font-medium hover:bg-amber-100 transition">
                                 <i data-lucide="smile" class="w-4 h-4"></i>
                                 إيموجي
                             </button>
                        </div>
                        <input type="file" id="student-image-upload" accept="image/*" class="hidden" onchange="previewStudentImage(this)">
                        <input type="hidden" id="student-emoji" value="👤">
                 </div>

                 <div class="space-y-3">
                     <div>
                         <label class="block text-sm font-bold mb-1">اسم الطالب</label>
                         <input type="text" id="student-name" required class="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 rounded-xl px-4 py-3">
                     </div>

                     <div>
                         <label class="block text-sm font-bold mb-1">رقم ولي الأمر (واتساب)</label>
                         <input type="tel" id="student-number" class="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 rounded-xl px-4 py-3" placeholder="مثال: 966500000000">
                         <p class="text-xs text-gray-400 mt-1">يستخدم للتواصل عبر واتساب عند الغياب</p>
                     </div>
                     
                     <input type="hidden" id="student-memorization">
                     <input type="hidden" id="student-review">


                     
                     <div class="mb-2">
                         <label class="block text-sm font-bold mb-1">كلمة المرور</label>
                         <input type="text" id="student-password-edit" class="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 rounded-xl px-4 py-3" placeholder="كلمة المرور (إلزامي للطلاب الجدد)">
                         <p id="password-error" class="hidden text-red-500 text-xs mt-1 font-bold">⚠️ كلمة المرور مطلوبة للطالب الجديد</p>
                     </div>
                     
                     <div class="flex gap-3 mt-6">
                         <button type="button" onclick="closeModal('student-modal')" class="flex-1 py-3 rounded-xl text-gray-600 hover:bg-gray-100 font-bold transition">إلغاء</button>
                         <button type="submit" id="save-student-btn" class="flex-1 py-3 bg-teal-600 text-white rounded-xl font-bold hover:bg-teal-700 transition"><span id="save-student-text">حفظ</span></button>
                     </div>
                 </div>
             </form>
        </div>
    </div>
    
    <div id="emoji-picker-modal" class="fixed inset-0 bg-black/50 z-[100] hidden flex items-center justify-center p-4 backdrop-blur-sm">
        <div class="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-xs p-4 shadow-2xl">
            <h3 class="font-bold text-center mb-4">اختر إيموجي</h3>
            <div id="emoji-grid" class="grid grid-cols-5 gap-2 max-h-60 overflow-y-auto"></div>
            <button onclick="closeModal('emoji-picker-modal')" class="w-full mt-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 font-medium">إغلاق</button>
        </div>
    </div>

    <div id="delete-modal" class="fixed inset-0 bg-black/50 z-[200] hidden flex items-center justify-center p-4 backdrop-blur-sm">
         <div class="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-xs p-6 shadow-2xl text-center">
            <div class="bg-red-100 dark:bg-red-900/30 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-red-600 dark:text-red-400">
                <i data-lucide="alert-triangle" class="w-8 h-8"></i>
            </div>
            <h3 class="font-bold text-lg mb-2">تأكيد الحذف</h3>
            <p class="text-gray-500 text-sm mb-6">لا يمكن التراجع عن هذه العملية.</p>
            <div class="flex gap-3">
                <button onclick="closeModal('delete-modal')" class="flex-1 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600">إلغاء</button>
                <button id="confirm-delete-btn" class="flex-1 py-2 rounded-xl bg-red-600 text-white hover:bg-red-700 shadow-lg">حذف</button>
            </div>
         </div>
    </div>
    `;
}

// فتح اختيار الصورة من المعرض
function openImagePicker() {
    document.getElementById('student-image-upload').click();
}

// فتح اختيار الإيموجي
function openEmojiPicker() {
    const emojis = ["👤", "🎓", "🏆", "🌟", "📚", "🕌", "⚽", "🧠", "⚔️", "🛡️", "🎒", "🧸", "👦", "👧", "👨‍🎓", "👩‍🎓", "🦁", "🐯", "🦅", "🐎", "🌙", "☀️", "⭐", "🚀", "💪", "🎯", "📖", "✏️", "🎨", "🎵"];

    const grid = document.getElementById('emoji-grid');
    grid.innerHTML = emojis.map(e => `
                        <button type="button" onclick="selectEmoji('${e}')" class="w-12 h-12 text-2xl hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition flex items-center justify-center">
                            ${e}
                        </button>
                        `).join('');

    toggleModal('emoji-picker-modal', true);
}

// اختيار إيموجي
function selectEmoji(emoji) {
    document.getElementById('student-emoji').value = emoji;
    document.getElementById('student-emoji-preview').innerHTML = emoji;
    // مسح أي صورة مرفوعة
    document.getElementById('student-image-upload').value = '';
    closeModal('emoji-picker-modal');
}

async function previewStudentImage(input) {
    if (input.files && input.files[0]) {
        const compressed = await compressImage(input.files[0]);
        const preview = document.getElementById('student-emoji-preview');
        preview.innerHTML = `<img src="${compressed}" class="w-full h-full object-cover">`;
        // مسح قيمة الإيموجي لأن الصورة أولوية
        document.getElementById('student-emoji').value = '';
    }
}

function getCompetitionModalsHTML() {
    // Similar to student modal but for competitions + groups
    return `
                            <div id="competition-modal" class="fixed inset-0 bg-black/50 z-[100] hidden flex items-center justify-center p-0 sm:p-4 backdrop-blur-sm">
                                <div class="bg-white dark:bg-gray-800 rounded-t-3xl sm:rounded-2xl w-full max-w-md p-6 shadow-2xl max-h-[90vh] overflow-y-auto flex flex-col">
                                    <div class="flex justify-between items-center mb-6">
                                        <h3 class="text-lg font-bold">إنشاء مسابقة جديدة</h3>
                                        <button onclick="closeModal('competition-modal')"><i data-lucide="x"></i></button>
                                    </div>
                                    <form id="competition-form" onsubmit="handleSaveCompetition(event)">
                                        <input type="hidden" id="competition-id">
                                            <div class="flex gap-4 mb-4">
                                                <div class="relative group cursor-pointer shrink-0" onclick="toggleEmojiPicker('competition-emoji-btn')">
                                                    <div id="competition-emoji-preview" class="w-16 h-16 bg-teal-50 dark:bg-gray-700 rounded-xl border-2 border-dashed border-teal-300 flex items-center justify-center text-3xl">🏆</div>
                                                    <input type="hidden" id="competition-emoji" value="🏆">
                                                </div>
                                                <div class="flex-1">
                                                    <label class="block text-sm font-bold mb-1">اسم المسابقة</label>
                                                    <input type="text" id="competition-name" required class="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 rounded-xl px-4 py-3">
                                                </div>
                                            </div>

                                            <div class="mb-4">
                                                <label class="block text-sm font-bold mb-2">معايير التقييم</label>
                                                <div id="criteria-list" class="space-y-2 mb-2"></div>
                                                <button type="button" onclick="addCriteriaItem()" class="text-teal-600 text-sm font-bold flex items-center gap-1">+ إضافة معيار</button>
                                            </div>



                                            <div class="mb-4 bg-orange-50 dark:bg-orange-900/10 p-4 rounded-xl border border-orange-100 dark:border-orange-800">
                                                <h4 class="font-bold text-sm text-orange-800 dark:text-orange-300 mb-3 flex items-center gap-2">
                                                    <i data-lucide="user-x" class="w-4 h-4"></i>
                                                    إعدادات خصم الغياب
                                                </h4>
                                                <div class="grid grid-cols-2 gap-3">
                                                    <div>
                                                        <label class="block text-xs font-bold mb-1">بعذر (نقاط)</label>
                                                        <input type="number" id="comp-absent-excuse" class="w-full bg-white dark:bg-gray-800 border border-orange-200 dark:border-orange-700 rounded-lg px-3 py-2 text-center" value="1">
                                                    </div>
                                                    <div>
                                                        <label class="block text-xs font-bold mb-1">بدون عذر (نقاط)</label>
                                                        <input type="number" id="comp-absent-no-excuse" class="w-full bg-white dark:bg-gray-800 border border-orange-200 dark:border-orange-700 rounded-lg px-3 py-2 text-center" value="4">
                                                    </div>
                                                </div>
                                            </div>
                                            
                                            <div class="mb-4 bg-purple-50 dark:bg-purple-900/10 p-3 rounded-xl border border-purple-100 dark:border-purple-800">
                                                <h4 class="font-bold text-sm text-purple-800 dark:text-purple-300 mb-3 flex items-center gap-2">
                                                    <i data-lucide="zap" class="w-4 h-4"></i>
                                                    إعدادات يوم النشاط
                                                </h4>
                                                <div class="grid grid-cols-2 gap-3">
                                                    <div>
                                                        <label class="block text-[10px] font-bold mb-1">نقاط الحضور</label>
                                                        <input type="number" id="comp-activity-points" class="w-full bg-white dark:bg-gray-800 border border-purple-200 dark:border-purple-700 rounded-lg px-3 py-2 text-center text-sm" value="">
                                                    </div>
                                                    <div>
                                                        <label class="block text-[10px] font-bold mb-1 text-red-600">نقاط الخصم (غائب)</label>
                                                        <input type="number" id="comp-activity-absent-points" class="w-full bg-white dark:bg-gray-800 border border-red-200 dark:border-red-700 rounded-lg px-3 py-2 text-center text-sm text-red-600" value="">
                                                    </div>
                                                </div>
                                            </div>

                                            <button type="submit" id="save-competition-btn" class="w-full bg-teal-600 text-white py-3 rounded-xl font-bold hover:bg-teal-700 transition">حفظ المسابقة</button>
                                    </form>
                                </div>
                            </div>

                            <div id="groups-modal" class="fixed inset-0 bg-black/50 z-[100] hidden flex items-center justify-center p-4 backdrop-blur-sm">
                                <div class="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-lg p-0 shadow-2xl max-h-[80vh] flex flex-col">
                                    <div class="p-4 border-b flex justify-between shrink-0">
                                        <div><h3 class="font-bold">إدارة المجموعات</h3><p id="groups-comp-name" class="text-xs text-gray-500"></p></div>
                                        <button onclick="closeModal('groups-modal')"><i data-lucide="x"></i></button>
                                    </div>
                                    <div class="p-4 flex-1 overflow-y-auto">
                                        <button id="add-group-btn" onclick="openAddGroupModal()" class="w-full py-3 border-2 border-dashed border-teal-300 text-teal-600 rounded-xl font-bold mb-4 hover:bg-teal-50 transition hidden">+ مجموعة جديدة</button>
                                        <div id="groups-container" class="space-y-3"></div>
                                    </div>
                                </div>
                            </div>

                            <!-- Add/Edit Group Modal -->
                            <div id="edit-group-modal" class="fixed inset-0 bg-black/60 z-[100] hidden flex items-center justify-center p-4">
                                <div class="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md p-6 shadow-2xl max-h-[90vh] overflow-y-auto flex flex-col">
                                    <div class="flex justify-between items-center mb-4">
                                        <h3 id="group-modal-title" class="font-bold text-lg">إضافة مجموعة</h3>
                                        <button onclick="closeModal('edit-group-modal')" class="text-gray-400 hover:text-gray-600"><i data-lucide="x"></i></button>
                                    </div>

                                    <input type="hidden" id="edit-group-id">

                                        <!-- Group Icon -->
                                        <div class="flex items-center gap-4 mb-4">
                                            <div id="group-icon-preview" class="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-xl flex items-center justify-center text-3xl border-2 border-dashed border-gray-300 overflow-hidden cursor-pointer" onclick="document.getElementById('group-image-upload').click()">
                                                🛡️
                                            </div>
                                            <div class="flex-1">
                                                <input type="text" id="edit-group-name" placeholder="اسم المجموعة" class="w-full mb-2 bg-gray-50 dark:bg-gray-700 border rounded-xl px-4 py-2">
                                                    <div class="flex gap-2">
                                                        <button type="button" onclick="document.getElementById('group-image-upload').click()" class="text-xs bg-teal-50 text-teal-600 px-3 py-1 rounded-lg hover:bg-teal-100">📷 صورة</button>
                                                        <button type="button" onclick="cycleGroupEmoji()" class="text-xs bg-amber-50 text-amber-600 px-3 py-1 rounded-lg hover:bg-amber-100">😊 إيموجي</button>
                                                    </div>
                                            </div>
                                        </div>
                                        <input type="file" id="group-image-upload" accept="image/*" class="hidden" onchange="previewGroupImage(this)">
                                            <input type="hidden" id="group-icon" value="🛡️">

                                                <!-- Leader & Deputy -->
                                                <div class="grid grid-cols-2 gap-3 mb-4">
                                                    <div>
                                                        <label class="block text-xs font-bold text-gray-500 mb-1">👑 القائد</label>
                                                        <select id="group-leader" class="w-full bg-gray-50 dark:bg-gray-700 border rounded-xl px-3 py-2 text-sm">
                                                            <option value="">-- اختر --</option>
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label class="block text-xs font-bold text-gray-500 mb-1">⭐ النائب</label>
                                                        <select id="group-deputy" class="w-full bg-gray-50 dark:bg-gray-700 border rounded-xl px-3 py-2 text-sm">
                                                            <option value="">-- اختر --</option>
                                                        </select>
                                                    </div>
                                                </div>

                                                <!-- Members -->
                                                <div class="mb-4">
                                                    <label class="block text-xs font-bold text-gray-500 mb-2">باقي الأعضاء</label>
                                                    <div id="group-members-selection" class="max-h-32 overflow-y-auto border rounded-xl p-2 bg-gray-50 dark:bg-gray-700"></div>
                                                </div>

                                                <div class="flex gap-2">
                                                    <button onclick="closeModal('edit-group-modal')" class="flex-1 py-3 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 font-medium">إلغاء</button>
                                                    <button onclick="saveGroupChanges()" class="flex-1 py-3 bg-teal-600 text-white rounded-xl font-bold hover:bg-teal-700">حفظ</button>
                                                </div>
                                            </div>
                                        </div>

                                        <!-- Transfer Student Modal -->
                                        <div id="transfer-modal" class="fixed inset-0 bg-black/60 z-[100] hidden flex items-center justify-center p-4">
                                            <div class="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl">
                                                <div class="flex justify-between items-center mb-4">
                                                    <h3 class="font-bold text-lg">نقل الطالب</h3>
                                                    <button onclick="closeModal('transfer-modal')" class="text-gray-400 hover:text-gray-600"><i data-lucide="x"></i></button>
                                                </div>

                                                <input type="hidden" id="transfer-student-id">

                                                    <p id="transfer-student-name" class="text-center text-gray-600 dark:text-gray-300 mb-4 font-medium"></p>

                                                    <label class="block text-sm font-bold text-gray-500 mb-2">اختر المرحلة الجديدة:</label>
                                                    <select id="transfer-target-level" class="w-full bg-gray-50 dark:bg-gray-700 border rounded-xl px-4 py-3 mb-4 text-lg">
                                                        <option value="">-- اختر المرحلة --</option>
                                                    </select>

                                                    <div class="flex gap-2">
                                                        <button onclick="closeModal('transfer-modal')" class="flex-1 py-3 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 font-medium">إلغاء</button>
                                                        <button onclick="confirmTransferStudent()" class="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700">تأكيد النقل</button>
                                                    </div>
                                            </div>
                                        </div>

                                        <!-- Delete Competition Modal -->
                                        <div id="delete-competition-modal" class="fixed inset-0 bg-black/50 z-[200] hidden flex items-center justify-center p-4 backdrop-blur-sm">
                                            <div class="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-xs p-6 shadow-2xl text-center">
                                                <div class="bg-red-100 dark:bg-red-900/30 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-red-600 dark:text-red-400">
                                                    <i data-lucide="alert-triangle" class="w-8 h-8"></i>
                                                </div>
                                                <h3 class="font-bold text-lg mb-2">حذف المسابقة؟</h3>
                                                <p class="text-gray-500 text-sm mb-6">سيتم حذف جميع المجموعات والدرجات المرتبطة بها. هذا الإجراء لا يمكن التراجع عنه.</p>
                                                <div class="flex gap-3">
                                                    <button onclick="closeModal('delete-competition-modal')" class="flex-1 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600">إلغاء</button>
                                                    <button id="confirm-delete-comp-btn" class="flex-1 py-2 rounded-xl bg-red-600 text-white hover:bg-red-700 shadow-lg">حذف نهائي</button>
                                                </div>
                                            </div>
                                        </div>

                                        <!-- Reset Competition Modal -->
                                        <div id="reset-competition-modal" class="fixed inset-0 bg-black/50 z-[200] hidden flex items-center justify-center p-4 backdrop-blur-sm">
                                            <div class="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-xs p-6 shadow-2xl text-center">
                                                <div class="bg-orange-100 dark:bg-orange-900/30 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-orange-600 dark:text-orange-400">
                                                    <i data-lucide="refresh-ccw" class="w-8 h-8"></i>
                                                </div>
                                                <h3 class="font-bold text-lg mb-2">تصفير المسابقة؟</h3>
                                                <p class="text-gray-500 text-sm mb-6">سيتم حذف جميع الدرجات والغياب المسجل في هذه المسابقة فقط. ستبقى المجموعات والطلاب والمعايير كما هي.</p>
                                                <div class="flex gap-3">
                                                    <button onclick="closeModal('reset-competition-modal')" class="flex-1 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600">إلغاء</button>
                                                    <button id="confirm-reset-comp-btn" class="flex-1 py-2 rounded-xl bg-orange-600 text-white hover:bg-orange-700 shadow-lg font-bold">تصفير الآن</button>
                                                </div>
                                            </div>
                                        </div>
                                        `;
}



function getGradingModalsHTML() {
    return `
                                        <div id="grading-modal" class="fixed inset-0 bg-black/50 z-[100] hidden flex items-center justify-center p-4 backdrop-blur-sm">
                                            <div class="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-lg p-0 shadow-2xl max-h-[80vh] flex flex-col">
                                                <!-- Header -->
                                                <div class="p-4 border-b flex justify-between shrink-0 items-center">
                                                    <h3 class="font-bold text-lg">رصد الدرجات</h3>
                                                    <button onclick="closeModal('grading-modal')" class="text-gray-500 hover:bg-gray-100 p-1 rounded-full"><i data-lucide="x"></i></button>
                                                </div>
                                                
                                                <!-- Body -->
                                                <div class="p-4 flex-1 overflow-y-auto">
                                                    <!-- Date Picker Section -->
                                                    <div class="mb-4 bg-gray-50 dark:bg-gray-700 p-3 rounded-xl border border-dashed border-gray-300 dark:border-gray-600">
                                                        <div class="flex items-center gap-3">
                                                            <div class="bg-white dark:bg-gray-600 p-2 rounded-lg shadow-sm border">📅</div>
                                                            <div class="flex-1">
                                                                <p class="text-xs text-gray-500 mb-1">تاريخ الرصد</p>
                                                                <input type="date" id="grading-date" class="w-full bg-transparent font-bold text-gray-700 dark:text-gray-200 outline-none">
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <!-- List Container -->
                                                    <div id="grading-students-list" class="space-y-3"></div>
                                                </div>
                                            </div>
                                        </div>

                                        <div id="rate-student-modal" class="fixed inset-0 bg-black/60 z-[100] hidden flex items-center justify-center p-4">
                                            <div class="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-sm shadow-2xl flex flex-col max-h-[90vh]">
                                                <div class="flex justify-between items-center p-6 border-b border-gray-100 dark:border-gray-700 shrink-0">
                                                    <h3 id="rate-student-name" class="font-bold text-lg">اسم الطالب</h3>
                                                    <button onclick="closeModal('rate-student-modal')"><i data-lucide="x" class="w-5 h-5"></i></button>
                                                </div>
                                                
                                                <div class="p-6 overflow-y-auto flex-1">
                                                    <!-- Quran tracking inputs (Teacher grading) -->
                                                                                                          <div id="rate-quran-section" class="hidden mb-4 space-y-4">
                                                         <!-- Hifz Box -->
                                                         <div class="bg-emerald-50 dark:bg-emerald-900/10 p-4 rounded-xl border border-emerald-100 dark:border-emerald-800 text-right space-y-3 shadow-sm">
                                                             <h4 class="font-bold text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-1">📝 تسجيل الحفظ</h4>
                                                             <div class="grid grid-cols-2 gap-2">
                                                                 <div>
                                                                     <p class="text-[10px] font-bold text-gray-500 mb-1">من سورة</p>
                                                                     <select id="rate-quran-start-sura-memorization" class="w-full bg-white dark:bg-gray-700 border border-gray-200 rounded-lg px-1 py-1.5 text-[11px] font-bold" onchange="updateQuranAyas('start', 'memorization')">
                                                                         <option value="">السورة..</option>
                                                                     </select>
                                                                 </div>
                                                                 <div>
                                                                     <p class="text-[10px] font-bold text-gray-500 mb-1">من آية</p>
                                                                     <select id="rate-quran-start-aya-memorization" class="w-full bg-white dark:bg-gray-700 border border-gray-200 rounded-lg px-1 py-1.5 text-[11px]" disabled>
                                                                         <option value="">الآية..</option>
                                                                     </select>
                                                                 </div>
                                                                 <div>
                                                                     <p class="text-[10px] font-bold text-gray-500 mb-1">إلى سورة</p>
                                                                     <select id="rate-quran-end-sura-memorization" class="w-full bg-white dark:bg-gray-700 border border-gray-200 rounded-lg px-1 py-1.5 text-[11px] font-bold" onchange="updateQuranAyas('end', 'memorization')">
                                                                         <option value="">السورة..</option>
                                                                     </select>
                                                                 </div>
                                                                 <div>
                                                                     <p class="text-[10px] font-bold text-gray-500 mb-1">إلى آية</p>
                                                                     <select id="rate-quran-end-aya-memorization" class="w-full bg-white dark:bg-gray-700 border border-gray-200 rounded-lg px-1 py-1.5 text-[11px]" disabled>
                                                                         <option value="">الآية..</option>
                                                                     </select>
                                                                 </div>
                                                             </div>
                                                             <button onclick="submitQuranRecord('memorization')" class="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-2">
                                                                 <i data-lucide="save" class="w-4 h-4"></i>حفظ المقطع
                                                             </button>
                                                         </div>

                                                         <!-- Murajaa Box -->
                                                         <div class="bg-blue-50 dark:bg-blue-900/10 p-4 rounded-xl border border-blue-100 dark:border-blue-800 text-right space-y-3 shadow-sm">
                                                             <h4 class="font-bold text-xs text-blue-700 dark:text-blue-400 flex items-center gap-1">🔄 تسجيل المراجعة</h4>
                                                             <div class="grid grid-cols-2 gap-2">
                                                                 <div>
                                                                     <p class="text-[10px] font-bold text-gray-500 mb-1">من سورة</p>
                                                                     <select id="rate-quran-start-sura-review" class="w-full bg-white dark:bg-gray-700 border border-gray-200 rounded-lg px-1 py-1.5 text-[11px] font-bold" onchange="updateQuranAyas('start', 'review')">
                                                                         <option value="">السورة..</option>
                                                                     </select>
                                                                 </div>
                                                                 <div>
                                                                     <p class="text-[10px] font-bold text-gray-500 mb-1">من آية</p>
                                                                     <select id="rate-quran-start-aya-review" class="w-full bg-white dark:bg-gray-700 border border-gray-200 rounded-lg px-1 py-1.5 text-[11px]" disabled>
                                                                         <option value="">الآية..</option>
                                                                     </select>
                                                                 </div>
                                                                 <div>
                                                                     <p class="text-[10px] font-bold text-gray-500 mb-1">إلى سورة</p>
                                                                     <select id="rate-quran-end-sura-review" class="w-full bg-white dark:bg-gray-700 border border-gray-200 rounded-lg px-1 py-1.5 text-[11px] font-bold" onchange="updateQuranAyas('end', 'review')">
                                                                         <option value="">السورة..</option>
                                                                     </select>
                                                                 </div>
                                                                 <div>
                                                                     <p class="text-[10px] font-bold text-gray-500 mb-1">إلى آية</p>
                                                                     <select id="rate-quran-end-aya-review" class="w-full bg-white dark:bg-gray-700 border border-gray-200 rounded-lg px-1 py-1.5 text-[11px]" disabled>
                                                                         <option value="">الآية..</option>
                                                                     </select>
                                                                 </div>
                                                             </div>
                                                             <button onclick="submitQuranRecord('review')" class="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-2">
                                                                 <i data-lucide="save" class="w-4 h-4"></i>حفظ المراجعة
                                                             </button>
                                                         </div>
                                                     </div>                     
                                                    <div id="rate-quran-plan-display" class="hidden mb-3 text-sm text-center bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 p-2 rounded-lg font-bold text-teal-700 dark:text-teal-400"></div>
    
                                                    <p id="rate-date-display" class="text-center text-sm text-gray-500 mb-4 font-bold bg-gray-100 dark:bg-gray-700 py-1 rounded-lg"></p>
                                                    
                                                    <div id="criteria-buttons-grid" class="grid grid-cols-1 gap-3"></div>
                                                </div>
                                            </div>
                                        </div>

                                        <!-- Activity Day Modals -->
                                        <div id="activity-check-modal" class="fixed inset-0 bg-black/60 z-[120] hidden flex items-center justify-center p-4 backdrop-blur-sm">
                                            <div class="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md p-6 shadow-2xl flex flex-col max-h-[85vh]">
                                                <h3 class="font-bold text-lg mb-2">تسجيل يوم نشاط 🏃</h3>
                                                <p class="text-xs text-gray-500 mb-4">حدد الطلاب الغائبين ليتم استثناؤهم من النقاط:</p>
                                                <div id="activity-students-list" class="flex-1 overflow-y-auto mb-4 border rounded-xl divide-y dark:divide-gray-700"></div>
                                                <div class="flex gap-2">
                                                    <button onclick="closeModal('activity-check-modal')" class="flex-1 py-3 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 font-medium">إلغاء</button>
                                                    <button onclick="submitActivityDay()" class="flex-1 py-3 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-700 shadow-lg">تأكيد الرصد</button>
                                                </div>
                                            </div>
                                        </div>

                                        <div id="activity-absent-modal" class="fixed inset-0 bg-black/60 z-[130] hidden flex items-center justify-center p-4 backdrop-blur-sm">
                                            <div class="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl flex flex-col">
                                                <div class="text-center mb-6">
                                                    <div class="w-16 h-16 bg-green-100 dark:bg-green-900/30 text-green-600 rounded-full flex items-center justify-center mx-auto mb-3">
                                                        <i data-lucide="check-circle" class="w-8 h-8"></i>
                                                    </div>
                                                    <h3 class="font-bold text-lg">تم رصد يوم النشاط!</h3>
                                                    <p class="text-sm text-gray-500">تم تسجيل الغياب، يمكنك مراسلة أولياء الأمور:</p>
                                                </div>
                                                <div id="activity-absent-whatsapp-list" class="space-y-3 mb-6"></div>
                                                <button onclick="closeModal('activity-absent-modal')" class="w-full py-3 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 rounded-xl font-bold">إغلاق</button>
                                            </div>
                                        </div>
                                        `;
}

// --- Password Modal Logic ---
let passwordResolver = null;

function requestPassword(message) {
    return new Promise((resolve) => {
        $('#password-modal-msg').textContent = message || "يرجى إدخال كلمة المرور للمتابعة";
        $('#modal-password-input').value = "";
        passwordResolver = resolve;
        toggleModal('password-modal', true);
        setTimeout(() => $('#modal-password-input').focus(), 100);
    });
}

function submitPasswordModal() {
    const val = $('#modal-password-input').value;
    if (passwordResolver) passwordResolver(val);
    toggleModal('password-modal', false);
}

function resolvePasswordModal(val) {
    if (passwordResolver) passwordResolver(val);
    toggleModal('password-modal', false);
}

// --- Data Operations (Refs to modals) ---

// === STUDENTS ===
function openAddStudentModal() {
    $('#student-id').value = '';
    $('#student-form').reset();
    $('#student-modal-title').textContent = 'إضافة طالب جديد';
    $('#save-student-text').textContent = 'حفظ';
    
    toggleModal('student-modal', true);
}



async function openEditStudent(id) {
    const student = state.students.find(s => s.id === id);
    if (!student) return;

    // إذا كان طالباً، يجب التحقق من كلمة المرور أولاً
    if (!state.isTeacher) {
        const msg = student.password ? 'أدخل كلمة المرور الخاصة بك:' : 'أدخل كلمة مرور المرحلة لتعديل بياناتك:';
        const enteredPass = await requestPassword(msg);
        if (!enteredPass) return;

        const studentPass = student.password;
        const levelPass = (LEVELS[state.currentLevel] ? LEVELS[state.currentLevel].studentPass : '');

        let isValid = false;
        if (studentPass) {
            if (enteredPass === studentPass) isValid = true;
        } else {
            if (enteredPass === levelPass) isValid = true;
        }

        if (!isValid) {
            showToast('كلمة المرور غير صحيحة', 'error');
            return;
        }
    }

    $('#student-id').value = student.id;
    $('#student-name').value = student.name;
    $('#student-number').value = student.studentNumber || '';
    $('#student-emoji').value = student.icon || '👤';
    $('#student-password-edit').value = student.password || '';

    // إعداد حالة القراءة فقط للطالب
    const isTeacher = state.isTeacher;
    $('#student-number').disabled = !isTeacher;
    $('#student-password-edit').disabled = !isTeacher;

    // الاسم والصورة مسموح بتعديلهم

    // عرض الصورة/الإيموجي الحالي
    const preview = $('#student-emoji-preview');
    if (isImgSrc(student.icon)) {
        preview.innerHTML = `<img src="${student.icon}" class="w-full h-full object-cover">`;
    } else {
        preview.innerHTML = student.icon || '👤';
    }

    $('#student-modal-title').textContent = 'تعديل بيانات الطالب';
    $('#save-student-text').textContent = 'تحديث';


    toggleModal('student-modal', true);
}

let studentToDeleteId = null;
function confirmDeleteStudent(id) {
    studentToDeleteId = id;
    toggleModal('delete-modal', true);
    // Bind verify
    $('#confirm-delete-btn').onclick = performDeleteStudent;
}

async function performDeleteStudent() {
    if (!studentToDeleteId) return;
    try {
        await window.firebaseOps.deleteDoc(window.firebaseOps.doc(window.db, "students", studentToDeleteId));
        showToast("تم الحذف");
        closeModal('delete-modal');
    } catch (err) { console.error(err); showToast("خطأ في الحذف", "error"); }
}

// === GROUPS ===

let currentManageCompId = null;

function openManageGroups(compId, compName) {
    currentManageCompId = compId;
    $('#groups-comp-name').textContent = compName;

    // إظهار زر إضافة مجموعة للمعلم فقط
    const addBtn = $('#add-group-btn');
    if (addBtn) {
        if (state.isTeacher) {
            addBtn.classList.remove('hidden');
        } else {
            addBtn.classList.add('hidden');
        }
    }

    toggleModal('groups-modal', true);
    fetchGroupsForCompetition(compId);
}

function fetchGroupsForCompetition(compId) {
    const container = $('#groups-container');
    container.innerHTML = '<div class="text-center p-4"><i data-lucide="loader-2" class="animate-spin w-6 h-6 mx-auto"></i></div>';

    const q = window.firebaseOps.query(
        window.firebaseOps.collection(window.db, "groups"),
        window.firebaseOps.where("competitionId", "==", compId)
    );

    // Realtime listener for groups modal? Or just getDocs? 
    // getDocs is safer for modal to avoid lingering listeners.
    window.firebaseOps.getDocs(q).then(snap => {
        if (snap.empty) {
            container.innerHTML = '<p class="text-center text-gray-400">لا توجد مجموعات</p>';
            return;
        }
        state.groups = [];
        const html = [];
        snap.forEach(doc => {
            var g = doc.data();
            g.id = doc.id;
            state.groups.push(g);
            const isImg = isImgSrc(g.icon);
            const iconHtml = isImg
                ? `<img src="${g.icon}" class="w-full h-full object-cover">`
                : (g.icon || '🛡️');

            html.push(`
                                            <div class="bg-gray-50 dark:bg-gray-700/50 rounded-xl border shadow-sm overflow-hidden">
                                                <div onclick="viewGroupStudents('${g.id}')" class="flex items-center gap-3 p-3 cursor-pointer hover:bg-white dark:hover:bg-gray-700 transition">
                                                    <div class="w-10 h-10 bg-white dark:bg-gray-600 rounded-lg flex items-center justify-center text-xl border overflow-hidden shadow-sm">
                                                        ${iconHtml}
                                                    </div>
                                                    <div class="flex-1">
                                                        <h4 class="font-bold text-gray-800 dark:text-gray-100">${g.name}</h4>
                                                        <div class="flex gap-2 text-xs text-gray-500">
                                                            <span>${(g.members ? g.members.length : 0)} أعضاء</span>
                                                            ${g.leader ? '<span class="text-amber-500 font-bold">👑</span>' : ''}
                                                        </div>
                                                    </div>
                                                    <i data-lucide="chevron-left" class="w-4 h-4 text-gray-400"></i>
                                                </div>
                                                ${state.isTeacher ? `
                    <div class="border-t flex divide-x dark:divide-gray-600">
                        <button onclick="event.stopPropagation(); openEditGroup('${g.id}')" class="flex-1 text-teal-600 dark:text-teal-400 font-bold text-sm py-2 hover:bg-teal-50 dark:hover:bg-teal-900/30 transition">
                            <i data-lucide="edit-2" class="w-3 h-3 inline"></i> تعديل
                        </button>
                        <button onclick="event.stopPropagation(); deleteGroup('${g.id}')" class="flex-1 text-red-600 dark:text-red-400 font-bold text-sm py-2 hover:bg-red-50 dark:hover:bg-red-900/30 transition">
                            <i data-lucide="trash-2" class="w-3 h-3 inline"></i> حذف
                        </button>
                    </div>
                    ` : ''}
                                            </div>
                                            `);
        });
        container.innerHTML = html.join('');
        lucide.createIcons();
    });
}

async function viewGroupStudents(groupId) {
    const group = state.groups.find(g => g.id === groupId);
    if (!group) {
        showToast("المجموعة غير موجودة", "error");
        return;
    }

    const container = $('#groups-container');
    container.innerHTML = '<div class="text-center p-4"><i data-lucide="loader-2" class="animate-spin w-6 h-6 mx-auto"></i></div>';
    lucide.createIcons();

    const memberIds = group.members || [];
    const groupStudents = state.students.filter(s => memberIds.includes(s.id));

    // Fetch scores for this group's students in this competition
    let studentScores = {};
    try {
        const scoresQ = window.firebaseOps.query(
            window.firebaseOps.collection(window.db, "scores"),
            window.firebaseOps.where("competitionId", "==", currentManageCompId)
        );
        const scoresSnap = await window.firebaseOps.getDocs(scoresQ);
        scoresSnap.forEach(doc => {
            const s = doc.data();
            if (memberIds.includes(s.studentId)) {
                studentScores[s.studentId] = (studentScores[s.studentId] || 0) + (s.points || 0);
            }
        });
    } catch (e) { console.error("Error fetching scores:", e); }

    let html = `
                                            <div class="mb-4">
                                                <button onclick="fetchGroupsForCompetition('${currentManageCompId}')" class="text-teal-600 font-bold text-sm flex items-center gap-1">
                                                    <i data-lucide="arrow-right" class="w-4 h-4"></i>
                                                    العودة للمجموعات
                                                </button>
                                                <h4 class="font-bold text-lg mt-2">${group.name}</h4>
                                            </div>
                                            <div class="space-y-2">
                                                `;

    if (groupStudents.length === 0) {
        html += '<p class="text-center text-gray-400 py-4">لا يوجد طلاب في هذه المجموعة</p>';
    } else {
        groupStudents.forEach(s => {
            const isImg = s.icon && s.icon.startsWith('data:image');
            const iconHtml = isImg ? `<img src="${s.icon}" class="w-full h-full object-cover rounded-full">` : (s.icon || '👤');
            const score = studentScores[s.id] || 0;
            const isLeader = group.leader === s.id;
            const isDeputy = group.deputy === s.id;

            html += `
                <div class="flex items-center justify-between p-3 bg-white dark:bg-gray-700 rounded-xl border shadow-sm">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center overflow-hidden border">
                            ${iconHtml}
                        </div>
                        <div>
                            <h4 class="font-bold text-sm flex items-center gap-1">
                                ${s.name}
                                ${isLeader ? '<span class="text-amber-500">👑</span>' : ''}
                                ${isDeputy ? '<span class="text-blue-500">⭐</span>' : ''}
                            </h4>
                            <p class="text-xs text-gray-500">${s.studentNumber || ''}</p>
                        </div>
                    </div>
                    <div class="text-center">
                        <span class="text-lg font-bold ${score >= 0 ? 'text-green-600' : 'text-red-600'}">${score}</span>
                        <p class="text-xs text-gray-400">نقطة</p>
                    </div>
                </div>
            `;
        });
    }

    // Group total
    const groupTotal = Object.values(studentScores).reduce((a, b) => a + b, 0);
    html += `
                                            </div>
                                            </div>
                                            <div class="mt-4 p-3 bg-teal-50 dark:bg-teal-900/30 rounded-xl flex items-center justify-between">
                                                <div>
                                                    <span class="text-sm text-teal-700 dark:text-teal-300 block">مجموع نقاط المجموعة:</span>
                                                    <span class="text-2xl font-bold text-teal-600 dark:text-teal-400">${groupTotal}</span>
                                                </div>
                                                ${state.isTeacher ? `
                                                <button onclick="generateGroupWeeklyReport('${group.id}')" class="bg-teal-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg hover:bg-teal-700 transition flex items-center gap-2">
                                                    <i data-lucide="bar-chart-2" class="w-4 h-4"></i>
                                                    تقرير الأسبوع
                                                </button>
                                                ` : ''}
                                            </div>
                                            `;

    container.innerHTML = html;
    lucide.createIcons();
}

async function generateGroupWeeklyReport(groupId) {
    const group = state.groups.find(g => g.id === groupId);
    if (!group) return;

    const comp = state.competitions.find(c => c.id === currentManageCompId);
    if (!comp) return; // Should not happen if inside viewGroup

    showToast("جاري إعداد التقرير...", "info");

    try {
        // 1. Calculate Date Range (Sun - Thu)
        const today = new Date();
        const dayOfWeek = today.getDay();
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - dayOfWeek);
        startOfWeek.setHours(0, 0, 0, 0);

        const daysPassed = 5; // Fixed for full week report
        const dateStrings = [];
        for (let i = 0; i < daysPassed; i++) {
            const d = new Date(startOfWeek);
            d.setDate(startOfWeek.getDate() + i);
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            dateStrings.push(`${year}-${month}-${day}`);
        }

        // 2. Fetch Scores for all members
        const memberIds = group.members || [];
        if (memberIds.length === 0) {
            showToast("المجموعة فارغة", "error");
            return;
        }

        const scoresQuery = window.firebaseOps.query(
            window.firebaseOps.collection(window.db, "scores"),
            window.firebaseOps.where("competitionId", "==", comp.id),
            // We can't use 'in' for both studentId (array) and date (array) usually.
            // Better to fetch all scores for this competition/date and filter by memberIds client-side
            window.firebaseOps.where("date", "in", dateStrings)
        );

        const snap = await window.firebaseOps.getDocs(scoresQuery);
        const scores = [];
        snap.forEach(d => {
            const data = d.data();
            if (memberIds.includes(data.studentId)) {
                scores.push(data);
            }
        });

        // NEW: Fetch Activity Days Log
        const activityQuery = window.firebaseOps.query(
            window.firebaseOps.collection(window.db, "activity_days"),
            window.firebaseOps.where("competitionId", "==", comp.id),
            window.firebaseOps.where("date", "in", dateStrings)
        );
        const activitySnap = await window.firebaseOps.getDocs(activityQuery);
        const activityLog = {}; // date -> points
        activitySnap.forEach(d => {
            const data = d.data();
            activityLog[data.date] = data.points;
        });

        // 3. Calculate Stats
        let totalPositiveEarned = 0;
        let totalAbsenceDeduction = 0;
        let absenceCount = 0;
        let activityDaysTaken = 0;

        scores.forEach(s => {
            const p = parseInt(s.points) || 0;
            if (s.criteriaId === 'ABSENCE_RECORD') {
                totalAbsenceDeduction += p; // p is negative
                absenceCount++;
            } else {
                if (p > 0) totalPositiveEarned += p;
                else totalAbsenceDeduction += p; // Negative criteria also deducted
            }
        });

        // Calculate Possible Points (Original)
        let dailyStandardPossible = 0;
        if (comp.criteria) {
            comp.criteria.forEach(c => {
                dailyStandardPossible += (parseInt(c.positivePoints) || 0);
            });
        }

        let totalPossible = 0;
        dateStrings.forEach(dateStr => {
            if (activityLog[dateStr]) {
                // This was an Activity Day
                totalPossible += activityLog[dateStr] * memberIds.length;
                activityDaysTaken++;
            } else {
                // Normal Day
                totalPossible += dailyStandardPossible * memberIds.length;
            }
        });

        const netTotal = totalPositiveEarned + totalAbsenceDeduction;

        // 4. Construct Message
        let reportText = `📊 *تقرير الأسبوع (مجموعة ${group.name})* 📊\n`;
        reportText += `📅 التاريخ: ${dateStrings[0]} إلى ${dateStrings[4]}\n`;
        reportText += `👥 عدد الطلاب: ${memberIds.length}\n`;
        if (activityDaysTaken > 0) {
            reportText += `🎪 تم إقامة نشاط في هذا الأسبوع\n`;
        }
        reportText += `------------------\n`;

        reportText += `🎯 النقاط المستحقة (الأصلية): ${totalPossible}\n`;
        reportText += `✅ النقاط المكتسبة: ${totalPositiveEarned}\n`;

        if (absenceCount > 0) {
            reportText += `⚠️ الغياب: ${absenceCount} حالة (${totalAbsenceDeduction} نقطة)\n`;
        }

        // If we had bonus logic: reportText += `➕ نقاط إضافية: ${addedPoints}\n`;

        reportText += `------------------\n`;
        reportText += `✨ *المجموع الصافي: ${netTotal}* ✨\n`;

        reportText += `\nشاكرين جهودكم 🌹`;

        // 5. Open WhatsApp (Generic)
        const url = `https://wa.me/?text=${encodeURIComponent(reportText)}`;
        window.open(url, '_blank');

    } catch (e) {
        console.error(e);
        showToast("خطأ في إنشاء التقرير", "error");
    }
}

function addNewGroup() {
    if (!currentManageCompId) {
        showToast("يجب اختيار مسابقة أولاً", "error");
        return;
    }
    openAddGroupModal();
}

// فتح نافذة إضافة مجموعة جديدة
function openAddGroupModal() {
    if (!currentManageCompId) {
        showToast("يجب اختيار مسابقة أولاً", "error");
        return;
    }

    // إعادة تعيين النموذج
    $('#edit-group-id').value = '';
    $('#edit-group-name').value = '';
    $('#group-icon').value = '🛡️';
    $('#group-icon-preview').innerHTML = '🛡️';
    $('#group-modal-title').textContent = 'إضافة مجموعة جديدة';

    // تعبئة قوائم الطلاب
    populateGroupStudentLists();
    renderGroupMembersSelect([], null, null);

    toggleModal('edit-group-modal', true);
    lucide.createIcons();
}

// تعبئة قوائم اختيار الطلاب (القائد والنائب)
function populateGroupStudentLists() {
    const leaderSelect = $('#group-leader');
    const deputySelect = $('#group-deputy');

    if (!leaderSelect || !deputySelect) return;

    const options = '<option value="">-- اختر --</option>' +
        state.students.map(s => `<option value="${s.id}" > ${s.name}</option>`).join('');

    leaderSelect.innerHTML = options;
    deputySelect.innerHTML = options;
}

function openEditGroup(groupId) {
    if (!state.isTeacher) {
        showToast("عذراً، هذا الإجراء متاح للمعلم فقط", "error");
        return;
    }

    if (!groupId) {
        openAddGroupModal();
        return;
    }

    $('#edit-group-id').value = groupId;
    $('#group-modal-title').textContent = 'تعديل المجموعة';

    // تعبئة قوائم الطلاب
    populateGroupStudentLists();

    // جلب بيانات المجموعة
    window.firebaseOps.getDoc(window.firebaseOps.doc(window.db, "groups", groupId)).then(snap => {
        if (snap.exists()) {
            const d = snap.data();
            $('#edit-group-name').value = d.name || '';
            $('#group-leader').value = d.leader || '';
            $('#group-deputy').value = d.deputy || '';
            $('#group-icon').value = d.icon || '🛡️';

            // عرض الأيقونة
            const preview = $('#group-icon-preview');
            if (isImgSrc(d.icon)) {
                preview.innerHTML = `<img src = "${d.icon}" class="w-full h-full object-cover">`;
            } else {
                preview.innerHTML = d.icon || '🛡️';
            }

            renderGroupMembersSelect(d.members || [], d.leader, d.deputy);
        }
    }).catch(err => {
        console.error(err);
        showToast("خطأ في تحميل بيانات المجموعة", "error");
    });

    toggleModal('edit-group-modal', true);
    lucide.createIcons();
}

async function previewGroupImage(input) {
    if (input.files && input.files[0]) {
        const compressed = await compressImage(input.files[0]);
        const preview = document.getElementById('group-icon-preview');
        preview.innerHTML = `<img src="${compressed}" class="w-full h-full object-cover">`;
        document.getElementById('group-icon').value = compressed;
    }
}

// دورة الإيموجي للمجموعات
const groupEmojis = ["🛡️", "⚔️", "🏆", "🌟", "🦁", "🐯", "🦅", "🐎", "🔥", "💎", "👑", "⭐", "🚀", "💪", "🎯"];
let groupEmojiIndex = 0;

function cycleGroupEmoji() {
    groupEmojiIndex = (groupEmojiIndex + 1) % groupEmojis.length;
    const emoji = groupEmojis[groupEmojiIndex];
    document.getElementById('group-icon').value = emoji;
    document.getElementById('group-icon-preview').innerHTML = emoji;
}

function renderGroupMembersSelect(selectedIds, leaderId, deputyId) {
    const list = $('#group-members-selection');
    if (!list) return;

    if (state.students.length === 0) {
        list.innerHTML = '<p class="text-center text-gray-400 text-sm py-2">لا يوجد طلاب</p>';
        return;
    }

    list.innerHTML = state.students.map(s => {
        const isSelected = selectedIds.includes(s.id);
        const isLeaderOrDeputy = s.id === leaderId || s.id === deputyId;
        return `
                                                <label class="flex items-center gap-2 p-1.5 hover:bg-gray-100 dark:hover:bg-gray-600 rounded cursor-pointer ${isLeaderOrDeputy ? 'opacity-50' : ''}" >
                                                    <input type="checkbox" value="${s.id}" class="group-member-checkbox w-4 h-4 text-teal-600 rounded" ${isSelected ? 'checked' : ''} ${isLeaderOrDeputy ? 'disabled' : ''}>
                                                        <span class="text-sm">${s.name}</span>
                                                        ${isLeaderOrDeputy ? '<span class="text-xs text-gray-400">(قائد/نائب)</span>' : ''}
                                                </label>
                                                `;
    }).join('');
}

async function saveGroupChanges() {
    const id = $('#edit-group-id').value;
    const name = $('#edit-group-name').value;
    const leader = $('#group-leader').value;
    const deputy = $('#group-deputy').value;
    const icon = $('#group-icon').value;
    const members = Array.from($$('.group-member-checkbox:checked')).map(cb => cb.value);

    // إضافة القائد والنائب للأعضاء إذا لم يكونوا موجودين
    if (leader && !members.includes(leader)) members.push(leader);
    if (deputy && !members.includes(deputy)) members.push(deputy);

    if (!name) { showToast("اسم المجموعة مطلوب", "error"); return; }

    // Check if any student is already in another group for this competition
    try {
        const groupsQ = window.firebaseOps.query(
            window.firebaseOps.collection(window.db, "groups"),
            window.firebaseOps.where("competitionId", "==", currentManageCompId)
        );
        const groupsSnap = await window.firebaseOps.getDocs(groupsQ);

        const existingMembers = new Set();
        groupsSnap.forEach(doc => {
            if (doc.id !== id) { // Ignore current group if editing
                const gData = doc.data();
                if (gData.members && Array.isArray(gData.members)) {
                    gData.members.forEach(m => existingMembers.add(m));
                }
            }
        });

        const duplicates = members.filter(m => existingMembers.has(m));
        if (duplicates.length > 0) {
            const dupNames = state.students.filter(s => duplicates.includes(s.id)).map(s => s.name).join(', ');
            showToast(`طلاب مسجلون في مجموعات أخرى: ${dupNames}`, "error");
            return;
        }

    } catch (e) {
        console.error("Error checking group duplicates", e);
        showToast("خطأ في التحقق من الأعضاء", "error");
        return;
    }

    const data = {
        name,
        icon,
        leader,
        deputy,
        competitionId: currentManageCompId,
        members,
        level: state.currentLevel,
        updatedAt: new Date()
    };

    try {
        if (id) {
            await window.firebaseOps.updateDoc(window.firebaseOps.doc(window.db, "groups", id), data);
            showToast("تم تحديث المجموعة");
        } else {
            await window.firebaseOps.addDoc(window.firebaseOps.collection(window.db, "groups"), data);
            showToast("تم إضافة المجموعة");
        }
        closeModal('edit-group-modal');
        fetchGroupsForCompetition(currentManageCompId);
    } catch (err) {
        console.error(err);
        showToast("خطأ في حفظ المجموعة", "error");
    }
}

// === GRADING SYSTEM ===
let currentGradingCompId = null;
let currentGradingGroupId = null;
let currentRateStudentId = null;

function openGradingSession(compId, keepDate = false) {
    if (!state.isTeacher) {
        showToast("عذراً، الرصد متاح للمعلم فقط", "error");
        return;
    }

    currentGradingCompId = compId;
    currentGradingGroupId = null;

    // Set default date to today and MAX to today ONLY if not set
    const dateInput = $('#grading-date');
    const today = new Date().toISOString().split('T')[0];
    if (dateInput) {
        if (!keepDate) {
            // Reset to today ONLY on fresh open, not on refresh
            dateInput.value = today;
        }
        dateInput.max = today;
    }

    // Fetch groups for this competition
    const container = $('#grading-students-list');
    container.innerHTML = '<div class="text-center py-8"><i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto"></i></div>';

    toggleModal('grading-modal', true);
    lucide.createIcons();

    // Fetch groups
    const q = window.firebaseOps.query(
        window.firebaseOps.collection(window.db, "groups"),
        window.firebaseOps.where("competitionId", "==", compId)
    );

    window.firebaseOps.getDocs(q).then(snap => {
        if (snap.empty) {
            container.innerHTML = '<p class="text-center text-gray-400 py-8">لا توجد مجموعات. أضف مجموعات أولاً من قائمة المسابقات.</p>';
            return;
        }
        let html = `
        <div class="mb-4">
            <button onclick="openActivityCheckModal('ALL')" class="w-full bg-purple-600 text-white px-4 py-3 rounded-xl text-sm font-bold shadow-lg hover:bg-purple-700 transition flex items-center justify-center gap-2">
                <i data-lucide="zap" class="w-5 h-5"></i>
                يوم نشاط
            </button>
        </div>
        <div class="space-y-3">`;
        snap.forEach(doc => {
            var g = doc.data();
            g.id = doc.id;
            const iconHtml = isImgSrc(g.icon)
                ? `<img src="${g.icon}" class="w-full h-full object-cover">`
                : (g.icon || '🛡️');

            html += `
            <div onclick="openGroupGrading('${g.id}')" class="flex items-center gap-3 p-3 bg-white dark:bg-gray-700/50 rounded-xl border shadow-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-600 transition">
                <div class="w-10 h-10 bg-gray-100 dark:bg-gray-600 rounded-lg flex items-center justify-center text-xl border overflow-hidden shadow-sm">
                    ${iconHtml}
                </div>
                <div class="flex-1">
                    <h4 class="font-bold text-gray-800 dark:text-gray-100">${g.name}</h4>
                    <p class="text-xs text-gray-500">${(g.members ? g.members.length : 0)} أعضاء</p>
                </div>
                <i data-lucide="chevron-left" class="w-4 h-4 text-gray-400"></i>
            </div>
            `;
        });
        html += '</div>';
        container.innerHTML = html;
        lucide.createIcons();
    });
}

function openGroupGrading(groupId) {
    currentGradingGroupId = groupId;

    const container = $('#grading-students-list');
    container.innerHTML = '<div class="text-center py-8"><i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto"></i></div>';
    lucide.createIcons();

    // Fetch group data
    window.firebaseOps.getDoc(window.firebaseOps.doc(window.db, "groups", groupId)).then(async snap => {
        if (!snap.exists()) {
            container.innerHTML = '<p class="text-center text-red-400">المجموعة غير موجودة</p>';
            return;
        }

        const group = snap.data();
        const memberIds = group.members || [];

        if (memberIds.length === 0) {
            container.innerHTML = `
                <div class="text-center py-4">
                    <button onclick="openGradingSession('${currentGradingCompId}')" class="text-teal-600 font-bold text-sm mb-4">← العودة للمجموعات</button>
                    <p class="text-gray-400">لا يوجد طلاب في هذه المجموعة</p>
                </div>`;
            return;
        }

        // Fetch students from Firebase directly (fix for empty state.students)
        let groupStudents = state.students.filter(s => memberIds.includes(s.id));

        // If state.students is empty, fetch from Firebase
        if (groupStudents.length === 0 && memberIds.length > 0) {
            try {
                const studentsSnap = await window.firebaseOps.getDocs(
                    window.firebaseOps.query(
                        window.firebaseOps.collection(window.db, "students"),
                        window.firebaseOps.where("level", "==", state.currentLevel)
                    )
                );
                const fetchedStudents = [];
                studentsSnap.forEach(function (doc) {
                    var data = doc.data();
                    data.id = doc.id;
                    fetchedStudents.push(data);
                });
                state.students = fetchedStudents; // Update state for future use
                groupStudents = fetchedStudents.filter(s => memberIds.includes(s.id));
            } catch (e) {
                console.error("Error fetching students:", e);
            }
        }

        if (groupStudents.length === 0) {
            container.innerHTML = `
                <div class="text-center py-4">
                    <button onclick="openGradingSession('${currentGradingCompId}')" class="text-teal-600 font-bold text-sm mb-4">← العودة للمجموعات</button>
                    <p class="text-gray-400">لا يوجد طلاب في هذه المجموعة</p>
                </div>`;
            return;
        }

        let html = `
            <div class="sticky top-0 bg-white dark:bg-gray-800 py-2 mb-3 border-b flex justify-between items-center">
                <div>
                    <button onclick="openGradingSession('${currentGradingCompId}')" class="text-teal-600 font-bold text-sm flex items-center gap-1">
                        <i data-lucide="arrow-right" class="w-4 h-4"></i>
                        العودة
                    </button>
                    <h4 class="font-bold mt-1">${group.name}</h4>
                </div>
                <button onclick="openGroupPointsModal()" class="bg-amber-100 text-amber-700 px-3 py-1.5 rounded-lg text-xs font-bold shadow hover:bg-amber-200 transition flex items-center gap-1 border border-amber-300">
                    <i data-lucide="sparkles" class="w-3 h-3"></i>
                    نقاط للمجموعة
                </button>
            </div>
            <div class="space-y-2">
        `;

        groupStudents.forEach(s => {
            const isImg = s.icon && s.icon.startsWith('data:image');
            const iconHtml = isImg ? `<img src="${s.icon}" class="w-full h-full object-cover rounded-full">` : (s.icon || '👤');

            html += `
                <div onclick="openRateStudent('${s.id}')" class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-xl cursor-pointer hover:bg-gray-100 transition">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 bg-white rounded-full flex items-center justify-center border overflow-hidden">${iconHtml}</div>
                        <div>
                            <h4 class="font-bold text-sm">${s.name}</h4>
                            <p class="text-xs text-gray-500">${s.studentNumber || ''}</p>
                        </div>
                    </div>
                    <i data-lucide="chevron-left" class="text-gray-400"></i>
                </div>
            `;
        });

        html += '</div>';
        container.innerHTML = html;
        lucide.createIcons();
    });
}

function refreshGradingStatus() {
    if (currentGradingGroupId) {
        openGroupGrading(currentGradingGroupId);
    } else {
        openGradingSession(currentGradingCompId, true); // Keep Date!
    }
}

function filterGradingList(val) {
    // For simplicity, re-render with filter (could be optimized)
    refreshGradingStatus();
}

function openRateStudent(studentId) {
    currentRateStudentId = studentId;
    const s = state.students.find(x => x.id === studentId);
    $('#rate-student-name').textContent = s ? s.name : 'تقييم الطالب';
    // Show and initialize quran section
    const quranSec = document.getElementById('rate-quran-section');
    if (quranSec) {
        quranSec.classList.remove('hidden');
        const startSuraMemorization = document.getElementById('rate-quran-start-sura-memorization');
        if (startSuraMemorization && startSuraMemorization.options.length <= 1) {
            const suras = window.QuranService.getSuras();
            const optionsHtml = suras.map(s => `<option value="${s.number}">${s.name}</option>`).join('');
            
            ['memorization', 'review'].forEach(type => {
                const sSura = document.getElementById(`rate-quran-start-sura-${type}`);
                const eSura = document.getElementById(`rate-quran-end-sura-${type}`);
                if(sSura) sSura.innerHTML = `<option value="">السورة..</option>` + optionsHtml;
                if(eSura) eSura.innerHTML = `<option value="">السورة..</option>` + optionsHtml;
            });
        }
        
        // Reset selections
        ['memorization', 'review'].forEach(type => {
            const startS = document.getElementById(`rate-quran-start-sura-${type}`);
            const endS = document.getElementById(`rate-quran-end-sura-${type}`);
            if(startS) startS.value = "";
            if(endS) endS.value = "";
            const startA = document.getElementById(`rate-quran-start-aya-${type}`);
            if(startA) { startA.innerHTML = '<option value="">الآية..</option>'; startA.disabled = true; }
            const endA = document.getElementById(`rate-quran-end-aya-${type}`);
            if(endA) { endA.innerHTML = '<option value="">الآية..</option>'; endA.disabled = true; }
        });
    }

    // عرض التاريخ
    const dateVal = $('#grading-date').value;
    $('#rate-date-display').textContent = `تاريخ الرصد: ${dateVal}`;

    // Get Competition Criteria
    const comp = state.competitions.find(c => c.id === currentGradingCompId);
    if (!comp || !comp.criteria) {
        showToast("لا توجد معايير لهذه المسابقة", "error");
        return;
    }

    const grid = $('#criteria-buttons-grid');
    grid.innerHTML = comp.criteria.map(c => `
                                                <div class="flex items-center gap-2">
                                                    <button onclick="submitScore('${c.id}', ${c.positivePoints}, '${c.name}', 'positive')" class="flex-1 bg-green-50 text-green-700 border border-green-200 py-3 rounded-xl font-bold hover:bg-green-100 transition flex justify-between px-4">
                                                        <span>${c.name} (+${c.positivePoints})</span>
                                                        <i data-lucide="thumbs-up" class="w-4 h-4"></i>
                                                    </button>
                                                    ${c.negativePoints ? `
            <button onclick="submitScore('${c.id}', -${c.negativePoints}, '${c.name}', 'negative')" class="w-20 bg-red-50 text-red-700 border border-red-200 py-3 rounded-xl font-bold hover:bg-red-100 transition flex justify-center">
                <span>-${c.negativePoints}</span>
            </button>
            ` : ''}
                                                </div>
                                                `).join('');

    // زر الغياب الإضافي + زر التقرير الأسبوعي + زر نقاط مخصصة
    grid.innerHTML += `
        <div class="col-span-1 mt-4 grid grid-cols-2 gap-3 w-full">
            <button onclick="openAbsenceOptions()" class="bg-orange-50 text-orange-700 border border-orange-200 py-3 rounded-xl font-bold hover:bg-orange-100 transition flex items-center justify-center gap-2">
                <i data-lucide="user-x" class="w-4 h-4"></i>
                <span>تسجيل غياب</span>
            </button>
             <button onclick="generateWeeklyReport()" class="bg-blue-50 text-blue-700 border border-blue-200 py-3 rounded-xl font-bold hover:bg-blue-100 transition flex items-center justify-center gap-2">
                <i data-lucide="file-text" class="w-4 h-4"></i>
                <span>تقرير أسبوعي</span>
            </button>
        </div>
        <div class="col-span-1 mt-1 w-full">
            <button onclick="openCustomPointsModal()" class="w-full py-3 bg-teal-50 hover:bg-teal-100 dark:bg-teal-900/30 dark:hover:bg-teal-900/50 text-teal-700 dark:text-teal-300 rounded-xl font-bold transition flex items-center justify-center gap-2 border border-teal-200 dark:border-teal-800 shadow-sm">
                <i data-lucide="sparkles" class="w-5 h-5"></i>
                إضافة نقاط مخصصة (إيجابي / سلبي)
            </button>
        </div>
    `;

    toggleModal('rate-student-modal', true);
    lucide.createIcons();
}

window.setQuranType = (type) => {
    document.getElementById('rate-quran-type').value = type;
    const btnHifz = document.getElementById('btn-type-hifz');
    const btnMuraja = document.getElementById('btn-type-muraja');
    
    if (type === 'memorization') {
        btnHifz.className = "py-2 rounded-lg text-xs font-bold border-2 border-emerald-400 bg-emerald-100 text-emerald-700";
        btnMuraja.className = "py-2 rounded-lg text-xs font-bold border-2 border-gray-200 bg-white text-gray-500";
    } else {
        btnMuraja.className = "py-2 rounded-lg text-xs font-bold border-2 border-blue-400 bg-blue-100 text-blue-700";
        btnHifz.className = "py-2 rounded-lg text-xs font-bold border-2 border-gray-200 bg-white text-gray-500";
    }
};
window.updateQuranAyas = (rangeType, type) => {
    const suraNo = document.getElementById(`rate-quran-${rangeType}-sura-${type}`).value;
    const ayaSelect = document.getElementById(`rate-quran-${rangeType}-aya-${type}`);
    
    if (!suraNo) {
        ayaSelect.innerHTML = '<option value="">الآية..</option>';
        ayaSelect.disabled = true;
        return;
    }
    
    const ayahs = window.QuranService.getAyahs(suraNo);
    const optionsHtml = ayahs.map(a => `<option value="${a.aya_no}">${a.aya_no}</option>`).join('');
    ayaSelect.innerHTML = `<option value="">الآية..</option>` + optionsHtml;
    ayaSelect.disabled = false;

    if (rangeType === 'start') {
        const endSuraSelect = document.getElementById(`rate-quran-end-sura-${type}`);
        if (!endSuraSelect.value) {
            endSuraSelect.value = suraNo;
            window.updateQuranAyas('end', type);
        }
    }
};

async function submitScore(criteriaId, points, criteriaName, type) {
    if (!currentRateStudentId || !currentGradingCompId) return;

    // Get selected date
    const dateVal = $('#grading-date').value;
    if (!dateVal) {
        showToast("يرجى اختيار التاريخ", "error");
        return;
    }

    const data = {
        studentId: currentRateStudentId,
        competitionId: currentGradingCompId,
        groupId: currentGradingGroupId,
        criteriaId,
        criteriaName,
        points: parseInt(points),
        type,
        level: state.currentLevel,
        date: dateVal,
        updatedAt: new Date(),
        timestamp: Date.now()
    };

    try {
        // Query by student+date
        const q = window.firebaseOps.query(
            window.firebaseOps.collection(window.db, "scores"),
            window.firebaseOps.where("studentId", "==", currentRateStudentId),
            window.firebaseOps.where("date", "==", dateVal)
        );

        const snap = await window.firebaseOps.getDocs(q);
        // Find ALL records for this criteriaId (ignore type to allow replacement)
        const criteriaDocs = snap.docs.filter(d => d.data().criteriaId === criteriaId);

        if (criteriaDocs.length > 0) {
            // Update the FIRST record instead of creating duplicate
            await window.firebaseOps.updateDoc(window.firebaseOps.doc(window.db, "scores", criteriaDocs[0].id), data);
            
            // Safety: Delete any accidental duplicates for the same criteria on the same day
            if (criteriaDocs.length > 1) {
                for (let i = 1; i < criteriaDocs.length; i++) {
                    await window.firebaseOps.deleteDoc(window.firebaseOps.doc(window.db, "scores", criteriaDocs[i].id));
                }
            }
            
            showToast(`تم تعديل الدرجة إلى ${points}`, "success");
        } else {
            // Create new record
            data.createdAt = new Date();
            await window.firebaseOps.addDoc(window.firebaseOps.collection(window.db, "scores"), data);
            showToast(`تم رصد ${points > 0 ? '+' : ''}${points} نقطة`, points > 0 ? "success" : "error");
        }
    } catch (e) {
        console.error(e);
        showToast("خطأ في الرصد", "error");
    }
}
window.submitQuranRecord = async (quranType) => {
    if (!currentRateStudentId || !currentGradingCompId) return;

    const dateVal = $('#grading-date').value;
    if (!dateVal) {
        showToast("يرجى اختيار التاريخ", "error");
        return;
    }

    const startSuraNo = document.getElementById(`rate-quran-start-sura-${quranType}`).value;
    const startAyaNo = document.getElementById(`rate-quran-start-aya-${quranType}`).value;
    const endSuraNo = document.getElementById(`rate-quran-end-sura-${quranType}`).value;
    const endAyaNo = document.getElementById(`rate-quran-end-aya-${quranType}`).value;

    if (!startSuraNo || !startAyaNo || !endSuraNo || !endAyaNo) {
        showToast("يرجى تحديد السورة والآية بداية ونهاية", "error");
        return;
    }

    const suras = window.QuranService.getSuras();
    const startSura = suras.find(s => s.number == startSuraNo);
    const endSura = suras.find(s => s.number == endSuraNo);

    let sectionParts = [];
    if (startSuraNo === endSuraNo) {
        sectionParts.push(`سورة ${ startSura ? startSura.name : startSuraNo }: آية ${startAyaNo} – ${endAyaNo}`);
    } else {
        sectionParts.push(`سورة ${ startSura ? startSura.name : startSuraNo }: من آية ${startAyaNo}`);
        const startNum = parseInt(startSuraNo);
        const endNum = parseInt(endSuraNo);
        for (let i = startNum + 1; i < endNum; i++) {
            const mid = suras.find(s => s.number == i);
            if (mid) sectionParts.push(`سورة ${mid.name}: كاملة`);
        }
        sectionParts.push(`سورة ${ endSura ? endSura.name : endSuraNo }: حتى آية ${endAyaNo}`);
    }
    const quranSection = sectionParts.join(' | ');

    const criteriaId = quranType === 'memorization' ? 'QURAN_MEMORIZATION' : 'QURAN_REVIEW';
    const criteriaName = quranType === 'memorization' ? 'حفظ' : 'مراجعة';

    const data = {
        studentId: currentRateStudentId,
        competitionId: currentGradingCompId,
        groupId: currentGradingGroupId || null,
        criteriaId,
        criteriaName,
        points: 0,
        type: quranType,
        quranType,
        quranSection,
        quranStartSura: Number(startSuraNo),
        quranStartAya: Number(startAyaNo),
        quranEndSura: Number(endSuraNo),
        quranEndAya: Number(endAyaNo),
        level: state.currentLevel,
        date: dateVal,
        updatedAt: new Date(),
        timestamp: Date.now()
    };

    try {
        const q = window.firebaseOps.query(
            window.firebaseOps.collection(window.db, "scores"),
            window.firebaseOps.where("studentId", "==", currentRateStudentId),
            window.firebaseOps.where("date", "==", dateVal),
            window.firebaseOps.where("criteriaId", "==", criteriaId)
        );
        const snap = await window.firebaseOps.getDocs(q);
        if (!snap.empty) {
            await window.firebaseOps.updateDoc(window.firebaseOps.doc(window.db, "scores", snap.docs[0].id), data);
            showToast(quranType === 'memorization' ? "تم تعديل الحفظ" : "تم تعديل المراجعة", "success");
        } else {
            data.createdAt = new Date();
            await window.firebaseOps.addDoc(window.firebaseOps.collection(window.db, "scores"), data);
            showToast(quranType === 'memorization' ? "تم تسجيل الحفظ بنجاح ✨" : "تم تسجيل المراجعة بنجاح ✨", "success");
        }
    } catch (e) {
        console.error(e);
        showToast("خطأ في الاتصال بالخادم", "error");
    }
};

// Student Edit Security Check
let currentActivityGroupId = null;

async function openActivityCheckModal(groupId) {
    currentActivityGroupId = groupId;
    
    let membersIds = [];
    if (groupId === 'ALL') {
        const compGroups = state.groups.filter(g => g.competitionId === currentGradingCompId);
        compGroups.forEach(g => {
            if(g.members) membersIds = membersIds.concat(g.members);
        });
    } else {
        const group = state.groups.find(g => g.id === groupId);
        if (!group) return;
        membersIds = group.members || [];
    }

    const list = $('#activity-students-list');
    list.innerHTML = `<div class="p-4 text-center"><i data-lucide="loader-2" class="animate-spin w-5 h-5 mx-auto"></i></div>`;
    lucide.createIcons();

    let members = state.students.filter(s => membersIds.includes(s.id));
    if (members.length === 0 && membersIds.length > 0) {
        const q = window.firebaseOps.query(window.firebaseOps.collection(window.db, "students"), window.firebaseOps.where("level", "==", state.currentLevel));
        const snap = await window.firebaseOps.getDocs(q);
        const all = []; snap.forEach(d => { var x = d.data(); x.id = d.id; all.push(x); });
        state.students = all;
        members = all.filter(s => membersIds.includes(s.id));
    }

    if (members.length === 0) {
        list.innerHTML = '<p class="text-center text-gray-500 py-4">لا يوجد طلاب لتقييمهم</p>';
    } else {
        list.innerHTML = members.map(s => `
            <label class="flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition">
                <span class="font-bold text-sm">${s.name}</span>
                <input type="checkbox" value="${s.id}" class="activity-absent-checkbox w-5 h-5 text-purple-600 rounded-lg border-gray-300">
            </label>
        `).join('');
    }

    toggleModal('activity-check-modal', true);
}

async function submitActivityDay() {
    const comp = state.competitions.find(c => c.id === currentGradingCompId);
    const dateVal = $('#grading-date').value;

    if (!comp || !dateVal) {
        showToast("خطأ في البيانات أو التاريخ", "error");
        return;
    }

    let membersIds = [];
    if (currentActivityGroupId === 'ALL') {
        const compGroups = state.groups.filter(g => g.competitionId === comp.id);
        compGroups.forEach(g => {
            if(g.members) membersIds = membersIds.concat(g.members);
        });
    } else {
        const group = state.groups.find(g => g.id === currentActivityGroupId);
        if (!group) return;
        membersIds = group.members || [];
    }

    const activityPoints = comp.activityPoints || 0;
    const rawActivityAbsentPoints = comp.activityAbsentPoints || 0;
    const activityAbsentPoints = rawActivityAbsentPoints > 0 ? -rawActivityAbsentPoints : rawActivityAbsentPoints;
    const absents = Array.from($$('.activity-absent-checkbox:checked')).map(cb => cb.value);

    const confirmBtn = $$('#activity-check-modal button')[1];
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<i data-lucide="loader-2" class="animate-spin w-4 h-4 mx-auto"></i>';
        lucide.createIcons();
    }

    try {
        // 0. Check if Activity Day already exists for this date and competition
        const duplicateCheckQ = window.firebaseOps.query(
            window.firebaseOps.collection(window.db, "activity_days"),
            window.firebaseOps.where("competitionId", "==", comp.id),
            window.firebaseOps.where("date", "==", dateVal)
        );
        const duplicateCheckSnap = await window.firebaseOps.getDocs(duplicateCheckQ);
        if (!duplicateCheckSnap.empty) {
            showToast("تم تسجيل نشاط لهذا اليوم مسبقاً في هذه المسابقة", "error");
            return;
        }

        // 1. Log the Activity Day
        await window.firebaseOps.addDoc(window.firebaseOps.collection(window.db, "activity_days"), {
            competitionId: comp.id,
            date: dateVal,
            points: activityPoints
        });

        // 2. Save Scores using Sequential Batch for stability
        const batch = window.firebaseOps.writeBatch(window.db);

        membersIds.forEach(sid => {
            const isAbsent = absents.includes(sid);
            const groupId = currentActivityGroupId === 'ALL' ? (state.groups.find(g => g.members && g.members.includes(sid))?.id || '') : currentActivityGroupId;
            const scoreData = {
                studentId: sid,
                competitionId: comp.id,
                groupId: groupId,
                criteriaId: isAbsent ? 'ABSENCE_RECORD' : 'ACTIVITY_DAY',
                criteriaName: isAbsent ? 'غياب يوم نشاط' : 'حضور يوم نشاط',
                points: isAbsent ? activityAbsentPoints : activityPoints,
                type: isAbsent ? 'absence' : 'activity',
                level: state.currentLevel,
                date: dateVal,
                updatedAt: new Date(),
                timestamp: Date.now(),
                createdAt: new Date()
            };

            // Note: writeBatch.set in our wrapper always does addDoc
            batch.set(window.firebaseOps.doc(window.db, "scores", "temp_" + sid), scoreData);
        });

        await batch.commit();

        closeModal('activity-check-modal');
        showToast("تم رصد درجات النشاط بنجاح", "success");

        // 3. Show WhatsApp list for absentees
        const absentStudents = state.students.filter(s => absents.includes(s.id));
        if (absentStudents.length > 0) {
            const waList = $('#activity-absent-whatsapp-list');
            waList.innerHTML = absentStudents.map(s => {
                const phone = s.studentNumber || '';
                const msg = `نحيطكم علماً بغياب الطالب (${s.name}) عن يوم النشاط المقام اليوم في مسابقة ${comp.name}.`;
                const url = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;

                return `
                    <div class="flex items-center justify-between p-3 bg-red-50 dark:bg-red-900/10 rounded-xl border border-red-100 dark:border-red-900/30">
                        <span class="font-bold text-sm text-gray-800 dark:text-gray-200">${s.name}</span>
                        ${phone ? `
                        <a href="${url}" target="_blank" class="bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs flex items-center gap-1 hover:bg-green-700 transition">
                            <i data-lucide="message-circle" class="w-3 h-3"></i>
                            مراسلة
                        </a>
                        ` : '<span class="text-[10px] text-gray-400">لا يوجد رقم</span>'}
                    </div>
                `;
            }).join('');

            toggleModal('activity-absent-modal', true);
            lucide.createIcons();
        }

    } catch (e) {
        console.error("submitActivityDay error full:", e);
        const errorMsg = e.message || "حدث خطأ في الاتصال بقاعدة البيانات";
        showToast(errorMsg, "error");
    } finally {
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.textContent = 'تأكيد الرصد';
        }
    }
}


function toggleEmojiPicker(targetId) {
    // Simple prompt fallback
    const emojis = ["👤", "🏆", "🌟", "📚", "🕌", "⚽", "🧠", "⚔️", "🛡️", "🎒", "🎓"];
    const current = document.getElementById(targetId.replace('-btn', '')).value;

    // Create a temporary simple picker using native browser prompt is ugly. 
    // Let's cycle through them or show a mini modal. 
    // For now, let's just Randomize on click for fun/speed, or cycle.
    // Or better: prompt the user to paste an emoji? No.
    // Cycle:
    let idx = emojis.indexOf(current);
    if (idx === -1) idx = 0;
    const next = emojis[(idx + 1) % emojis.length];

    const inputId = targetId.replace('-btn', '');
    const previewId = targetId.replace('-btn', '-preview');

    document.getElementById(inputId).value = next;
    document.getElementById(previewId).textContent = next;
}


async function handleSaveStudent(e) {
    e.preventDefault();
    const btn = $('#save-student-btn');
    btn.disabled = true;

    const id = $('#student-id').value;
    const fileInput = document.getElementById('student-image-upload');
    let imageBase64 = $('#student-emoji').value; // Default or existing

    // Handle Image Upload
    if (fileInput && fileInput.files[0]) {
        imageBase64 = await compressImage(fileInput.files[0]);
    }

    let studentNumber = $('#student-number').value.trim();
    // Phone Format Logic (966) using normalizePhone
    studentNumber = normalizePhone(studentNumber);

    const data = {
        name: $('#student-name').value,
        studentNumber: studentNumber,
        parentPhone: studentNumber, // Same as studentNumber for parent lookup
        level: state.currentLevel,  // Level for parent to see
        icon: imageBase64, // Store Base64 Image
        password: $('#student-password-edit').value, // Student Password
        updatedAt: new Date()
    };

    // Mandatory Password for new students
    if (!id && !data.password) {
        // showToast("كلمة المرور مطلوبة للطالب الجديد", "error"); // Moved to inline
        const errEl = document.getElementById('password-error');
        if (errEl) errEl.classList.remove('hidden');
        btn.disabled = false;
        return;
    } else {
        const errEl = document.getElementById('password-error');
        if (errEl) errEl.classList.add('hidden');
    }

    try {
        if (id) {
            await window.firebaseOps.updateDoc(window.firebaseOps.doc(window.db, "students", id), data);
            showToast("تم التحديث");
        } else {
            data.createdAt = new Date();
            data.level = state.currentLevel;
            const docRef = await window.firebaseOps.addDoc(window.firebaseOps.collection(window.db, "students"), data);
            showToast("تم الإضافة");

            // Optimistic Update: Add to local state immediately
            data.id = docRef.id;
            // Convert createdAt to something sort-compatible (Timestamp-like) just for UI
            data.createdAt = new Date().toISOString();
            state.students.push(data);
            // Sort
            state.students.sort((a, b) => {
                const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                return bTime - aTime;
            });
            updateStudentsListUI();
        }
        closeModal('student-modal');
    } catch (err) { console.error(err); showToast("خطأ", "error"); }
    finally { btn.disabled = false; }
}

function openAddCompetitionModal() {
    $('#competition-id').value = '';
    const titleEl = document.querySelector('#competition-modal h3');
    if (titleEl) titleEl.textContent = 'إضافة مسابقة جديدة';

    $('#competition-form').reset();
    $('#criteria-list').innerHTML = '';
    addCriteriaItem(); // Add one default
    toggleModal('competition-modal', true);
}

async function openEditCompetition(id) {
    if (!state.isTeacher) return;

    try {
        const docSnap = await window.firebaseOps.getDoc(window.firebaseOps.doc(window.db, "competitions", id));
        if (!docSnap.exists()) {
            showToast("المسابقة غير موجودة", "error");
            return;
        }
        const data = docSnap.data();

        $('#competition-id').value = id;
        $('#competition-name').value = data.name || '';
        $('#competition-emoji').value = data.icon || '🏆';
        $('#comp-absent-excuse').value = data.absentExcuse || 1;
        $('#comp-absent-no-excuse').value = data.absentNoExcuse || 4;
        $('#comp-activity-points').value = data.activityPoints || 0;
        $('#comp-activity-absent-points').value = data.activityAbsentPoints || 0;

        const titleEl = document.querySelector('#competition-modal h3');
        if (titleEl) titleEl.textContent = 'تعديل المسابقة';

        // Populate Criteria
        $('#criteria-list').innerHTML = '';
        if (data.criteria && Array.isArray(data.criteria) && data.criteria.length > 0) {
            data.criteria.forEach(c => addCriteriaItem(c.name, c.positivePoints, c.negativePoints));
        } else {
            addCriteriaItem();
        }

        toggleModal('competition-modal', true);
        lucide.createIcons();
    } catch (e) {
        console.error(e);
        showToast("خطأ في جلب البيانات", "error");
    }
}

// Duplicates removed

// Emoji Picker & Other Modals



// --- Initialization ---

let isAppInitialized = false;

function init() {
    if (isAppInitialized) return;
    isAppInitialized = true;

    applyTheme();

    // Check Persistence
    if (loadAuth()) {
        // Already logged in
        $('#loading').classList.add('hidden');
        $('#app-content-wrapper').classList.remove('hidden'); // Show content
        $('#view-container').classList.remove('hidden'); // CRITICAL: Show view container
        updateUIMode();

        // Start Global Sync
        startGlobalDataSync();

        // Navigate based on role
        const startView = state.isParent ? 'parent' : (state.isTeacher ? 'home' : 'students');
        // Replace initial state so Android Back button exits app from start screen
        history.replaceState({ view: startView }, '', `#${startView}`);
        router.render(startView);
    } else {
        // Needs Login (Show Auth Overlay)
        $('#loading').classList.add('hidden');
        showAuthModal();
        history.replaceState({ view: 'auth' }, '', '#auth');
    }
}

function startGlobalDataSync() {
    if (!state.currentLevel) return;

    // 1. Competitions Sync
    if (competitionsUnsubscribe) competitionsUnsubscribe();
    const qComp = window.firebaseOps.query(
        window.firebaseOps.collection(window.db, "competitions"),
        window.firebaseOps.where("level", "==", state.currentLevel)
    );
    competitionsUnsubscribe = window.firebaseOps.onSnapshot(qComp, function (snapshot) {
        const comps = [];
        snapshot.forEach(function (doc) {
            var data = doc.data();
            data.id = doc.id;
            comps.push(data);
        });
        comps.sort(function (a, b) {
            const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return bTime - aTime;
        });
        state.competitions = comps;
        // If we are on competitions view, update UI
        if (state.currentView === 'competitions') updateCompetitionsListUI();
        // Leaderboard depends on active comp
        calculateLeaderboard();
    });

    // 2. Groups Sync
    if (activeGroupsUnsubscribe) activeGroupsUnsubscribe();
    const qGroups = window.firebaseOps.query(window.firebaseOps.collection(window.db, "groups"));
    activeGroupsUnsubscribe = window.firebaseOps.onSnapshot(qGroups, function (snap) {
        const allGroups = [];
        snap.forEach(function (d) {
            var data = d.data();
            data.id = d.id;
            allGroups.push(data);
        });
        state.groups = allGroups;
        calculateLeaderboard();
    });
}

// Global History Listener for Android Back Button
window.addEventListener('popstate', (event) => {
    // 1. Close any open modals first (User Expectation: Back = Close Modal)
    const modals = document.querySelectorAll('[id$="-modal"]:not(.hidden)');
    if (modals.length > 0) {
        modals.forEach(m => {
            // Only remove dynamically created modals, hide static ones
            if (m.dataset.dynamic === 'true') {
                m.remove();
            } else {
                m.classList.add('hidden');
            }
        });
        // Push current state back to prevent further back navigation issues
        history.pushState({ view: state.currentView }, '', `#${state.currentView}`);
        return; // Don't navigate, just closed modal
    }

    // 2. Determine home view based on mode
    const homeView = state.isParent ? 'parent' : 'home';

    // 3. If already on home view, let Android handle it (exit app)
    if (state.currentView === homeView) {
        return; // Exit app
    }

    // 4. Otherwise, go back to home view
    history.replaceState({ view: homeView }, '', `#${homeView}`);
    router.render(homeView);
});


// === COMPETITION MANAGEMENT ===
function addCriteriaItem(name = '', pos = '', neg = '') {
    const container = document.getElementById('criteria-list');
    if (!container) return; // Guard
    const id = Date.now() + Math.random().toString(36).substr(2, 9);

    const div = document.createElement('div');
    div.className = 'flex gap-2 items-center bg-gray-50 dark:bg-gray-700 p-2 rounded-xl mb-2';
    div.innerHTML = `
                                                            <input type="text" placeholder="اسم المعيار" class="criteria-name flex-1 bg-white dark:bg-gray-600 border rounded-lg px-3 py-2 text-sm" value="${name}" required>
                                                                <div class="flex items-center gap-1">
                                                                    <span class="text-xs font-bold text-green-600">+</span>
                                                                    <input type="number" placeholder="+" class="criteria-pos w-16 bg-white dark:bg-gray-600 border rounded-lg px-2 py-2 text-sm text-center" min="1" value="${pos}" required>
                                                                </div>
                                                                <div class="flex items-center gap-1">
                                                                    <span class="text-xs font-bold text-red-500">-</span>
                                                                    <input type="number" placeholder="-" class="criteria-neg w-16 bg-white dark:bg-gray-600 border rounded-lg px-2 py-2 text-sm text-center" min="0" value="${neg}">
                                                                </div>
                                                                <button type="button" onclick="this.parentElement.remove()" class="text-red-400 hover:text-red-600 p-1"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                                                                `;
    container.appendChild(div);
    if (window.lucide) window.lucide.createIcons();
}

async function handleSaveCompetition(e) {
    if (e) e.preventDefault();
    const btn = document.getElementById('save-competition-btn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'جاري الحفظ...';
    }

    try {
        const id = document.getElementById('competition-id').value;
        const name = document.getElementById('competition-name').value;
        const icon = document.getElementById('competition-emoji').value;

        const absentExcuse = parseInt(document.getElementById('comp-absent-excuse').value) || 1;
        const absentNoExcuse = parseInt(document.getElementById('comp-absent-no-excuse').value) || 4;
        const activityPoints = parseInt(document.getElementById('comp-activity-points').value) || 0;
        const activityAbsentPoints = parseInt(document.getElementById('comp-activity-absent-points').value) || 0;

        // Collect Criteria
        const criteriaVals = [];
        document.querySelectorAll('#criteria-list > div').forEach(div => {
            criteriaVals.push({
                id: Date.now() + Math.random().toString(36).substr(2, 9),
                name: div.querySelector('.criteria-name').value,
                positivePoints: parseInt(div.querySelector('.criteria-pos').value) || 0,
                negativePoints: parseInt(div.querySelector('.criteria-neg').value) || 0
            });
        });

        if (criteriaVals.length === 0) {
            showToast("يجب إضافة معيار واحد على الأقل", "error");
            return; // Finally will run to reset button
        }

        const data = {
            name,
            icon,
            criteria: criteriaVals,
            absentExcuse,
            absentNoExcuse,
            activityPoints,
            activityAbsentPoints,
            level: state.currentLevel,
            updatedAt: new Date()
        };

        if (id) {
            await window.firebaseOps.updateDoc(window.firebaseOps.doc(window.db, "competitions", id), data);
            showToast("تم تحديث المسابقة");
        } else {
            data.createdAt = new Date();
            await window.firebaseOps.addDoc(window.firebaseOps.collection(window.db, "competitions"), data);
            showToast("تم إنشاء المسابقة");
        }
        closeModal('competition-modal');
    } catch (err) {
        console.error("Save Error:", err);
        showToast("خطأ في الاتصال أو الحفظ", "error");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'حفظ المسابقة';
        }
    }
}

async function toggleCompetitionActive(id) {
    if (!state.isTeacher) return;
    try {
        // 1. Deactivate all others in this level
        const currentActive = state.competitions.find(c => c.active);
        if (currentActive && currentActive.id !== id) {
            await window.firebaseOps.updateDoc(window.firebaseOps.doc(window.db, "competitions", currentActive.id), { active: false });
        }

        // 2. Toggle target (or set true if we enforce single active)
        // User wants "Select Active". If already active, maybe de-active? Or just keep.
        // Let's toggle.
        const target = state.competitions.find(c => c.id === id);
        const newState = !target.active;

        await window.firebaseOps.updateDoc(window.firebaseOps.doc(window.db, "competitions", id), { active: newState });
        showToast(newState ? "تم تفعيل المسابقة" : "تم إلغاء تفعيل المسابقة");
    } catch (e) {
        console.error(e);
        showToast("خطأ في تغيير الحالة", "error");
    }
}

// Initialization Trigger
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        // Safety timeout
        setTimeout(() => { if (!isAppInitialized) init(); }, 3000);

        if (window.firebaseOps) init();
        else window.addEventListener('firebaseReady', init, { once: true });
    });
} else {
    // Safety timeout
    setTimeout(() => { if (!isAppInitialized) init(); }, 3000);

    if (window.firebaseOps) init();
    else window.addEventListener('firebaseReady', init, { once: true });
}

// === ABSENCE & WHATSAPP LOGIC ===
function openAbsenceOptions() {
    // Get current competition settings
    const comp = state.competitions.find(c => c.id === currentGradingCompId);
    const absentExcuse = comp && comp.absentExcuse ? comp.absentExcuse : 1;
    const absentNoExcuse = comp && comp.absentNoExcuse ? comp.absentNoExcuse : 4;

    let modal = document.getElementById('absence-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'absence-modal';
        modal.className = 'fixed inset-0 bg-black/60 z-[150] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in';
        // Content will be set below
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl text-center">
            <div class="bg-orange-100 dark:bg-orange-900/30 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-orange-600 dark:text-orange-400">
                <i data-lucide="user-x" class="w-8 h-8"></i>
            </div>
            <h3 class="font-bold text-lg mb-2">تسجيل غياب</h3>
            <p class="text-gray-500 text-sm mb-6"> هل غاب الطالب بعذر أم بدون عذر؟</p>
            <div class="grid grid-cols-1 gap-3">
                <button onclick="confirmAbsence('excuse')" class="py-3 rounded-xl bg-teal-50 text-teal-700 border border-teal-200 hover:bg-teal-100 font-bold transition">
                    غائب بعذر (-${absentExcuse})
                </button>
                <button onclick="confirmAbsence('no-excuse')" class="py-3 rounded-xl bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 font-bold transition">
                    غائب بدون عذر (-${absentNoExcuse})
                </button>
                <button onclick="document.getElementById('absence-modal').remove()" class="py-2 text-gray-400 hover:text-gray-600 font-medium text-sm mt-2">إلغاء</button>
            </div>
        </div>
    `;

    if (window.lucide) window.lucide.createIcons();
}

async function confirmAbsence(type) {
    if (!type) return;

    // Get Competition Config
    const comp = state.competitions.find(c => c.id === currentGradingCompId);
    // Default values if not set
    const excusePoints = parseInt((comp && comp.absentExcuse) ? comp.absentExcuse : 1);
    const noExcusePoints = parseInt((comp && comp.absentNoExcuse) ? comp.absentNoExcuse : 4);

    const points = type === 'excuse' ? -excusePoints : -noExcusePoints;
    const label = type === 'excuse' ? 'غائب بعذر' : 'غائب بدون عذر';

    // Submit as a special score
    await submitScore('ABSENCE_RECORD', points, label, 'negative');

    var absenceModal = document.getElementById('absence-modal');
    if (absenceModal) absenceModal.remove();

    // Notify Parent via WhatsApp
    var student = state.students.find(function (s) { return s.id === currentRateStudentId; });
    if (student && student.studentNumber) {
        var phone = student.studentNumber;
        var msg = "السلام عليكم ولي أمر الطالب " + student.name + "،\nتم تسجيل غياب للطالب اليوم (" + label + ").\nنرجو الحرص على الحضور.";
        var url = "https://wa.me/" + phone + "?text=" + encodeURIComponent(msg);
        window.open(url, '_blank');
    }
}

async function generateWeeklyReport() {
    const student = state.students.find(s => s.id === currentRateStudentId);
    if (!student) return;

    if (!student.studentNumber) {
        showToast("لا يوجد رقم هاتف لولي الأمر", "error");
        return;
    }

    const comp = state.competitions.find(c => c.id === currentGradingCompId);
    if (!comp) return;

    // 1. Calculate Date Range (Sun - Thu) of Current Week
    const today = new Date();
    const dayOfWeek = today.getDay(); // Sun=0, Sat=6
    // If today is Friday(5) or Sat(6), we still report for the past week (Sun-Thu).
    // Start of Week (Sunday):
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - dayOfWeek);
    startOfWeek.setHours(0, 0, 0, 0);

    // Format dates for comparison (YYYY-MM-DD)
    // We need to fetch scores from Firestore or use locally cached state.scores if reliable.
    // state.scores currently fetches ALL scores in 'renderHome'. 
    // In 'renderCompetitions' -> 'grading', we might not have all scores loaded if we are teacher and didn't visit home?
    // Let's query Firestore for this student for this week to be safe and accurate.

    // Days Passed (Sun -> Today). Clamp to 5 (Thu).
    // Force 5 days (Sun, Mon, Tue, Wed, Thu)
    const daysPassed = 5;

    const dateStrings = [];
    for (let i = 0; i < daysPassed; i++) {
        const d = new Date(startOfWeek);
        d.setDate(startOfWeek.getDate() + i);
        // Manual YYYY-MM-DD
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        dateStrings.push(`${year}-${month}-${day}`);
    }

    showToast("جاري إعداد التقرير...");

    try {
        // Query scores for student
        // We can't use 'in' query for dates easily if array large, but max 5.
        const q = window.firebaseOps.query(
            window.firebaseOps.collection(window.db, "scores"),
            window.firebaseOps.where("studentId", "==", student.id),
            window.firebaseOps.where("competitionId", "==", comp.id),
            window.firebaseOps.where("date", "in", dateStrings)
        );

        const snap = await window.firebaseOps.getDocs(q);
        const scores = [];
        snap.forEach(d => scores.push(d.data()));

        // NEW: Fetch Activity Days Log
        const activityQuery = window.firebaseOps.query(
            window.firebaseOps.collection(window.db, "activity_days"),
            window.firebaseOps.where("competitionId", "==", comp.id),
            window.firebaseOps.where("date", "in", dateStrings)
        );
        const activitySnap = await window.firebaseOps.getDocs(activityQuery);
        const activityLog = {}; // date -> points
        let activityDaysTaken = 0;
        let totalActivityPossible = 0;
        activitySnap.forEach(d => {
            const data = d.data();
            activityLog[data.date] = data.points;
            activityDaysTaken++;
            totalActivityPossible += (parseInt(data.points) || 0);
        });

        // Calculate Totals per Criteria
        let reportText = `📊 *تقرير الأسبوع الماضي* 📊\n`;
        reportText += `👤 الطالب: ${student.name}\n`;
        reportText += `📅 الأسبوع: ${dateStrings[0]} إلى ${dateStrings[dateStrings.length - 1]}\n`;
        if (activityDaysTaken > 0) {
            reportText += `🎪 تم إقامة نشاط (${activityDaysTaken} يوم)\n`;
        }
        reportText += `------------------\n`;

        let totalEarned = 0;
        let totalPossible = 0;

        const normalDaysCount = daysPassed - activityDaysTaken;

        if (comp.criteria) {
            comp.criteria.forEach(c => {
                // Earned
                const cScores = scores.filter(s => s.criteriaId === c.id);
                const earned = cScores.reduce((sum, s) => sum + s.points, 0);

                // Possible: Criteria Points * Normal Days
                const possible = (parseInt(c.positivePoints) || 0) * normalDaysCount;

                reportText += `🔹 ${c.name}: ${earned} / ${possible}\n`;

                totalEarned += earned;
                totalPossible += possible;
            });
        }

        // Add Activity Points if any
        if (activityDaysTaken > 0) {
            const activityScores = scores.filter(s => s.criteriaId === 'ACTIVITY_DAY');
            const activityEarned = activityScores.reduce((sum, s) => sum + s.points, 0);
        reportText += `🏃 نقاط النشاط: ${activityEarned} / ${totalActivityPossible}\n`;
            totalEarned += activityEarned;
            totalPossible += totalActivityPossible;
        }

        // Add Absence Deductions if any
        const absences = scores.filter(s => s.criteriaId === 'ABSENCE_RECORD');
        let absentDays = [];
        if (absences.length > 0) {
            const deduction = absences.reduce((sum, s) => sum + s.points, 0);
            reportText += `⚠️ خصم غياب: ${deduction}\n`;
            absences.forEach(ab => {
                absentDays.push(`${ab.date} (${ab.criteriaName || 'غياب'})`);
            });
            totalEarned += deduction;
        }

        if (absentDays.length > 0) {
            reportText += `❌ أيام الغياب:\n${absentDays.join('\n')}\n`;
        }

        reportText += `------------------\n`;
        reportText += `✨ *المجموع النهائي: ${totalEarned} / ${totalPossible}*\n`;
        reportText += `\nشاكرين تعاونكم 🌹`;

        // Send
        const url = `https://wa.me/${student.studentNumber}?text=${encodeURIComponent(reportText)}`;
        window.open(url, '_blank');

    } catch (e) {
        console.error(e);
        showToast("خطأ في إنشاء التقرير", "error");
    }
}

function getQuranSearchModalHTML() {
    return `
    <div id="quran-search-modal" class="fixed inset-0 bg-black/60 z-[100] hidden flex items-center justify-center p-4">
        <div class="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-lg p-6 shadow-2xl max-h-[90vh] flex flex-col">
            <div class="flex justify-between items-center mb-4 shrink-0">
                <h3 class="font-bold text-lg flex items-center gap-2 text-emerald-700 dark:text-emerald-400"><i data-lucide="book" class="w-5 h-5"></i> بحث في المصحف</h3>
                <button onclick="closeModal('quran-search-modal')" class="text-gray-400 hover:text-gray-600"><i data-lucide="x"></i></button>
            </div>
            
            <div class="flex gap-2 mb-4 shrink-0">
                <input type="text" id="quran-search-query" placeholder="ابحث بجزء من الآية (مسموح بدون تشكيل)..." class="flex-1 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition" onkeydown="if(event.key === 'Enter') executeQuranSearch()">
                <button onclick="executeQuranSearch()" class="bg-emerald-600 text-white px-5 py-3 rounded-xl font-bold hover:bg-emerald-700 transition flex items-center gap-2"><i data-lucide="search" class="w-5 h-5"></i></button>
            </div>
            
            <div id="quran-search-results" class="flex-1 overflow-y-auto space-y-3 p-1">
                <div class="text-center py-8 opacity-50">
                    <i data-lucide="search" class="w-12 h-12 mx-auto mb-3"></i>
                    <p class="text-sm">اكتب كلمة للبحث عنها، للوصول السريع لاسم السورة وأرقام الآيات.</p>
                </div>
            </div>
        </div>
    </div>
    `;
}

async function openQuranSearchModal() {
    // 1. Ensure modal exists in DOM
    if (!document.getElementById('quran-search-modal')) {
        const div = document.createElement('div');
        div.innerHTML = getQuranSearchModalHTML();
        document.body.appendChild(div.firstElementChild);
        lucide.createIcons();
    }

    toggleModal('quran-search-modal', true);
    
    if (typeof QuranService !== 'undefined' && !QuranService.isLoaded()) {
        const res = $('#quran-search-results');
        const oldHtml = res.innerHTML;
        res.innerHTML = '<div class="text-center py-8"><i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto text-emerald-600"></i><p class="text-xs text-gray-500 mt-2">جاري جلب بيانات المصحف...</p></div>';
        lucide.createIcons();
        await QuranService.loadData();
        res.innerHTML = oldHtml;
    }
    
    setTimeout(() => {
        const input = $('#quran-search-query');
        if(input) input.focus();
    }, 100);
}

function executeQuranSearch() {
    const query = $('#quran-search-query').value;
    const res = $('#quran-search-results');
    
    if (!query || query.trim() === '') {
        res.innerHTML = '<p class="text-center text-red-500 py-4 text-sm font-bold">الرجاء إدخال كلمة للبحث!</p>';
        return;
    }
    
    if (typeof QuranService === 'undefined' || !QuranService.isLoaded()) {
         showToast("خدمة المصحف غير متوفرة", "error");
         return;
    }
    
    // UI Loading state
    res.innerHTML = '<div class="text-center py-8"><i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto text-emerald-600"></i></div>';
    lucide.createIcons();
    
    setTimeout(() => {
        const results = QuranService.searchAyahs(query);
        if (results.length === 0) {
            res.innerHTML = '<p class="text-center text-gray-500 py-8 font-bold">لم يتم العثور على نتائج مطابقة.</p>';
            return;
        }
        
        const toShow = results.slice(0, 30);
        
        let html = `<p class="text-xs text-gray-500 mb-3 text-center border-b pb-2">تم العثور على <span class="font-bold text-emerald-600">${results.length}</span> آية ${results.length > 30 ? '(عرض أول 30)' : ''}</p>`;
        
        toShow.forEach(aya => {
            html += `
                <div class="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-xl border border-gray-200 dark:border-gray-600 shadow-sm transition hover:border-emerald-400">
                    <div class="flex justify-between items-center mb-3">
                        <span class="text-xs font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1"><i data-lucide="book-open" class="w-3 h-3"></i> سورة ${aya.sura_name_ar}</span>
                        <span class="text-[10px] text-gray-500 bg-white dark:bg-gray-600 px-2 py-0.5 rounded-full border">الجزء ${aya.jozz} | الآية ${aya.aya_no}</span>
                    </div>
                    <p class="font-quran text-gray-800 dark:text-gray-200 text-lg leading-loose text-justify" dir="rtl">${aya.aya_text} ﴿${Number(aya.aya_no).toLocaleString('ar-EG')}﴾</p>
                </div>
            `;
        });
        
        res.innerHTML = html;
        lucide.createIcons();
    }, 50); // slight delay to allow rendering spinner
}

// Global Modals Helper
function ensureGlobalModals() {
    if (!document.getElementById('student-modal')) {
        const modalsHTML = getStudentModalHTML() + getCompetitionModalsHTML() + getQuranSearchModalHTML();
        document.body.insertAdjacentHTML('beforeend', modalsHTML);
        document.body.insertAdjacentHTML('beforeend', getGradingModalsHTML());
    }
}

// Delete Competition Function
let compToDeleteId = null;
async function deleteCompetition(id) {
    compToDeleteId = id;
    toggleModal('delete-competition-modal', true);
    document.getElementById('confirm-delete-comp-btn').onclick = performDeleteCompetition;
}

async function performDeleteCompetition() {
    if (!compToDeleteId) return;
    try {
        await window.firebaseOps.deleteDoc(window.firebaseOps.doc(window.db, "competitions", compToDeleteId));
        showToast("تم حذف المسابقة");
        closeModal('delete-competition-modal');
    } catch (e) {
        console.error(e);
        showToast("خطأ في حذف المسابقة", "error");
    }
}

// === PARENT PORTAL ===

async function renderParentDashboard() {
    const container = $('#view-container');

    // If we need to reload students (e.g. after page refresh)
    if (state.parentStudents.length === 0 && state.parentPhone) {
        const q = window.firebaseOps.query(
            window.firebaseOps.collection(window.db, "students"),
            window.firebaseOps.where("parentPhone", "==", state.parentPhone)
        );
        const snap = await window.firebaseOps.getDocs(q);
        state.parentStudents = [];
        snap.forEach(doc => {
            var dData = doc.data();
            dData.id = doc.id;
            state.parentStudents.push(dData);
        });
    }

    const students = state.parentStudents;

    container.innerHTML = `
        <div class="p-4 pb-24 max-w-lg mx-auto">
            <!-- Header -->
            <div class="bg-gradient-to-r from-amber-500 to-amber-600 rounded-2xl p-6 mb-6 text-white shadow-lg">
                <div class="flex items-center gap-4">
                    <div class="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center text-3xl">👨‍👩‍👧‍👦</div>
                    <div>
                        <h1 class="text-xl font-bold">بوابة ولي الأمر</h1>
                        <p class="text-amber-100 text-sm">متابعة أداء أبنائك</p>
                    </div>
                </div>
            </div>

            <!-- Students Count -->
            <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 mb-4 shadow-sm border flex items-center justify-between">
                <div>
                    <p class="text-gray-500 text-sm">عدد الطلاب المسجلين</p>
                    <p class="text-2xl font-bold text-amber-600">${students.length}</p>
                </div>
                <div class="w-12 h-12 bg-amber-100 dark:bg-amber-900 rounded-xl flex items-center justify-center text-xl">📚</div>
            </div>

            <!-- Students List -->
            <h2 class="font-bold text-lg mb-3 flex items-center gap-2"><i data-lucide="users" class="w-5 h-5 text-amber-600"></i> أبنائي</h2>
            <div class="space-y-3">
                ${students.length === 0 ? '<p class="text-center text-gray-400 py-8">لا يوجد طلاب مسجلين بهذا الرقم</p>' : ''}
                ${students.map(s => {
        const level = LEVELS[s.level] || { name: 'غير محدد', emoji: '📚' };
        const iconHtml = isImgSrc(s.icon)
            ? `<img src="${s.icon}" class="w-full h-full object-cover rounded-full">`
            : (s.icon || '👤');
        return `
                    <div onclick="openStudentReport('${s.id}')" class="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border hover:border-amber-400 cursor-pointer transition flex items-center gap-4">
                        <div class="w-14 h-14 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center text-2xl border-2 border-amber-200 overflow-hidden">
                            ${iconHtml}
                        </div>
                        <div class="flex-1">
                            <h3 class="font-bold text-gray-800 dark:text-gray-100">${s.name}</h3>
                            <p class="text-xs text-gray-500">${level.emoji} ${level.name}</p>
                        </div>
                        <div class="text-amber-500">
                            <i data-lucide="chevron-left" class="w-5 h-5"></i>
                        </div>
                    </div>
                    `;
    }).join('')}
            </div>

            <!-- Action Buttons -->
            <div class="mt-8 space-y-3">
                <button onclick="logout()" class="w-full py-3 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-xl font-bold hover:bg-gray-200 dark:hover:bg-gray-600 transition flex items-center justify-center gap-2">
                    <i data-lucide="log-out" class="w-4 h-4"></i>
                    تسجيل الخروج
                </button>
            </div>
        </div>
    `;
    lucide.createIcons();
}

async function openStudentReport(studentId) {
    const container = $('#view-container');
    container.innerHTML = '<div class="flex justify-center p-8"><i data-lucide="loader-2" class="animate-spin w-8 h-8 text-amber-600"></i></div>';
    lucide.createIcons();

    let student = null;
    if (state.isParent) {
        student = state.parentStudents.find(s => s.id === studentId);
    } else {
        student = window._currentStudentRecord || state.students.find(s => s.id === studentId);
        if(!student && window._tempLevelStudents) {
            student = window._tempLevelStudents.find(s => s.id === studentId);
        }
    }

    if (!student) {
        container.innerHTML = '<p class="text-center text-red-500 p-8">الطالب غير موجود</p>';
        return;
    }

    const level = LEVELS[student.level] || { name: 'غير محدد', emoji: '📚' };

    // Fetch student scores
    const scoresQuery = window.firebaseOps.query(
        window.firebaseOps.collection(window.db, "scores"),
        window.firebaseOps.where("studentId", "==", studentId)
    );
    const scoresSnap = await window.firebaseOps.getDocs(scoresQuery);
    const scores = [];
    scoresSnap.forEach(function (doc) {
        var data = doc.data();
        data.id = doc.id;
        scores.push(data);
    });

    // Calculate statistics
    let totalPoints = 0;
    let absenceDays = 0;
    let absenceWithExcuse = 0;
    let absenceNoExcuse = 0;
    const criteriaStats = {};
    const absenceRecordsWithExcuse = [];
    const absenceRecordsNoExcuse = [];

    scores.forEach(s => {
        totalPoints += (s.points || 0);

        if (s.criteriaId === 'ABSENCE_RECORD') {
            absenceDays++;
            if (s.criteriaName && s.criteriaName.indexOf('بعذر') !== -1) {
                absenceWithExcuse++;
                absenceRecordsWithExcuse.push({ date: s.date || 'غير محدد', points: s.points });
            } else {
                absenceNoExcuse++;
                absenceRecordsNoExcuse.push({ date: s.date || 'غير محدد', points: s.points });
            }
        } else {
            const key = s.criteriaName || 'أخرى';
            if (!criteriaStats[key]) criteriaStats[key] = { positive: 0, negative: 0, count: 0 };
            criteriaStats[key].count++;
            if (s.points > 0) criteriaStats[key].positive += s.points;
            else criteriaStats[key].negative += s.points;
        }
    });

    // Store absence records in window for modal access
    window._absenceRecordsWithExcuse = absenceRecordsWithExcuse.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    window._absenceRecordsNoExcuse = absenceRecordsNoExcuse.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    // Fetch student's group
    let groupName = 'غير محدد';
    const groupsQuery = window.firebaseOps.query(
        window.firebaseOps.collection(window.db, "groups"),
        window.firebaseOps.where("members", "array-contains", studentId)
    );
    const groupsSnap = await window.firebaseOps.getDocs(groupsQuery);
    if (!groupsSnap.empty) {
        groupName = groupsSnap.docs[0].data().name;
    }

    // Fetch ALL teachers for this level
    let teachers = [];
    const teachersQuery = window.firebaseOps.query(
        window.firebaseOps.collection(window.db, "teachers"),
        window.firebaseOps.where("level", "==", student.level)
    );
    const teachersSnap = await window.firebaseOps.getDocs(teachersQuery);
    teachersSnap.forEach(doc => {
        var data = doc.data();
        data.id = doc.id;
        teachers.push(data);
    });

    const iconHtml = isImgSrc(student.icon)
        ? `<img src="${student.icon}" class="w-full h-full object-cover rounded-full">`
        : (student.icon || '👤');



    // Save data globally for calendar interaction
    window._currentStudentData = student;
    window._currentStudentScores = scores;
    
    const todayDate = new Date();
    window._currentCalendarYear = todayDate.getFullYear();
    window._currentCalendarMonth = todayDate.getMonth();
    
    // Will be generated dynamically via renderStudentCalendar
    const calendarHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 mb-4 shadow-sm border" id="student-calendar-container">
            <div class="text-center py-4 text-gray-500 text-sm">جاري تحميل التقويم...</div>
        </div>
    `;

    // Generate contact button HTML based on teachers count
    let contactHTML = '';
    if (teachers.length === 0) {
        contactHTML = `
            <div class="bg-gray-100 dark:bg-gray-700 rounded-xl p-4 text-center text-gray-500 text-sm">
                <i data-lucide="info" class="w-5 h-5 mx-auto mb-2"></i>
                لم يتم تسجيل بيانات المعلم بعد
            </div>
        `;
    } else if (teachers.length === 1) {
        contactHTML = `
            <button onclick="contactTeacher('${student.name}', '${teachers[0].phone}')" class="w-full py-4 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl shadow-lg transition flex items-center justify-center gap-3">
                <i data-lucide="message-circle" class="w-5 h-5"></i>
                تواصل مع المعلم (${teachers[0].name || 'المعلم'})
            </button>
        `;
    } else {
        // Multiple teachers - store in window for modal access
        window._teachersForContact = teachers;
        window._currentStudentName = student.name;
        contactHTML = `
            <button onclick="openTeacherSelectionModal()" class="w-full py-4 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl shadow-lg transition flex items-center justify-center gap-3">
                <i data-lucide="message-circle" class="w-5 h-5"></i>
                تواصل مع المعلم (${teachers.length} معلمين)
            </button>
        `;
    }

    const isStudent = (!state.isParent && !state.isTeacher);

    let topButtonsHTML = '';
    if (state.isParent) {
        topButtonsHTML = `
            <button onclick="renderParentDashboard()" class="flex items-center gap-2 text-gray-500 hover:text-amber-600 mb-4 font-bold">
                <i data-lucide="arrow-right" class="w-4 h-4"></i>
                العودة لقائمة الأبناء
            </button>
        `;
    } else if (state.isTeacher) {
        topButtonsHTML = `
            <button onclick="renderStudents()" class="flex items-center gap-2 text-gray-500 hover:text-teal-600 mb-4 font-bold">
                <i data-lucide="arrow-right" class="w-4 h-4"></i>
                العودة لقائمة الطلاب
            </button>
        `;
    } else if (isStudent) {
        topButtonsHTML = ``;
    }

    container.innerHTML = `
        <div class="p-4 pb-24 max-w-lg mx-auto">
            ${topButtonsHTML}

            <!-- Student Header -->
            <div class="bg-gradient-to-r ${isStudent ? 'from-teal-600 to-teal-800' : 'from-teal-500 to-teal-600'} rounded-2xl p-6 mb-6 text-white shadow-lg">
                <div class="flex items-center gap-4">
                    <div class="w-20 h-20 bg-white rounded-full flex items-center justify-center text-3xl border-4 border-white/50 overflow-hidden">
                        ${iconHtml}
                    </div>
                    <div>
                        <h1 class="text-xl font-bold">${student.name}</h1>
                        <p class="text-teal-100 text-sm">${level.emoji} ${level.name}</p>
                        <p class="text-teal-100 text-xs mt-1 flex items-center gap-1"><i data-lucide="users" class="w-3 h-3"></i> المجموعة: ${groupName}</p>
                    </div>
                </div>
            </div>

            <!-- Quick Stats -->
            <div class="grid grid-cols-3 gap-3 mb-6">
                <div class="bg-white dark:bg-gray-800 rounded-xl p-3 text-center shadow-sm border">
                    <p class="text-2xl font-bold ${totalPoints >= 0 ? 'text-green-600' : 'text-red-600'}">${totalPoints}</p>
                    <p class="text-xs text-gray-500">النقاط</p>
                </div>
                <div class="bg-white dark:bg-gray-800 rounded-xl p-3 text-center shadow-sm border">
                    <p class="text-2xl font-bold text-orange-600">${absenceDays}</p>
                    <p class="text-xs text-gray-500">أيام الغياب</p>
                </div>
                <div class="bg-white dark:bg-gray-800 rounded-xl p-3 text-center shadow-sm border">
                    <p class="text-2xl font-bold text-blue-600">${scores.length}</p>
                    <p class="text-xs text-gray-500">إجمالي التقييمات</p>
                </div>
            </div>

            <!-- Memorization Plan -->
            ${student.memorizationPlan || student.reviewPlan ? `
            <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 mb-4 shadow-sm border">
                <h3 class="font-bold mb-3 flex items-center gap-2"><i data-lucide="book-open" class="w-4 h-4 text-teal-600"></i> الخطة</h3>
                ${student.memorizationPlan ? `<p class="text-sm mb-2"><span class="font-bold text-teal-600">الحفظ:</span> ${student.memorizationPlan}</p>` : ''}
                ${student.reviewPlan ? `<p class="text-sm"><span class="font-bold text-purple-600">المراجعة:</span> ${student.reviewPlan}</p>` : ''}
            </div>
            ` : ''}

            <!-- Quran Recitation Log (Removed) -->


            <!-- Visual Calendar -->
            ${calendarHTML}
            ${(isStudent) ? `
                <div class="mb-5 flex justify-center">
                    <button onclick="openQuranSearchModal()" class="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-lg transition flex items-center justify-center gap-2">
                        <i data-lucide="book-open" class="w-5 h-5"></i>
                         المصحف الشريف
                    </button>
                </div>
            ` : ''}

            <!-- Absence Details -->
            <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 mb-4 shadow-sm border">
                <h3 class="font-bold mb-3 flex items-center gap-2"><i data-lucide="calendar-x" class="w-4 h-4 text-orange-600"></i> تفاصيل الغياب</h3>
                <div class="grid grid-cols-2 gap-3">
                    <div onclick="showAbsenceDates('excuse')" class="bg-teal-50 dark:bg-teal-900/30 rounded-xl p-3 text-center cursor-pointer hover:ring-2 hover:ring-teal-400 transition">
                        <p class="text-xl font-bold text-teal-700 dark:text-teal-400">${absenceWithExcuse}</p>
                        <p class="text-xs text-teal-600">بعذر ▸</p>
                    </div>
                    <div onclick="showAbsenceDates('noexcuse')" class="bg-red-50 dark:bg-red-900/30 rounded-xl p-3 text-center cursor-pointer hover:ring-2 hover:ring-red-400 transition">
                        <p class="text-xl font-bold text-red-700 dark:text-red-400">${absenceNoExcuse}</p>
                        <p class="text-xs text-red-600">بدون عذر ▸</p>
                    </div>
                </div>
            </div>

            <!-- Contact Teacher -->
            ${!state.isTeacher ? contactHTML : ''}
        </div>
    `;
    lucide.createIcons();
    
    // Render initial calendar
    setTimeout(() => {
        window.renderStudentCalendar(window._currentCalendarYear, window._currentCalendarMonth);
    }, 100);
}

// ----------------------------------------
// Dynamic Calendar Logic
// ----------------------------------------
window.changeCalendarMonth = (offset) => {
    window._currentCalendarMonth += offset;
    if (window._currentCalendarMonth > 11) {
        window._currentCalendarMonth = 0;
        window._currentCalendarYear++;
    } else if (window._currentCalendarMonth < 0) {
        window._currentCalendarMonth = 11;
        window._currentCalendarYear--;
    }
    window.renderStudentCalendar(window._currentCalendarYear, window._currentCalendarMonth);
};

window.renderStudentCalendar = (year, month) => {
    const container = document.getElementById('student-calendar-container');
    if (!container) return;
    
    const scores = window._currentStudentScores || [];
    const todayDate = new Date();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    
    const scoresByDate = {};
    scores.forEach(s => {
        if (!s.date) return;
        if (!scoresByDate[s.date]) scoresByDate[s.date] = { points: 0, criteria: [], hasQuran: false, quranTypes: [] };
        scoresByDate[s.date].points += (parseInt(s.points) || 0);
        scoresByDate[s.date].criteria.push(s.criteriaName || (s.criteriaId === 'ABSENCE_RECORD' ? 'غياب' : 'أخرى'));
        if (s.quranType) {
            scoresByDate[s.date].hasQuran = true;
            if (!scoresByDate[s.date].quranTypes.includes(s.quranType)) {
                scoresByDate[s.date].quranTypes.push(s.quranType);
            }
        }
    });
    
    let calendarDaysHTML = '';
    const weekdays = ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];
    let calendarHeaderHTML = weekdays.map(d => `<div class="text-center text-xs font-bold text-gray-400 py-1">${d}</div>`).join('');
    
    for(let i = 0; i < firstDay; i++) {
        calendarDaysHTML += `<div class="p-2 opacity-0"></div>`;
    }
    
    for(let i = 1; i <= daysInMonth; i++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        const dayData = scoresByDate[dateStr];
        const plannedTasks = (window._currentStudentPlannedDays || []).filter(p => p.date === dateStr);

        let dayClass = 'bg-gray-50 dark:bg-gray-700/50 border border-gray-100 dark:border-gray-600 rounded-lg p-1 text-center min-h-[45px] flex flex-col items-center justify-center';
        let dayContent = `<span class="text-xs font-bold text-gray-400">${i}</span>`;
        
        let hasData = false;
        let dayContentTags = [];
        
        if (dayData) {
            hasData = true;
            const isAbsence = dayData.criteria.some(c => c && c.indexOf('غياب') !== -1);
            if (isAbsence) {
                dayClass = 'bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-1 text-center min-h-[45px] flex flex-col items-center justify-center cursor-pointer hover:ring-2 hover:ring-red-400 transition';
                dayContentTags.push(`<span class="text-[10px] mt-0.5" title="${dayData.criteria.join(', ')}">❌</span>`);
            } else if (dayData.points > 0 || dayData.hasQuran) {
                dayClass = 'bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg p-1 text-center min-h-[45px] flex flex-col items-center justify-center cursor-pointer hover:ring-2 hover:ring-green-400 transition';
                if (dayData.points > 0) {
                    dayContentTags.push(`<span class="text-[10px] font-bold text-green-600 mt-0.5" title="${dayData.criteria.join(', ')}">+${dayData.points}</span>`);
                }
                if (dayData.hasQuran) {
                    let qIcons = '';
                    if (dayData.quranTypes.includes('memorization')) qIcons += '📝';
                    if (dayData.quranTypes.includes('review')) qIcons += '🔄';
                    dayContentTags.push(`<span class="text-[10px] mt-0.5" title="سجل قرآن">${qIcons}</span>`);
                }
            } else if (dayData.points < 0) {
                dayClass = 'bg-orange-50 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-800 rounded-lg p-1 text-center min-h-[45px] flex flex-col items-center justify-center cursor-pointer hover:ring-2 hover:ring-orange-400 transition';
                dayContentTags.push(`<span class="text-[10px] font-bold text-orange-600 mt-0.5" title="${dayData.criteria.join(', ')}">${dayData.points}</span>`);
            }
        }
        
        if (plannedTasks.length > 0) {
            const hasHifz = plannedTasks.some(p => p.planType === 'memorization');
            const hasReview = plannedTasks.some(p => p.planType === 'review');
            
            if (!hasData) {
                dayClass = 'bg-teal-50 dark:bg-teal-900/10 border border-teal-200 dark:border-teal-800 rounded-lg p-1 text-center min-h-[45px] flex flex-col items-center justify-center cursor-pointer hover:ring-2 hover:ring-teal-400 transition';
            }
            
            let dots = '';
            if (hasHifz) dots += `<span class="w-1.5 h-1.5 rounded-full bg-teal-500"></span>`;
            if (hasReview) dots += `<span class="w-1.5 h-1.5 rounded-full bg-purple-500"></span>`;
            dayContentTags.push(`<div class="flex gap-1 mt-1">${dots}</div>`);
        }

        if (dayData || plannedTasks.length > 0) {
            dayContent = `<span class="text-xs font-bold ${hasData ? (dayClass.includes('red') ? 'text-red-700 dark:text-red-400' : (dayClass.includes('green') ? 'text-green-700 dark:text-green-400' : 'text-orange-700 dark:text-orange-400')) : 'text-teal-800 dark:text-teal-300'}">${i}</span>`;
            dayContent += `<div class="flex flex-col items-center justify-center">` + dayContentTags.join('') + `</div>`;
            calendarDaysHTML += `<div class="${dayClass}" onclick="showDayDetails('${dateStr}')">${dayContent}</div>`;
        } else if (dateStr === todayDate.toISOString().split('T')[0]) {
             dayClass = 'bg-blue-50 dark:bg-blue-900/30 border-2 border-blue-400 dark:border-blue-600 rounded-lg p-1 text-center min-h-[45px] flex flex-col items-center justify-center relative';
             dayContent = `<span class="text-xs font-bold text-blue-700 dark:text-blue-400">${i}</span>`;
             calendarDaysHTML += `<div class="${dayClass}" onclick="showDayDetails('${dateStr}')">${dayContent}</div>`;
        } else {
             calendarDaysHTML += `<div class="${dayClass}">${dayContent}</div>`;
        }
    }

    const monthNames = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
    const monthName = monthNames[month];

    container.innerHTML = `
        <div class="flex justify-between items-center mb-4">
            <h3 class="font-bold flex items-center gap-2"><i data-lucide="calendar" class="w-4 h-4 text-blue-600"></i> التقويم الشهري</h3>
            <div class="flex items-center gap-2">
                <button onclick="changeCalendarMonth(-1)" class="w-6 h-6 flex items-center justify-center bg-gray-100 dark:bg-gray-700 rounded-full hover:bg-teal-100 text-teal-600 transition"><i data-lucide="chevron-right" class="w-4 h-4"></i></button>
                <span class="text-xs font-bold text-gray-500 bg-gray-100 dark:bg-gray-700 px-3 py-1 rounded-full">${monthName} ${year}</span>
                <button onclick="changeCalendarMonth(1)" class="w-6 h-6 flex items-center justify-center bg-gray-100 dark:bg-gray-700 rounded-full hover:bg-teal-100 text-teal-600 transition"><i data-lucide="chevron-left" class="w-4 h-4"></i></button>
            </div>
        </div>
        <div class="space-y-1">
            <div class="grid grid-cols-7 gap-1">${calendarHeaderHTML}</div>
            <div class="grid grid-cols-7 gap-1 mt-1">${calendarDaysHTML}</div>
            <div class="flex items-center gap-3 mt-4 justify-center text-[10px] text-gray-500">
                <div class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-green-500"></span> إضافة</div>
                <div class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-orange-500"></span> خصم</div>
                <div class="flex items-center gap-1"><span class="w-3 h-3 flex items-center justify-center text-[8px]">❌</span> غياب</div>
            </div>
        </div>
    `;
    lucide.createIcons();
}

// Show specific day details for parent
window.showDayDetails = (dateStr) => {
    const scores = window._currentStudentScores || [];
    const dayScores = scores.filter(s => s.date === dateStr);
    
    if (dayScores.length === 0) return;

    let html = `<div class="space-y-3">`;

    if (dayScores.length > 0) {
        const grouped = {};
        dayScores.forEach(s => { grouped[s.criteriaId || s.criteriaName || Math.random()] = s; });
        const uniqueScores = Object.values(grouped);

        uniqueScores.forEach(s => {
            const isPositive = s.points > 0;
            const isAbsence = s.criteriaId === 'ABSENCE_RECORD';
            const isQuran = s.criteriaId === 'QURAN_MEMORIZATION' || s.criteriaId === 'QURAN_REVIEW';

            let badge = '';
            if (isQuran) {
                badge = `<span class="text-xs font-bold px-2 py-1 rounded-lg bg-teal-100 text-teal-700">${s.criteriaId === 'QURAN_MEMORIZATION' ? '📝 حفظ' : '🔄 مراجعة'}</span>`;
            } else if (isAbsence) {
                badge = `<span class="text-xs font-bold px-2 py-1 rounded-lg bg-red-100 text-red-700">غياب ❌</span>`;
            } else {
                badge = `<span class="text-sm font-bold px-2 py-1 rounded-lg ${isPositive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">${isPositive ? '+' : ''}${s.points}</span>`;
            }

            html += `
            <div class="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 border border-gray-100 dark:border-gray-600">
                <div class="flex justify-between items-center mb-2">
                    <span class="font-bold text-sm text-gray-800 dark:text-gray-100">${s.criteriaName || (isAbsence ? 'غياب' : 'تقييم')}</span>
                    ${badge}
                </div>
                ${s.quranSection ? `
                <div class="mt-2 p-3 bg-teal-50 dark:bg-teal-900/20 border border-teal-100 dark:border-teal-800 rounded-lg">
                    <p class="text-xs font-bold text-teal-700 dark:text-teal-400 mb-1">📖 المقطع:</p>
                    <p class="text-xs text-gray-600 dark:text-gray-400 mb-2 font-bold">${s.quranSection}</p>
                    <button onclick="window._openQuranForScore('${s.id}')" class="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition flex items-center justify-center gap-2">
                        <i data-lucide="book-open" class="w-4 h-4"></i> عرض الآيات
                    </button>
                </div>
                ` : ''}
            </div>
            `;
        });

        window._openQuranForScore = (scoreId) => {
            const score = uniqueScores.find(s => s.id === scoreId);
            if (!score || !score.quranStartSura || !score.quranEndSura) {
                showToast('التفاصيل الدقيقة للآيات غير متوفرة لهذا السجل القديم', 'error');
                return;
            }
            
            if (!window.QuranService || !window.QuranService.isLoaded()) {
                showToast('برجاء الانتظار لحين تحميل المصحف', 'error');
                return;
            }

            const sections = [];
        const startSura = Number(score.quranStartSura);
        const endSura = Number(score.quranEndSura);
        const startAya = Number(score.quranStartAya);
        const endAya = Number(score.quranEndAya);

        if (isNaN(startSura) || isNaN(endSura) || isNaN(startAya) || isNaN(endAya)) {
            showToast('بيانات الآيات غير مكتملة في هذا السجل', 'error');
            return;
        }

        const suras = window.QuranService.getSuras();

        if (startSura === endSura) {
            const sObj = suras.find(s => s.number == startSura);
            sections.push({
                suraNo: startSura,
                suraName: sObj ? sObj.name : startSura,
                fromAyah: startAya,
                toAyah: endAya
            });
        } else {
            // Start Sura
            const sObjStart = suras.find(s => s.number == startSura);
            sections.push({
                suraNo: startSura,
                suraName: sObjStart ? sObjStart.name : startSura,
                fromAyah: startAya,
                toAyah: sObjStart ? sObjStart.total_ayahs : 300 // Max safety
            });
            // Middle Suras
            for (let i = startSura + 1; i < endSura; i++) {
                const mid = suras.find(s => s.number == i);
                if (mid) {
                    sections.push({
                        suraNo: i,
                        suraName: mid.name,
                        fromAyah: 1,
                        toAyah: mid.total_ayahs
                    });
                }
            }
            // End Sura
            const sObjEnd = suras.find(s => s.number == endSura);
            sections.push({
                suraNo: endSura,
                suraName: sObjEnd ? sObjEnd.name : endSura,
                fromAyah: 1,
                toAyah: endAya
            });
        }

            const ayahsHtml = window.QuranService.getTextForSections(sections);
            
            let viewerModal = document.getElementById('quran-ayah-viewer');
            if (!viewerModal) {
                viewerModal = document.createElement('div');
                viewerModal.id = 'quran-ayah-viewer';
                document.body.appendChild(viewerModal);
            }
            viewerModal.className = 'fixed inset-0 bg-black/80 z-[300] flex items-center justify-center p-4 backdrop-blur-md animate-fade-in';
            viewerModal.innerHTML = `
                <div class="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
                    <div class="flex justify-between items-center p-5 border-b border-gray-100 dark:border-gray-700">
                        <h3 class="font-bold text-lg text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                            <i data-lucide="book-open" class="w-5 h-5"></i>
                            عرض السور والآيات
                        </h3>
                        <button onclick="document.getElementById('quran-ayah-viewer').remove()" class="text-gray-400 hover:text-gray-600 bg-gray-50 dark:bg-gray-700 p-2 rounded-full transition">
                            <i data-lucide="x" class="w-5 h-5"></i>
                        </button>
                    </div>
                    <div class="p-6 overflow-y-auto space-y-6">
                        ${ayahsHtml}
                    </div>
                </div>
            `;
            lucide.createIcons();
        };
    }

    html += `</div>`;

    let modal = document.getElementById('day-scores-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'day-scores-modal';
        document.body.appendChild(modal);
    }
    modal.className = 'fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in';
    modal.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-sm p-6 shadow-2xl max-h-[85vh] overflow-y-auto">
            <div class="flex justify-between items-center mb-4 border-b border-gray-100 dark:border-gray-700 pb-3">
                <h3 class="font-bold text-lg text-blue-700 dark:text-blue-400">📅 تفاصيل يوم ${dateStr}</h3>
                <button onclick="document.getElementById('day-scores-modal').remove()" class="text-gray-400 hover:text-gray-600 bg-gray-50 dark:bg-gray-700 rounded-full p-2">
                    <i data-lucide="x" class="w-4 h-4"></i>
                </button>
            </div>
            ${html}
        </div>
    `;
    lucide.createIcons();
};

function contactTeacher(studentName, teacherPhone) {
    let messageText = "";
    
    if (state.isParent) {
        messageText = `السلام عليكم ورحمة الله وبركاته.. أنا ولي أمر الطالب (${studentName})\nكنت أريد أن أستفسر منك عن بعض الأمور`;
    } else {
        messageText = `السلام عليكم ورحمة الله وبركاته`;
    }

    const message = encodeURIComponent(messageText);
    window.open(`https://wa.me/${teacherPhone}?text=${message}`, '_blank');
}

function openTeacherSelectionModal() {
    const teachers = window._teachersForContact || [];
    const studentName = window._currentStudentName || '';

    if (teachers.length === 0) {
        showToast("لا يوجد معلمون مسجلون", "error");
        return;
    }

    // Create modal
    let modal = document.getElementById('teacher-selection-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'teacher-selection-modal';
        document.body.appendChild(modal);
    }

    modal.className = 'fixed inset-0 bg-black/50 z-[150] flex items-center justify-center p-4 backdrop-blur-sm';
    modal.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl">
            <div class="flex justify-between items-center mb-4">
                <h3 class="font-bold text-lg">اختر المعلم للتواصل</h3>
                <button onclick="document.getElementById('teacher-selection-modal').remove()" class="text-gray-400 hover:text-gray-600">
                    <i data-lucide="x" class="w-5 h-5"></i>
                </button>
            </div>
            <div class="space-y-3">
                ${teachers.map(t => `
                <button onclick="contactTeacher('${studentName}', '${t.phone}'); document.getElementById('teacher-selection-modal').remove();" 
                    class="w-full flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-xl hover:bg-green-50 dark:hover:bg-green-900/30 border hover:border-green-400 transition">
                    <div class="w-10 h-10 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center text-lg">👨‍🏫</div>
                    <div class="flex-1 text-right">
                        <p class="font-bold text-sm">${t.name}</p>
                        <p class="text-xs text-gray-500" dir="ltr">${t.phone}</p>
                    </div>
                    <i data-lucide="message-circle" class="w-5 h-5 text-green-600"></i>
                </button>
                `).join('')}
            </div>
        </div>
    `;

    lucide.createIcons();
}

// Show absence dates modal for parent view
function showAbsenceDates(type) {
    const records = type === 'excuse' ? window._absenceRecordsWithExcuse : window._absenceRecordsNoExcuse;
    const title = type === 'excuse' ? 'أيام الغياب بعذر' : 'أيام الغياب بدون عذر';
    const emoji = type === 'excuse' ? '✅' : '❌';

    // Use pre-built Tailwind classes instead of dynamic interpolation
    const bgCard = type === 'excuse' ? 'bg-teal-50 dark:bg-teal-900/20 border-teal-100 dark:border-teal-800' : 'bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-800';
    const bgBadge = type === 'excuse' ? 'bg-teal-100 dark:bg-teal-900 text-teal-600 dark:text-teal-400' : 'bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-400';
    const textColor = type === 'excuse' ? 'text-teal-600 dark:text-teal-400' : 'text-red-600 dark:text-red-400';

    if (!records || records.length === 0) {
        showToast("لا يوجد أيام غياب مسجلة", "error");
        return;
    }

    // Create or reuse modal
    let modal = document.getElementById('absence-dates-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'absence-dates-modal';
        modal.dataset.dynamic = 'true';
        document.body.appendChild(modal);
    }

    modal.className = 'fixed inset-0 bg-black/50 z-[150] flex items-center justify-center p-4 backdrop-blur-sm';
    modal.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm shadow-2xl max-h-[70vh] flex flex-col">
            <!-- Header -->
            <div class="p-4 border-b flex justify-between items-center shrink-0">
                <h3 class="font-bold text-lg flex items-center gap-2">
                    <span class="text-xl">${emoji}</span>
                    ${title}
                </h3>
                <button onclick="document.getElementById('absence-dates-modal').remove()" class="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100">
                    <i data-lucide="x" class="w-5 h-5"></i>
                </button>
            </div>
            
            <!-- Body -->
            <div class="p-4 flex-1 overflow-y-auto">
                <p class="text-sm text-gray-500 mb-3">إجمالي: ${records.length} يوم</p>
                <div class="space-y-2">
                    ${records.map((r, i) => `
                    <div class="flex items-center justify-between p-3 ${bgCard} rounded-xl border">
                        <div class="flex items-center gap-3">
                            <div class="w-8 h-8 ${bgBadge} rounded-lg flex items-center justify-center font-bold text-sm">${i + 1}</div>
                            <div>
                                <p class="font-bold text-gray-800 dark:text-gray-100">${r.date}</p>
                            </div>
                        </div>
                        <span class="${textColor} font-bold">${r.points} نقطة</span>
                    </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
    lucide.createIcons();
}

// Reset Competition Logic
let compToResetId = null;
function resetCompetition(id) {
    compToResetId = id;
    toggleModal('reset-competition-modal', true);
    document.getElementById('confirm-reset-comp-btn').onclick = performResetCompetition;
}

async function performResetCompetition() {
    if (!compToResetId) return;
    showToast("جاري تصفير الدرجات...");

    try {
        const q = window.firebaseOps.query(
            window.firebaseOps.collection(window.db, "scores"),
            window.firebaseOps.where("competitionId", "==", compToResetId)
        );

        const snap = await window.firebaseOps.getDocs(q);
        const batch = window.firebaseOps.writeBatch(window.db);

        snap.forEach(doc => {
            batch.delete(doc.ref);
        });

        await batch.commit();

        showToast("تم تصفير المسابقة بنجاح");
        closeModal('reset-competition-modal');
        // Refresh home list
        renderHome();
    } catch (e) {
        console.error("Error resetting competition:", e);
        showToast("خطأ في تصفير المسابقة", "error");
    }
}

async function deleteGroup(groupId) {
    toggleModal('delete-modal', true);

    document.getElementById('confirm-delete-btn').onclick = async () => {
        try {
            await window.firebaseOps.deleteDoc(window.firebaseOps.doc(window.db, "groups", groupId));
            showToast("تم حذف المجموعة بنجاح");
            closeModal('delete-modal');
            // Reload groups list
            if (typeof fetchGroupsForCompetition === 'function' && typeof currentManageCompId !== 'undefined') {
                fetchGroupsForCompetition(currentManageCompId);
            }
        } catch (e) {
            console.error("Error deleting group:", e);
            showToast("خطأ في حذف المجموعة", "error");
        }
    };
}

// =====================================================
// FEATURE #7: Student Search/Filter
// =====================================================
function filterStudents(query) {
    if (!query || query.trim() === '') {
        updateStudentsListUI();
        return;
    }
    const q = query.trim().toLowerCase();
    const filtered = state.students.filter(s => {
        const nameMatch = s.name && s.name.toLowerCase().includes(q);
        const numMatch = s.studentNumber && s.studentNumber.includes(q);
        return nameMatch || numMatch;
    });
    updateStudentsListUI(filtered);
}

// Override updateStudentsListUI to accept optional filtered list
const _originalUpdateStudentsListUI = updateStudentsListUI;
updateStudentsListUI = function (filteredList) {
    const list = $('#students-list');
    if (!list) return;

    const students = filteredList || state.students;

    if (students.length === 0 && filteredList) {
        list.innerHTML = `
            <div class="flex flex-col items-center justify-center py-12 text-gray-400">
                <i data-lucide="search-x" class="w-12 h-12 mb-3 opacity-20"></i>
                <p class="text-sm font-medium">لا توجد نتائج</p>
            </div>
        `;
        lucide.createIcons();
        return;
    }

    if (students.length === 0) {
        list.innerHTML = `
            <div class="flex flex-col items-center justify-center py-12 text-gray-400">
                <i data-lucide="users" class="w-12 h-12 mb-3 opacity-20"></i>
                <p class="text-sm font-medium">لا يوجد طلاب حتى الآن</p>
                ${state.isTeacher ? '<p class="text-xs mt-1">اضغط على "جديد" لإضافة طلاب</p>' : ''}
            </div>
        `;
        lucide.createIcons();
        return;
    }

    list.innerHTML = students.map(student => {
        const isImg = student.icon && student.icon.startsWith('data:image');
        const iconHtml = isImg
            ? `<img src="${student.icon}" class="w-full h-full object-cover">`
            : (student.icon || '👤');

        return `
        <div class="p-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition group border-b border-gray-100 dark:border-gray-700 last:border-0">
            <div onclick="openStudentReport('${student.id}')" class="w-12 h-12 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center text-xl shadow-sm border border-gray-200 dark:border-gray-600 overflow-hidden cursor-pointer shrink-0">
                ${iconHtml}
            </div>
            <div class="flex-1 min-w-0" onclick="openStudentReport('${student.id}')" style="cursor:pointer">
                <h4 class="font-bold text-gray-800 dark:text-gray-100 truncate">${student.name}</h4>
                <div class="flex flex-wrap gap-1 text-xs text-gray-500 mt-0.5">
                    ${(state.isTeacher && student.studentNumber) ? `<span class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-[10px] text-gray-500 tracking-wider">${student.studentNumber}</span>` : ''}
                    ${student.password ? '<span class="text-green-500">🔐</span>' : '<span class="text-orange-400">⚠️ بدون كلمة مرور</span>'}
                </div>
            </div>
            <div class="flex gap-1 shrink-0">
                <button onclick="event.stopPropagation(); openEditStudent('${student.id}')" class="p-2 text-gray-400 hover:text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-900/20 rounded-lg transition" title="تعديل">
                    <i data-lucide="edit-2" class="w-4 h-4"></i>
                </button>
                ${state.isTeacher ? `
                <button onclick="event.stopPropagation(); confirmDeleteStudent('${student.id}')" class="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition" title="حذف">
                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>
                ` : ''}
            </div>
        </div>
    `}).join('');
    lucide.createIcons();
};

// =====================================================
// FEATURE #1: Export Data (CSV)
// =====================================================

function downloadCSV(filename, csvContent) {
    // Add BOM for Arabic support in Excel
    const bom = '\uFEFF';
    const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
}

async function exportStudentsCSV() {
    showToast("جاري تجهيز ملف الطلاب...");
    try {
        const q = window.firebaseOps.query(
            window.firebaseOps.collection(window.db, "students"),
            window.firebaseOps.where("level", "==", state.currentLevel)
        );
        const snap = await window.firebaseOps.getDocs(q);
        const students = [];
        snap.forEach(doc => {
            const d = doc.data();
            d.id = doc.id;
            students.push(d);
        });

        if (students.length === 0) {
            showToast("لا يوجد طلاب للتصدير", "error");
            return;
        }

        const levelName = LEVELS[state.currentLevel] ? LEVELS[state.currentLevel].name : state.currentLevel;
        let csv = 'الاسم,رقم الجوال,المرحلة,خطة الحفظ,خطة المراجعة,تاريخ الإضافة\n';

        students.forEach(s => {
            const createdDate = s.createdAt ? new Date(s.createdAt).toLocaleDateString('ar-SA') : '';
            csv += `"${s.name || ''}","${s.studentNumber || ''}","${levelName}","${s.memorizationPlan || ''}","${s.reviewPlan || ''}","${createdDate}"\n`;
        });

        const date = new Date().toISOString().split('T')[0];
        downloadCSV(`students_${state.currentLevel}_${date}.csv`, csv);
        showToast(`تم تصدير ${students.length} طالب`);
    } catch (e) {
        console.error(e);
        showToast("خطأ في التصدير", "error");
    }
}

async function exportScoresCSV() {
    showToast("جاري تجهيز ملف الدرجات...");
    try {
        // Fetch scores filtered by level through students
        const studentsQ = window.firebaseOps.query(
            window.firebaseOps.collection(window.db, "students"),
            window.firebaseOps.where("level", "==", state.currentLevel)
        );
        const studentsSnap = await window.firebaseOps.getDocs(studentsQ);
        const studentMap = {};
        studentsSnap.forEach(doc => {
            const d = doc.data();
            studentMap[doc.id] = d.name || 'غير معروف';
        });

        const studentIds = Object.keys(studentMap);
        if (studentIds.length === 0) {
            showToast("لا يوجد طلاب", "error");
            return;
        }

        // Fetch all scores (we'll filter client-side)
        const scoresQ = window.firebaseOps.query(
            window.firebaseOps.collection(window.db, "scores")
        );
        const scoresSnap = await window.firebaseOps.getDocs(scoresQ);
        const scores = [];
        scoresSnap.forEach(doc => {
            const d = doc.data();
            if (studentIds.includes(d.studentId)) {
                scores.push(d);
            }
        });

        if (scores.length === 0) {
            showToast("لا يوجد درجات للتصدير", "error");
            return;
        }

        const levelName = LEVELS[state.currentLevel] ? LEVELS[state.currentLevel].name : state.currentLevel;
        let csv = 'اسم الطالب,المعيار,النقاط,النوع,التاريخ\n';

        scores.forEach(s => {
            const studentName = studentMap[s.studentId] || 'غير معروف';
            csv += `"${studentName}","${s.criteriaName || ''}","${s.points || 0}","${s.type || ''}","${s.date || ''}"\n`;
        });

        const date = new Date().toISOString().split('T')[0];
        downloadCSV(`scores_${state.currentLevel}_${date}.csv`, csv);
        showToast(`تم تصدير ${scores.length} درجة`);
    } catch (e) {
        console.error(e);
        showToast("خطأ في التصدير", "error");
    }
}

// Audit log removed by user request

// =====================================================
// FEATURE #5: Statistics with Canvas Charts
// =====================================================

async function openStatsModal() {
    let modal = document.getElementById('stats-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'stats-modal';
        modal.dataset.dynamic = 'true';
        document.body.appendChild(modal);
    }

    modal.className = 'fixed inset-0 bg-black/50 z-[150] flex items-center justify-center p-4 backdrop-blur-sm';
    modal.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-lg shadow-2xl max-h-[85vh] flex flex-col">
            <div class="p-4 border-b flex justify-between items-center shrink-0">
                <h3 class="font-bold text-lg flex items-center gap-2">
                    <i data-lucide="bar-chart-3" class="w-5 h-5 text-amber-600"></i>
                    إحصائيات المرحلة
                </h3>
                <button onclick="document.getElementById('stats-modal').remove()" class="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100">
                    <i data-lucide="x" class="w-5 h-5"></i>
                </button>
            </div>
            <div id="stats-content" class="p-4 flex-1 overflow-y-auto">
                <div class="text-center py-8"><i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto"></i></div>
            </div>
        </div>
    `;
    lucide.createIcons();

    try {
        // Fetch students
        const studentsQ = window.firebaseOps.query(
            window.firebaseOps.collection(window.db, "students"),
            window.firebaseOps.where("level", "==", state.currentLevel)
        );
        const studentsSnap = await window.firebaseOps.getDocs(studentsQ);
        const students = [];
        studentsSnap.forEach(doc => { const d = doc.data(); d.id = doc.id; students.push(d); });

        // Fetch scores
        const scoresQ = window.firebaseOps.query(window.firebaseOps.collection(window.db, "scores"));
        const scoresSnap = await window.firebaseOps.getDocs(scoresQ);
        const allScores = [];
        scoresSnap.forEach(doc => { allScores.push(doc.data()); });

        const studentIds = students.map(s => s.id);
        const scores = allScores.filter(s => studentIds.includes(s.studentId));

        // Calculate stats
        const totalStudents = students.length;
        const totalScoreRecords = scores.length;
        const totalPoints = scores.reduce((sum, s) => sum + (s.points || 0), 0);
        const absences = scores.filter(s => s.criteriaId === 'ABSENCE_RECORD').length;

        // Student totals for chart
        const studentTotals = {};
        scores.forEach(s => {
            studentTotals[s.studentId] = (studentTotals[s.studentId] || 0) + (s.points || 0);
        });

        // Top 10 students
        const ranked = students.map(s => ({ name: s.name, total: studentTotals[s.id] || 0 }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 10);

        // Daily activity (last 14 days)
        const dailyData = {};
        const today = new Date();
        for (let i = 13; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            const key = d.toISOString().split('T')[0];
            dailyData[key] = 0;
        }
        scores.forEach(s => {
            if (s.date && dailyData.hasOwnProperty(s.date) && s.points > 0) {
                dailyData[s.date] += s.points;
            }
        });

        const levelName = LEVELS[state.currentLevel] ? LEVELS[state.currentLevel].name : '';
        const container = document.getElementById('stats-content');

        container.innerHTML = `
            <!-- Summary Cards -->
            <div class="grid grid-cols-2 gap-3 mb-6">
                <div class="bg-teal-50 dark:bg-teal-900/20 rounded-xl p-3 text-center border border-teal-100 dark:border-teal-800">
                    <p class="text-2xl font-bold text-teal-600">${totalStudents}</p>
                    <p class="text-xs text-teal-700 dark:text-teal-400">طالب</p>
                </div>
                <div class="bg-green-50 dark:bg-green-900/20 rounded-xl p-3 text-center border border-green-100 dark:border-green-800">
                    <p class="text-2xl font-bold text-green-600">${totalPoints}</p>
                    <p class="text-xs text-green-700 dark:text-green-400">إجمالي النقاط</p>
                </div>
                <div class="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 text-center border border-blue-100 dark:border-blue-800">
                    <p class="text-2xl font-bold text-blue-600">${totalScoreRecords}</p>
                    <p class="text-xs text-blue-700 dark:text-blue-400">تقييم مسجل</p>
                </div>
                <div class="bg-orange-50 dark:bg-orange-900/20 rounded-xl p-3 text-center border border-orange-100 dark:border-orange-800">
                    <p class="text-2xl font-bold text-orange-600">${absences}</p>
                    <p class="text-xs text-orange-700 dark:text-orange-400">حالة غياب</p>
                </div>
            </div>

            <!-- Top Students Chart -->
            <div class="bg-white dark:bg-gray-700/50 rounded-xl p-4 border mb-4">
                <h4 class="font-bold text-sm mb-3 flex items-center gap-2">
                    <span>🏆</span> أعلى 10 طلاب نقاطاً
                </h4>
                <canvas id="students-chart" width="400" height="250"></canvas>
            </div>

            <!-- Daily Activity Chart -->
            <div class="bg-white dark:bg-gray-700/50 rounded-xl p-4 border">
                <h4 class="font-bold text-sm mb-3 flex items-center gap-2">
                    <span>📈</span> النشاط اليومي (آخر 14 يوم)
                </h4>
                <canvas id="daily-chart" width="400" height="200"></canvas>
            </div>
        `;

        // Draw Charts
        setTimeout(() => {
            drawBarChart('students-chart', ranked.map(s => s.name), ranked.map(s => s.total), '#0d9488');
            drawBarChart('daily-chart', Object.keys(dailyData).map(d => d.slice(5)), Object.values(dailyData), '#f59e0b');
        }, 100);

    } catch (e) {
        console.error(e);
        document.getElementById('stats-content').innerHTML = '<p class="text-center text-red-500 py-8">خطأ في تحميل الإحصائيات</p>';
    }
}

function drawBarChart(canvasId, labels, values, color) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const padding = { top: 10, right: 10, bottom: 40, left: 40 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;

    const maxVal = Math.max(...values, 1);
    const barWidth = chartW / labels.length * 0.7;
    const gap = chartW / labels.length * 0.3;

    const isDark = document.documentElement.classList.contains('dark');
    const textColor = isDark ? '#9ca3af' : '#6b7280';
    const gridColor = isDark ? '#374151' : '#e5e7eb';

    // Clear
    ctx.clearRect(0, 0, w, h);

    // Grid lines
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
        const y = padding.top + chartH - (chartH / 4) * i;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(w - padding.right, y);
        ctx.stroke();

        // Y-axis label
        ctx.fillStyle = textColor;
        ctx.font = '10px Tajawal, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(Math.round(maxVal / 4 * i), padding.left - 5, y + 3);
    }

    // Bars
    labels.forEach((label, i) => {
        const x = padding.left + i * (barWidth + gap) + gap / 2;
        const barH = (values[i] / maxVal) * chartH;
        const y = padding.top + chartH - barH;

        // Bar gradient
        const gradient = ctx.createLinearGradient(x, y, x, y + barH);
        gradient.addColorStop(0, color);
        gradient.addColorStop(1, color + '99');
        ctx.fillStyle = gradient;

        // Rounded top corners
        const radius = Math.min(4, barWidth / 2);
        ctx.beginPath();
        ctx.moveTo(x, y + barH);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.lineTo(x + barWidth - radius, y);
        ctx.quadraticCurveTo(x + barWidth, y, x + barWidth, y + radius);
        ctx.lineTo(x + barWidth, y + barH);
        ctx.fill();

        // Value on top
        ctx.fillStyle = textColor;
        ctx.font = 'bold 10px Tajawal, sans-serif';
        ctx.textAlign = 'center';
        if (values[i] > 0) {
            ctx.fillText(values[i], x + barWidth / 2, y - 4);
        }

        // X-axis label
        ctx.fillStyle = textColor;
        ctx.font = '9px Tajawal, sans-serif';
        ctx.textAlign = 'center';
        // Truncate label
        const maxLabelLen = Math.max(3, Math.floor(barWidth / 6));
        const truncated = label.length > maxLabelLen ? label.substring(0, maxLabelLen) + '..' : label;
        ctx.fillText(truncated, x + barWidth / 2, h - padding.bottom + 15);
    });
}

// =====================================================
// FEATURE #9: Offline Mode (IndexedDB Cache)
// =====================================================

const OfflineCache = {
    DB_NAME: 'ibnTaymiyyahCache',
    DB_VERSION: 1,
    STORE_NAME: 'dataCache',

    async openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(this.STORE_NAME)) {
                    db.createObjectStore(this.STORE_NAME, { keyPath: 'key' });
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async save(key, data) {
        try {
            const db = await this.openDB();
            const tx = db.transaction(this.STORE_NAME, 'readwrite');
            const store = tx.objectStore(this.STORE_NAME);
            store.put({ key, data, timestamp: Date.now() });
            return new Promise((resolve, reject) => {
                tx.oncomplete = resolve;
                tx.onerror = reject;
            });
        } catch (e) {
            console.warn('OfflineCache save error:', e);
        }
    },

    async load(key, maxAgeMs = 1000 * 60 * 60) {
        // maxAgeMs: default 1 hour
        try {
            const db = await this.openDB();
            const tx = db.transaction(this.STORE_NAME, 'readonly');
            const store = tx.objectStore(this.STORE_NAME);
            const request = store.get(key);
            return new Promise((resolve) => {
                request.onsuccess = () => {
                    const result = request.result;
                    if (result && (Date.now() - result.timestamp) < maxAgeMs) {
                        resolve(result.data);
                    } else {
                        resolve(null);
                    }
                };
                request.onerror = () => resolve(null);
            });
        } catch (e) {
            console.warn('OfflineCache load error:', e);
            return null;
        }
    },

    async clear() {
        try {
            const db = await this.openDB();
            const tx = db.transaction(this.STORE_NAME, 'readwrite');
            tx.objectStore(this.STORE_NAME).clear();
        } catch (e) {
            console.warn('OfflineCache clear error:', e);
        }
    }
};

// Cache data after successful fetches
(function enableOfflineCache() {
    const origGetDocs = window.firebaseOps.getDocs;

    window.firebaseOps.getDocs = async function (queryOrCollection) {
        const tableName = queryOrCollection._table;
        const cacheKey = `getDocs_${tableName}_${JSON.stringify(queryOrCollection._constraints || [])}`;

        try {
            const result = await origGetDocs.call(this, queryOrCollection);
            // Cache the raw data for offline use
            const rawDocs = [];
            result.forEach(doc => { rawDocs.push({ id: doc.id, data: doc.data() }); });
            OfflineCache.save(cacheKey, rawDocs);
            return result;
        } catch (e) {
            // Offline - try to load from cache
            console.warn('getDocs failed, trying offline cache:', e.message);
            const cached = await OfflineCache.load(cacheKey, 1000 * 60 * 60 * 24); // 24 hour cache for offline
            if (cached) {
                showToast("وضع عدم الاتصال - بيانات مخزنة مؤقتاً", "info");
                const docs = cached.map(item => ({
                    id: item.id,
                    data: () => item.data,
                    ref: { _table: tableName, _id: item.id, _type: 'doc' }
                }));
                return {
                    empty: docs.length === 0,
                    docs: docs,
                    forEach: (cb) => docs.forEach(cb),
                    size: docs.length
                };
            }
            throw e; // No cache available, rethrow
        }
    };
})();

// =====================================================
// FEATURE #10: Custom Ad-hoc Points
// =====================================================
let isGroupCustomPoints = false;
function openCustomPointsModal(isGroup = false) {
    isGroupCustomPoints = isGroup;
    closeModal('rate-student-modal');

    let modal = document.getElementById('custom-points-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'custom-points-modal';
        modal.dataset.dynamic = 'true';
        document.body.appendChild(modal);
    }

    const titleText = isGroup ? "نقاط مخصصة للمجموعة بأكملها" : "نقاط مخصصة للطالب";

    modal.className = 'fixed inset-0 bg-black/50 z-[200] hidden flex items-center justify-center p-4 backdrop-blur-sm';
    modal.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl flex flex-col">
            <div class="flex justify-between items-center mb-6 border-b pb-4 border-gray-100 dark:border-gray-700">
                <h3 class="font-bold text-lg flex items-center gap-2">
                    <i data-lucide="sparkles" class="w-5 h-5 text-teal-600"></i>
                    ${titleText}
                </h3>
                <button onclick="closeModal('custom-points-modal')" class="text-gray-400 hover:text-gray-600 p-1 bg-gray-50 dark:bg-gray-700 rounded-full"><i data-lucide="x" class="w-4 h-4"></i></button>
            </div>
            
            <form onsubmit="submitCustomPoints(event)" class="space-y-4">
                <div>
                    <label class="block text-sm font-bold mb-2">سبب التقييم</label>
                    <input type="text" id="custom-points-reason" required placeholder="مثال: مشاركة متميزة، سلوك سيء..." 
                        class="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 focus:outline-none focus:border-teal-500">
                </div>
                
                <div>
                    <label class="block text-sm font-bold mb-2">عدد النقاط</label>
                    <input type="number" id="custom-points-value" required placeholder="10" 
                        class="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-center text-2xl font-bold focus:outline-none focus:border-teal-500" dir="ltr">
                    <p class="text-xs text-gray-500 mt-2 text-center">أدخل رقماً موجباً للزيادة (5) أو سالباً للخصم (-3)</p>
                </div>

                <div class="flex gap-3 pt-4">
                    <button type="button" onclick="closeModal('custom-points-modal')" class="flex-1 py-3 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 font-medium transition">إلغاء</button>
                    <button type="submit" class="flex-1 py-3 bg-teal-600 text-white rounded-xl font-bold hover:bg-teal-700 shadow-lg transition">تأكيد الرصد</button>
                </div>
            </form>
        </div>
    `;
    lucide.createIcons();
    toggleModal('custom-points-modal', true);
}

async function submitCustomPoints(e) {
    e.preventDefault();
    const reasonStr = document.getElementById('custom-points-reason').value;
    const pointsStr = document.getElementById('custom-points-value').value;
    const points = parseInt(pointsStr);
    
    if(!reasonStr || isNaN(points)) {
        showToast("الرجاء التحقق من البيانات المطلوبة", "error");
        return;
    }

    const studentId = currentRateStudentId; 
    const compId = currentGradingCompId;
    const dateVal = document.getElementById('grading-date') ? document.getElementById('grading-date').value : new Date().toISOString().split('T')[0];

    if(!isGroupCustomPoints && !studentId) {
        showToast("خطأ: لم يتم تحديد الطالب", "error");
        return;
    }
    if(isGroupCustomPoints && !currentGradingGroupId) {
        showToast("خطأ: لم يتم تحديد المجموعة", "error");
        return;
    }

    const btn = e.submitter;
    const prevText = btn.innerHTML;
    btn.innerHTML = '<i data-lucide="loader-2" class="w-5 h-5 animate-spin mx-auto"></i>';
    btn.disabled = true;
    lucide.createIcons();

    try {
        const batch = window.firebaseOps.writeBatch(window.db);
        const criteriaIdStr = 'CUSTOM_' + Date.now().toString();

        let targetStudentIds = [];
        if (isGroupCustomPoints) {
            const group = state.groups.find(g => g.id === currentGradingGroupId);
            if(group && group.members) targetStudentIds = group.members;
        } else {
            targetStudentIds = [studentId];
        }

        if(targetStudentIds.length === 0) {
            showToast("لا يوجد طلاب لرصد الدرجة لهم", "error");
            btn.innerHTML = prevText;
            btn.disabled = false;
            return;
        }

        targetStudentIds.forEach(sid => {
            const scoreData = {
                studentId: sid,
                competitionId: compId,
                groupId: currentGradingGroupId || '',
                criteriaId: criteriaIdStr,
                criteriaName: 'تقييم مخصص: ' + reasonStr,
                points: points,
                type: points > 0 ? 'custom_positive' : 'custom_negative',
                level: state.currentLevel,
                date: dateVal,
                updatedAt: new Date(),
                timestamp: Date.now(),
                createdAt: new Date()
            };
            batch.set(window.firebaseOps.doc(window.db, "scores", "temp_" + sid + "_" + Date.now().toString()), scoreData);
        });

        await batch.commit();
        showToast(`تم رصد ${points > 0 ? '+' : ''}${points} للمجموعة/الطالب بنجاح`, points > 0 ? "success" : "error");
        
        closeModal('custom-points-modal');
    } catch(err) {
        console.error("Custom points error:", err);
        showToast("حدث خطأ أثناء الرصد", "error");
    } finally {
        btn.innerHTML = prevText;
        btn.disabled = false;
    }
}

// =====================================================
// FEATURE #11: Group-Level Points (group_scores)
// لا يتأثر أي طالب - النقاط تُضاف لاسم المجموعة فقط
// =====================================================
function openGroupPointsModal() {
    const groupId = currentGradingGroupId;
    const group = state.groups.find(g => g.id === groupId);
    if (!group) {
        showToast("لم يتم تحديد المجموعة", "error");
        return;
    }

    let modal = document.getElementById('group-points-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'group-points-modal';
        modal.dataset.dynamic = 'true';
        document.body.appendChild(modal);
    }

    modal.className = 'fixed inset-0 bg-black/50 z-[200] hidden flex items-center justify-center p-4 backdrop-blur-sm';
    modal.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl flex flex-col">
            <div class="flex justify-between items-center mb-6 border-b pb-4 border-gray-100 dark:border-gray-700">
                <div>
                    <h3 class="font-bold text-lg flex items-center gap-2">
                        <i data-lucide="shield" class="w-5 h-5 text-amber-600"></i>
                        نقاط المجموعة
                    </h3>
                    <p class="text-xs text-gray-500 mt-1">لا تُوزَّع على الطلاب — تُضاف للمجموعة فقط</p>
                </div>
                <button onclick="closeModal('group-points-modal')" class="text-gray-400 hover:text-gray-600 p-1 bg-gray-50 dark:bg-gray-700 rounded-full">
                    <i data-lucide="x" class="w-4 h-4"></i>
                </button>
            </div>

            <div class="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-3 mb-4 flex items-center gap-3 border border-amber-200 dark:border-amber-800">
                <div class="w-12 h-12 rounded-xl overflow-hidden flex items-center justify-center bg-amber-100 dark:bg-amber-900/40 text-2xl shrink-0">
                    ${isImgSrc(group.icon) ? `<img src="${group.icon}" class="w-full h-full object-cover">` : (group.icon || '🛡️')}
                </div>
                <div>
                    <p class="font-bold text-amber-800 dark:text-amber-300">${group.name}</p>
                    <p class="text-xs text-amber-600 dark:text-amber-400">النقاط ستُسجَّل لهذه المجموعة</p>
                </div>
            </div>


            <form onsubmit="submitGroupPoints(event)" class="space-y-4">
                <div>
                    <label class="block text-sm font-bold mb-2">سبب المنح / الخصم</label>
                    <input type="text" id="group-points-reason" required
                        placeholder="مثال: فوز في مسابقة، عقوبة جماعية..."
                        class="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 focus:outline-none focus:border-amber-500">
                </div>

                <div>
                    <label class="block text-sm font-bold mb-2">عدد النقاط</label>
                    <input type="number" id="group-points-value" required placeholder="10"
                        class="w-full bg-gray-50 dark:bg-gray-900 border border-amber-200 dark:border-amber-700 rounded-xl px-4 py-3 text-center text-2xl font-bold focus:outline-none focus:border-amber-500" dir="ltr">
                    <p class="text-xs text-gray-500 mt-2 text-center">موجب للإضافة (+10) أو سالب للخصم (-5)</p>
                </div>

                <div class="flex gap-3 pt-4">
                    <button type="button" onclick="closeModal('group-points-modal')" class="flex-1 py-3 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 font-medium transition">إلغاء</button>
                    <button type="submit" class="flex-1 py-3 bg-amber-500 text-white rounded-xl font-bold hover:bg-amber-600 shadow-lg transition">تأكيد</button>
                </div>
            </form>
        </div>
    `;
    lucide.createIcons();
    toggleModal('group-points-modal', true);
}

async function submitGroupPoints(e) {
    e.preventDefault();
    const reason = document.getElementById('group-points-reason').value.trim();
    const points = parseInt(document.getElementById('group-points-value').value);
    const groupId = currentGradingGroupId;
    const compId = currentGradingCompId;
    const dateVal = document.getElementById('grading-date') ? document.getElementById('grading-date').value : new Date().toISOString().split('T')[0];

    if (!reason || isNaN(points)) {
        showToast("يرجى إدخال السبب والنقاط", "error");
        return;
    }
    if (!groupId || !compId) {
        showToast("خطأ: لم يتم تحديد المجموعة أو المسابقة", "error");
        return;
    }

    const btn = e.submitter;
    const prevText = btn.innerHTML;
    btn.innerHTML = '<i data-lucide="loader-2" class="w-5 h-5 animate-spin mx-auto"></i>';
    btn.disabled = true;
    lucide.createIcons();

    try {
        await window.firebaseOps.addDoc(
            window.firebaseOps.collection(window.db, "group_scores"),
            {
                groupId: groupId,
                competitionId: compId,
                reason: reason,
                points: points,
                type: points > 0 ? 'group_bonus' : 'group_penalty',
                level: state.currentLevel,
                date: dateVal,
                createdAt: new Date(),
                timestamp: Date.now()
            }
        );

        const group = state.groups.find(g => g.id === groupId);
        const groupName = group ? group.name : 'المجموعة';
        showToast(`تم رصد ${points > 0 ? '+' : ''}${points} نقطة لـ "${groupName}" بنجاح`, points > 0 ? "success" : "error");
        closeModal('group-points-modal');
    } catch(err) {
        console.error("Group points error:", err);
        showToast("حدث خطأ أثناء الحفظ", "error");
    } finally {
        btn.innerHTML = prevText;
        btn.disabled = false;
    }
}

// =====================================================
// FEATURE: Bulk WhatsApp Queue Generator
// =====================================================
let bulkWhatsAppQueue = [];
let bulkWhatsAppCurrentIndex = 0;

function openBulkWhatsAppModal() {
    let modal = document.getElementById('bulk-wa-start-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'bulk-wa-start-modal';
        modal.dataset.dynamic = 'true';
        document.body.appendChild(modal);
    }
    modal.className = 'fixed inset-0 bg-black/50 z-[150] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in';
    const today = new Date();
    const lastWeek = new Date();
    lastWeek.setDate(today.getDate() - 7);
    const endStr = today.toISOString().split('T')[0];
    const startStr = lastWeek.toISOString().split('T')[0];
    
    modal.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl flex flex-col">
            <div class="flex justify-between items-center mb-6 border-b pb-4 border-gray-100 dark:border-gray-700">
                <h3 class="font-bold text-lg flex items-center gap-2 text-emerald-600">
                    <i data-lucide="message-circle" class="w-5 h-5"></i>إعداد المراسلة المجمعة
                </h3>
                <button onclick="closeModal('bulk-wa-start-modal')" class="text-gray-400 hover:text-gray-600 p-1 bg-gray-50 dark:bg-gray-700 rounded-full"><i data-lucide="x" class="w-4 h-4"></i></button>
            </div>
            <div class="space-y-4">
                <div>
                    <label class="block text-sm font-bold mb-2">المسابقة المستهدفة</label>
                    <select id="wa-comp-select" class="w-full bg-gray-50 dark:bg-gray-700 border rounded-xl px-4 py-3">
                        ${state.competitions.filter(c => !c.level || c.level === state.currentLevel).map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
                    </select>
                </div>
                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="block text-sm font-bold mb-2">من تاريخ</label>
                        <input type="date" id="wa-start-date" value="${startStr}" class="w-full bg-gray-50 dark:bg-gray-700 border rounded-xl px-3 py-3 text-sm">
                    </div>
                    <div>
                        <label class="block text-sm font-bold mb-2">إلى تاريخ</label>
                        <input type="date" id="wa-end-date" value="${endStr}" class="w-full bg-gray-50 dark:bg-gray-700 border rounded-xl px-3 py-3 text-sm">
                    </div>
                </div>
                <div class="flex gap-3 pt-4">
                    <button type="button" onclick="closeModal('bulk-wa-start-modal')" class="flex-1 py-3 rounded-xl bg-gray-100 dark:bg-gray-700 transition">إلغاء</button>
                    <button onclick="buildWhatsAppQueue(this)" class="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-bold shadow-lg flex justify-center items-center gap-2"><i data-lucide="list-checks" class="w-5 h-5"></i> تجهيز القائمة</button>
                </div>
            </div>
        </div>
    `;
    lucide.createIcons();
    toggleModal('bulk-wa-start-modal', true);
}

async function buildWhatsAppQueue(btn) {
    const compId = $('#wa-comp-select').value;
    const startDate = $('#wa-start-date').value;
    const endDate = $('#wa-end-date').value;
    const compName = $('#wa-comp-select').options[$('#wa-comp-select').selectedIndex].text;
    if (!compId || !startDate || !endDate) return showToast('يرجى تعبئة الحقول', 'error');

    const prevHTML = btn.innerHTML;
    btn.innerHTML = '<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i> جلب...';
    btn.disabled = true;
    lucide.createIcons();

    try {
        const groups = state.groups.filter(g => g.competitionId === compId);
        const sSnap = await window.firebaseOps.getDocs(window.firebaseOps.query(window.firebaseOps.collection(window.db, "scores"), window.firebaseOps.where("competitionId", "==", compId)));
        
        const comp = state.competitions.find(c => c.id === compId);
        if (!comp) throw new Error("Competition not found");

        let d = new Date(startDate);
        let e = new Date(endDate);
        const dateStrings = [];
        let totalDaysPassed = 0;
        while (d <= e) {
            if (d.getDay() !== 5 && d.getDay() !== 6) { // Sun-Thu Only
                const ys = d.getFullYear();
                const ms = String(d.getMonth() + 1).padStart(2, '0');
                const ds = String(d.getDate()).padStart(2, '0');
                dateStrings.push(`${ys}-${ms}-${ds}`);
                totalDaysPassed++;
            }
            d.setDate(d.getDate() + 1);
        }

        const actSnap = await window.firebaseOps.getDocs(window.firebaseOps.query(window.firebaseOps.collection(window.db, "activity_days"), window.firebaseOps.where("competitionId", "==", compId)));
        let activityDaysCount = 0;
        let totalActivityPossible = 0;
        actSnap.forEach(doc => {
            const data = doc.data();
            if (data.date >= startDate && data.date <= endDate && dateStrings.includes(data.date)) {
                activityDaysCount++;
                totalActivityPossible += parseInt(data.points) || 0;
            }
        });

        const normalDaysCount = totalDaysPassed - activityDaysCount;

        bulkWhatsAppQueue = [];
        groups.forEach(g => {
            if (g.members) {
                g.members.forEach(mId => {
                    const st = state.students.find(s => s.id === mId);
                    if (st && st.studentNumber && st.studentNumber.trim() !== "") {
                        let totalEarned = 0;
                        let totalPossible = 0;
                        
                        let reportText = `📊 *تقرير الأسبوع الماضي* 📊\n`;
                        reportText += `👤 الطالب: ${st.name}\n`;
                        reportText += `📅 الفترة: ${startDate} إلى ${endDate}\n`;
                        if (activityDaysCount > 0) reportText += `🎪 تم إقامة نشاط (${activityDaysCount} يوم)\n`;
                        reportText += `------------------\n`;
                        
                        if (comp.criteria) {
                             comp.criteria.forEach(c => {
                                 let earned = 0;
                                 sSnap.forEach(doc => {
                                     let sc = doc.data();
                                     if(sc.studentId === st.id && sc.criteriaId === c.id && sc.date >= startDate && sc.date <= endDate) {
                                         earned += parseInt(sc.points) || 0;
                                     }
                                 });
                                 let possible = (parseInt(c.positivePoints) || 0) * normalDaysCount;
                                 reportText += `🔹 ${c.name}: ${earned} / ${possible}\n`;
                                 totalEarned += earned;
                                 totalPossible += possible;
                             });
                        }
                        
                        if (activityDaysCount > 0) {
                             let actEarned = 0;
                             sSnap.forEach(doc => {
                                 let sc = doc.data();
                                 if(sc.studentId === st.id && sc.criteriaId === 'ACTIVITY_DAY' && sc.date >= startDate && sc.date <= endDate) {
                                     actEarned += parseInt(sc.points) || 0;
                                 }
                             });
                             reportText += `🏃 نقاط النشاط: ${actEarned} / ${totalActivityPossible}\n`;
                             totalEarned += actEarned;
                             totalPossible += totalActivityPossible;
                        }
                        
                        let absentDays = [];
                        let deduction = 0;
                        sSnap.forEach(doc => {
                             let sc = doc.data();
                             if(sc.studentId === st.id && sc.criteriaId === 'ABSENCE_RECORD' && sc.date >= startDate && sc.date <= endDate) {
                                 deduction += parseInt(sc.points) || 0;
                                 absentDays.push(`${sc.date} (${sc.criteriaName || 'غياب'})`);
                             }
                        });
                        if (absentDays.length > 0) {
                             reportText += `⚠️ خصم غياب: ${deduction}\n`;
                             reportText += `❌ أيام الغياب:\n${absentDays.join('\n')}\n`;
                             totalEarned += deduction;
                        }
                        
                        reportText += `------------------\n`;
                        reportText += `✨ *المجموع النهائي: ${totalEarned} / ${totalPossible}*\n`;
                        reportText += `\nشاكرين تعاونكم 🌹`;

                        bulkWhatsAppQueue.push({
                            id: st.id,
                            name: st.name,
                            phone: st.studentNumber,
                            text: reportText,
                            sent: false
                        });
                    }
                });
            }
        });

        if (bulkWhatsAppQueue.length === 0) {
            showToast("لا يوجد أرقام جوال مسجلة للطلاب", "error");
            return;
        }

        bulkWhatsAppCurrentIndex = 0;
        closeModal('bulk-wa-start-modal');
        showBulkWhatsAppRunner();

    } catch (e) {
        console.error(e);
        showToast("خطأ أثناء تجهيز القائمة", "error");
    } finally {
        btn.innerHTML = prevHTML;
        btn.disabled = false;
    }
}

function showBulkWhatsAppRunner() {
    let modal = document.getElementById('bulk-wa-runner-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'bulk-wa-runner-modal';
        modal.dataset.dynamic = 'true';
        document.body.appendChild(modal);
    }
    
    modal.className = 'fixed inset-0 bg-gray-50 dark:bg-gray-900 z-[200] flex flex-col animate-fade-in';
    renderBulkWhatsAppList();
    toggleModal('bulk-wa-runner-modal', true);
}

function renderBulkWhatsAppList() {
    let modal = document.getElementById('bulk-wa-runner-modal');
    const sentCount = bulkWhatsAppQueue.filter(item => item.sent).length;
    const progressPct = bulkWhatsAppQueue.length > 0 ? Math.round((sentCount / bulkWhatsAppQueue.length) * 100) : 0;

    let html = `
        <div class="bg-white dark:bg-gray-800 shadow-[0_4px_20px_-10px_rgba(0,0,0,0.1)] px-4 py-4 flex justify-between items-center shrink-0 border-b border-gray-100 dark:border-gray-700 z-10 relative">
            <div>
                <h2 class="font-bold text-lg text-emerald-600 flex items-center gap-2"><i data-lucide="send" class="w-5 h-5"></i> نظام المراسلة المجمعة</h2>
                <p class="text-xs text-gray-500 mt-1">تم تجهيز ${bulkWhatsAppQueue.length} رسالة (أُرسل منها ${sentCount})</p>
            </div>
            <button onclick="closeModal('bulk-wa-runner-modal')" class="text-gray-400 hover:text-gray-600 p-2 bg-gray-100 dark:bg-gray-700 rounded-full"><i data-lucide="x" class="w-5 h-5"></i></button>
        </div>
        
        <div class="h-1.5 w-full bg-gray-200 dark:bg-gray-700 shrink-0 relative">
            <div class="h-full bg-emerald-500 transition-all duration-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" style="width: ${progressPct}%"></div>
        </div>

        <div class="flex-1 overflow-y-auto p-4 space-y-3 pb-safe">
    `;

    bulkWhatsAppQueue.forEach((item, index) => {
        const isCurrent = index === bulkWhatsAppCurrentIndex;
        let phoneStr = item.phone.replace(/\\D/g, '');
        if (phoneStr.startsWith('05') && phoneStr.length === 10) {
            phoneStr = '966' + phoneStr.substring(1);
        }

        const encodedText = encodeURIComponent(item.text);
        const waLink = `https://api.whatsapp.com/send?phone=${phoneStr}&text=${encodedText}`;

        html += `
            <div class="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border ${isCurrent ? 'border-emerald-500 ring-4 ring-emerald-100 dark:ring-emerald-900/40 transform scale-[1.02]' : (item.sent ? 'border-gray-100 dark:border-gray-700 opacity-60' : 'border-gray-200 dark:border-gray-700')} flex items-center justify-between transition-all duration-300">
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${item.sent ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/50' : 'bg-gray-100 text-gray-500 dark:bg-gray-700'}">
                        ${index + 1}
                    </div>
                    <div>
                        <p class="font-bold text-sm ${item.sent ? 'text-emerald-700 dark:text-emerald-400' : ''}">${item.name}</p>
                        <p class="text-xs text-gray-500 dir-ltr">${item.phone}</p>
                    </div>
                </div>
                <button onclick="sendSingleBulkWhatsApp(${index}, '${waLink}')" class="${item.sent ? 'bg-gray-100 text-emerald-600 dark:bg-gray-700 hover:bg-gray-200' : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg'} px-5 py-2.5 rounded-xl text-sm font-bold transition flex items-center gap-2">
                    <i data-lucide="${item.sent ? 'check-check' : 'send'}" class="w-4 h-4"></i>
                    ${item.sent ? 'مُرسل' : 'إرسال الآن'}
                </button>
            </div>
        `;
    });

    html += `</div>`;
    modal.innerHTML = html;
    lucide.createIcons();
    
    setTimeout(() => {
        const currentEl = modal.querySelector('.ring-4');
        if (currentEl) {
            currentEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, 100);
}

function sendSingleBulkWhatsApp(index, url) {
    bulkWhatsAppQueue[index].sent = true;
    if (bulkWhatsAppCurrentIndex === index) {
        bulkWhatsAppCurrentIndex++;
        while (bulkWhatsAppCurrentIndex < bulkWhatsAppQueue.length && bulkWhatsAppQueue[bulkWhatsAppCurrentIndex].sent) {
            bulkWhatsAppCurrentIndex++;
        }
    }
    window.open(url, '_blank');
    renderBulkWhatsAppList();
}

// =====================================================
// FEATURE #12: Group PDF Reports with Date Filter (HTML2PDF)
// =====================================================
function openReportsModal() {
    let modal = document.getElementById('report-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'report-modal';
        modal.dataset.dynamic = 'true';
        document.body.appendChild(modal);
    }

    modal.className = 'fixed inset-0 bg-black/50 z-[150] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in';
    
    // Set default dates (last 7 days to today)
    const today = new Date();
    const lastWeek = new Date();
    lastWeek.setDate(today.getDate() - 7);
    const endStr = today.toISOString().split('T')[0];
    const startStr = lastWeek.toISOString().split('T')[0];

    modal.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl flex flex-col">
            <div class="flex justify-between items-center mb-6 border-b pb-4 border-gray-100 dark:border-gray-700">
                <h3 class="font-bold text-lg flex items-center gap-2">
                    <i data-lucide="file-text" class="w-5 h-5 text-red-600"></i>
                    تصدير تقرير (PDF)
                </h3>
                <button onclick="closeModal('report-modal')" class="text-gray-400 hover:text-gray-600 p-1 bg-gray-50 dark:bg-gray-700 rounded-full">
                    <i data-lucide="x" class="w-4 h-4"></i>
                </button>
            </div>

            <div class="space-y-4">
                <div>
                    <label class="block text-sm font-bold mb-2">المسابقة</label>
                    <select id="report-comp-select" class="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-3">
                        ${state.competitions.filter(c => !c.level || c.level === state.currentLevel).map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
                    </select>
                </div>

                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="block text-sm font-bold mb-2">من تاريخ</label>
                        <input type="date" id="report-start-date" value="${startStr}" class="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-3 text-sm">
                    </div>
                    <div>
                        <label class="block text-sm font-bold mb-2">إلى تاريخ</label>
                        <input type="date" id="report-end-date" value="${endStr}" class="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-3 text-sm">
                    </div>
                </div>

                <div class="flex gap-3 pt-4">
                    <button type="button" onclick="closeModal('report-modal')" class="flex-1 py-3 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 font-medium transition">إلغاء</button>
                    <button onclick="generatePDFReport()" class="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 shadow-lg transition flex justify-center items-center gap-2">
                        <i data-lucide="download" class="w-5 h-5"></i>
                        تحميل
                    </button>
                </div>
            </div>
        </div>
    `;

    lucide.createIcons();
    toggleModal('report-modal', true);
}

async function generatePDFReport() {
    const compId = $('#report-comp-select').value;
    const startDate = $('#report-start-date').value;
    const endDate = $('#report-end-date').value;
    const compName = $('#report-comp-select').options[$('#report-comp-select').selectedIndex].text;

    if (!compId || !startDate || !endDate) {
        showToast("الرجاء تحديد المسابقة والفترة كاملة", "error");
        return;
    }

    if (startDate > endDate) {
        showToast("تاريخ البداية يجب أن يكون قبل تاريخ النهاية", "error");
        return;
    }

    // Generate date range
    const dateRange = [];
    let curr = new Date(startDate);
    const end = new Date(endDate);
    while (curr <= end) {
        dateRange.push(curr.toISOString().split('T')[0]);
        curr.setDate(curr.getDate() + 1);
    }

    try {
        showToast("جاري إعداد التقرير...", "success");
        closeModal('report-modal');

        const groups = state.groups.filter(g => g.competitionId === compId && g.level === state.currentLevel);
        
        const sSnap = await window.firebaseOps.getDocs(
            window.firebaseOps.query(
                window.firebaseOps.collection(window.db, "scores"),
                window.firebaseOps.where("competitionId", "==", compId)
            )
        );
        
        const gsSnap = await window.firebaseOps.getDocs(
            window.firebaseOps.query(
                window.firebaseOps.collection(window.db, "group_scores"),
                window.firebaseOps.where("competitionId", "==", compId)
            )
        ).catch(() => ({ forEach: () => {} }));

        const studentStatsMap = {};
        sSnap.forEach(d => {
            const sc = d.data();
            if (sc.date >= startDate && sc.date <= endDate) {
                if (!studentStatsMap[sc.studentId]) studentStatsMap[sc.studentId] = { points: 0, positive: 0, negative: 0, excused: 0, unexcused: 0 };
                const pts = parseInt(sc.points) || 0;
                studentStatsMap[sc.studentId].points += pts;
                if (pts > 0) studentStatsMap[sc.studentId].positive += pts;
                else if (pts < 0) studentStatsMap[sc.studentId].negative += Math.abs(pts);
                
                const cName = sc.criteriaName || (sc.criteriaId === 'ABSENCE_RECORD' ? 'غياب' : '');
                if (cName.indexOf('بعذر') !== -1) {
                    studentStatsMap[sc.studentId].excused++;
                } else if (cName.indexOf('بدون عذر') !== -1 || cName.indexOf('غياب') !== -1 || sc.criteriaId === 'ABSENCE_RECORD') {
                    studentStatsMap[sc.studentId].unexcused++;
                }
            }
        });

        const groupScoresMap = {};
        gsSnap.forEach(d => {
            const gs = d.data();
            if (gs.date >= startDate && gs.date <= endDate) {
                groupScoresMap[gs.groupId] = (groupScoresMap[gs.groupId] || 0) + (parseInt(gs.points) || 0);
            }
        });

        // Create HTML content for the PDF
        const container = document.createElement('div');
        // A wrapper with guaranteed white background and fixed width suitable for A4 landscape
        container.innerHTML = `
            <div id="pdf-report-content" style="width: 1040px; padding: 30px; background: white; color: #1f2937; font-family: sans-serif; direction: rtl; text-align: right;">
                
                <div style="text-align: center; margin-bottom: 30px; border-bottom: 2px solid #0d9488; padding-bottom: 20px;">
                    <h1 style="font-size: 26px; color: #0d9488; margin: 0; font-weight: bold;">مسابقات ابن تيمية</h1>
                    <h2 style="font-size: 20px; color: #374151; margin: 10px 0 5px 0;">تقرير المجموعات التفصيلي</h2>
                    <p style="font-size: 14px; color: #6b7280; margin: 0;">هذا التقرير الشامل يوضح درجات الطلاب في "${compName}" والمشاركات والغيابات مع حساب صافي النقاط للمجموعات بناءاً على إحصائيات هذه الفترة.</p>
                    <p style="font-size: 14px; color: #6b7280; margin: 5px 0 0 0;">الفترة المشمولة: من ${startDate} إلى ${endDate}</p>
                </div>

                ${groups.length === 0 ? '<p style="text-align: center; color: #9ca3af; font-size: 18px;">لا توجد مجموعات مسجلة.</p>' : ''}

                <div style="display: flex; flex-direction: column; gap: 30px;">
                    ${groups.map(g => {
                        const gBonus = groupScoresMap[g.id] || 0;
                        let membersSum = 0;
                        
                        let membersRows = '';
                        if (g.members && g.members.length > 0) {
                            membersRows = g.members.map((mId, idx) => {
                                const st = state.students.find(s => s.id === mId);
                                if (st) {
                                    const stats = studentStatsMap[mId] || { points: 0, positive: 0, negative: 0, excused: 0, unexcused: 0 };
                                    membersSum += stats.points;
                                    return `
                                        <tr style="background: ${idx % 2 === 0 ? '#f9fafb' : '#ffffff'};">
                                            <td style="padding: 10px; border: 1px solid #e5e7eb; text-align: center;">${idx + 1}</td>
                                            <td style="padding: 10px; border: 1px solid #e5e7eb; font-weight: bold;">${st.name}</td>
                                            <td style="padding: 10px; border: 1px solid #e5e7eb; text-align: center;" dir="ltr">${st.studentNumber || '-'}</td>
                                            <td style="padding: 10px; border: 1px solid #e5e7eb; text-align: center; color: #dc2626; font-weight: bold;">${stats.unexcused > 0 ? stats.unexcused : '-'}</td>
                                            <td style="padding: 10px; border: 1px solid #e5e7eb; text-align: center; color: #d97706; font-weight: bold;">${stats.excused > 0 ? stats.excused : '-'}</td>
                                            <td style="padding: 10px; border: 1px solid #e5e7eb; text-align: center; color: #059669; font-weight: bold;" dir="ltr">${stats.positive > 0 ? '+' : ''}${stats.positive > 0 ? stats.positive : '-'}</td>
                                            <td style="padding: 10px; border: 1px solid #e5e7eb; text-align: center; color: #dc2626; font-weight: bold;" dir="ltr">${stats.negative > 0 ? '-' : ''}${stats.negative > 0 ? stats.negative : '-'}</td>
                                            <td style="padding: 10px; border: 1px solid #e5e7eb; text-align: center; font-weight: bold; color: ${stats.points >= 0 ? '#059669' : '#dc2626'};" dir="ltr">${stats.points > 0 ? '+' : ''}${stats.points}</td>
                                        </tr>
                                    `;
                                }
                                return '';
                            }).join('');
                        } else {
                            membersRows = '<tr><td colspan="8" style="padding: 10px; text-align: center; color: #9ca3af; border: 1px solid #e5e7eb;">لا يوجد طلاب</td></tr>';
                        }

                        const netTotal = membersSum + gBonus;

                        return `
                        <div style="border: 1px solid #d1d5db; border-radius: 8px; overflow: hidden; page-break-inside: avoid;">
                            <!-- Group Header -->
                            <div style="background: #f3f4f6; padding: 15px; border-bottom: 2px solid #9ca3af; display: flex; justify-content: space-between; align-items: center;">
                                <div style="display: flex; align-items: center; gap: 10px;">
                                    <span style="font-size: 24px;">${g.icon && !isImgSrc(g.icon) ? g.icon : '🛡️'}</span>
                                    <h3 style="margin: 0; font-size: 20px; font-weight: bold;">${g.name}</h3>
                                </div>
                                <div style="font-size: 22px; font-weight: bold; color: ${netTotal >= 0 ? '#0d9488' : '#dc2626'};">
                                    الصافي: ${netTotal}
                                </div>
                            </div>
                            
                            <!-- Group Specific Score -->
                            ${gBonus !== 0 ? `
                            <div style="padding: 10px 15px; background: ${gBonus > 0 ? '#ecfdf5' : '#fef2f2'}; border-bottom: 1px solid #e5e7eb; border-left: 4px solid ${gBonus > 0 ? '#10b981' : '#ef4444'}; font-weight: bold; font-size: 14px; text-align: right; display: flex; justify-content: space-between;">
                                <span>النقاط الإضافية للمجموعة المستقلة:</span>
                                <span style="color: ${gBonus > 0 ? '#059669' : '#dc2626'};" dir="ltr">${gBonus > 0 ? '+' : ''}${gBonus}</span>
                            </div>
                            ` : ''}

                            <table style="width: 100%; border-collapse: collapse; text-align: right; font-size: 14px;">
                                <thead>
                                    <tr style="background: #e5e7eb;">
                                        <th style="padding: 10px; border: 1px solid #d1d5db; width: 40px; text-align: center;">م</th>
                                        <th style="padding: 10px; border: 1px solid #d1d5db;">اسم الطالب</th>
                                        <th style="padding: 10px; border: 1px solid #d1d5db; width: 140px; text-align: center;">جوال ولي الأمر</th>
                                        <th style="padding: 10px; border: 1px solid #d1d5db; width: 50px; text-align: center; color: #b91c1c;">بدون عذر</th>
                                        <th style="padding: 10px; border: 1px solid #d1d5db; width: 50px; text-align: center; color: #d97706;">بعذر</th>
                                        <th style="padding: 10px; border: 1px solid #d1d5db; width: 60px; text-align: center; color: #047857;">موجب</th>
                                        <th style="padding: 10px; border: 1px solid #d1d5db; width: 60px; text-align: center; color: #b91c1c;">سالب</th>
                                        <th style="padding: 10px; border: 1px solid #d1d5db; width: 80px; text-align: center;">الصافي</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${membersRows}
                                    <tr style="background: #fdfce8;">
                                        <td colspan="7" style="padding: 10px; border: 1px solid #d1d5db; font-weight: bold; text-align: left;">مجموع نقاط الطلاب فقط:</td>
                                        <td style="padding: 10px; border: 1px solid #d1d5db; text-align: center; font-weight: bold; color: #b45309;">${membersSum}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                        `;
                    }).join('')}
                </div>
                
                <div style="margin-top: 40px; text-align: left; font-size: 12px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 10px;">
                    تم التوليد في: ${new Date().toLocaleString('ar-SA')}
                </div>
            </div>
        `;

        document.body.appendChild(container);
        const element = document.getElementById('pdf-report-content');

        // html2pdf options (Landscape)
        const opt = {
            margin:       [10, 10, 10, 10],
            filename:     `تقرير_${compName}_${startDate}.pdf`,
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2, useCORS: true, letterRendering: true },
            jsPDF:        { unit: 'mm', format: 'a4', orientation: 'landscape' }
        };

        await window.html2pdf().set(opt).from(element).save();
        document.body.removeChild(container);

        showToast("تم تحميل التقرير بنجاح", "success");
    } catch (e) {
        console.error("PDF Generate Error:", e);
        showToast("حدث خطأ أثناء إعداد التقرير", "error");
    }
}

// =====================================================
// FEATURE #13: PDF Exports & Advanced Stats
// =====================================================
async function exportStudentsPDF() {
    const students = state.students.filter(s => s.level === state.currentLevel);
    if (students.length === 0) {
        showToast("لا يوجد طلاب للتصدير", "error");
        return;
    }

    try {
        showToast("جاري التجهيز... الرجاء الانتظار", "success");

        const grouped = {};
        const activeGroups = state.groups.filter(g => g.level === state.currentLevel);
        
        activeGroups.forEach(g => {
            grouped[g.id] = { name: g.name, students: [] };
        });

        students.forEach(s => {
            if (s.groupId && grouped[s.groupId]) {
                grouped[s.groupId].students.push(s);
            } else {
                if (!grouped['none']) grouped['none'] = { name: 'بدون مجموعة', students: [] };
                grouped['none'].students.push(s);
            }
        });

        const levelName = state.levels.find(l => l.id === state.currentLevel)?.name || state.currentLevel;

        const container = document.createElement('div');
        container.innerHTML = `
            <div id="pdf-students-content" style="width: 1040px; padding: 30px; background: white; color: #1f2937; font-family: sans-serif; direction: rtl; text-align: right;">
                <div style="text-align: center; margin-bottom: 30px; border-bottom: 2px solid #0d9488; padding-bottom: 20px;">
                    <h1 style="font-size: 26px; color: #0d9488; margin: 0; font-weight: bold;">مسابقات ابن تيمية</h1>
                    <h2 style="font-size: 20px; color: #374151; margin: 10px 0 5px 0;">سجل بيانات الطلاب الشامل</h2>
                    <p style="font-size: 14px; color: #6b7280; margin: 0;">المستوى: ${levelName} | إجمالي الطلاب: ${students.length}</p>
                </div>

                <div style="display: flex; flex-direction: column; gap: 30px;">
                    ${Object.values(grouped).filter(g => g.students.length > 0).map(g => `
                        <div style="border: 1px solid #d1d5db; border-radius: 8px; overflow: hidden; page-break-inside: avoid;">
                            <div style="background: #f3f4f6; padding: 15px; border-bottom: 2px solid #9ca3af; display: flex; justify-content: space-between; align-items: center;">
                                <h3 style="margin: 0; font-size: 20px; font-weight: bold;">مجموعة: ${g.name}</h3>
                                <div style="font-size: 16px; font-weight: bold; color: #0d9488;">العدد: ${g.students.length}</div>
                            </div>
                            <table style="width: 100%; border-collapse: collapse; text-align: right; font-size: 14px;">
                                <thead>
                                    <tr style="background: #e5e7eb;">
                                        <th style="padding: 10px; border: 1px solid #d1d5db; width: 50px; text-align: center;">م</th>
                                        <th style="padding: 10px; border: 1px solid #d1d5db;">اسم الطالب</th>
                                        <th style="padding: 10px; border: 1px solid #d1d5db; width: 140px; text-align: center;">رقم الهوية / الجوال</th>
                                        <th style="padding: 10px; border: 1px solid #d1d5db; width: 100px; text-align: center;">آخر تفاعل</th>
                                        <th style="padding: 10px; border: 1px solid #d1d5db;">كلمة المرور</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${g.students.map((st, idx) => `
                                        <tr style="background: ${idx % 2 === 0 ? '#f9fafb' : '#ffffff'};">
                                            <td style="padding: 10px; border: 1px solid #e5e7eb; text-align: center;">${idx + 1}</td>
                                            <td style="padding: 10px; border: 1px solid #e5e7eb; font-weight: bold;">${st.name}</td>
                                            <td style="padding: 10px; border: 1px solid #e5e7eb; text-align: center;" dir="ltr">${st.studentNumber || '-'}</td>
                                            <td style="padding: 10px; border: 1px solid #e5e7eb; text-align: center;" dir="ltr">${st.lastActive ? new Date(st.lastActive).toLocaleDateString() : '-'}</td>
                                            <td style="padding: 10px; border: 1px solid #e5e7eb; text-align: center; color: #dc2626;" dir="ltr">${st.password || '-'}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    `).join('')}
                </div>
                <div style="margin-top: 40px; text-align: left; font-size: 12px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 10px;">
                    تم التوليد في: ${new Date().toLocaleString('ar-SA')}
                </div>
            </div>
        `;

        document.body.appendChild(container);
        const element = document.getElementById('pdf-students-content');

        const opt = {
            margin:       [10, 10, 10, 10],
            filename:     `الطلاب_${levelName}.pdf`,
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2, useCORS: true, letterRendering: true },
            jsPDF:        { unit: 'mm', format: 'a4', orientation: 'landscape' }
        };

        await window.html2pdf().set(opt).from(element).save();
        document.body.removeChild(container);

        showToast("تم تصدير كشف الطلاب بنجاح", "success");
    } catch(e) {
        console.error(e);
        showToast("خطأ أثناء إعداد الكشف", "error");
    }
}

function openScoresReportsModal() {
    let modal = document.getElementById('scores-report-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'scores-report-modal';
        modal.dataset.dynamic = 'true';
        document.body.appendChild(modal);
    }

    modal.className = 'fixed inset-0 bg-black/50 z-[160] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in';
    
    const today = new Date();
    const lastWeek = new Date();
    lastWeek.setDate(today.getDate() - 7);
    const endStr = today.toISOString().split('T')[0];
    const startStr = lastWeek.toISOString().split('T')[0];

    modal.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl flex flex-col">
            <div class="flex justify-between items-center mb-6 border-b pb-4 border-gray-100 dark:border-gray-700">
                <h3 class="font-bold text-lg flex items-center gap-2">
                    <i data-lucide="file-spreadsheet" class="w-5 h-5 text-blue-600"></i>
                    سجل الدرجات الشامل (PDF)
                </h3>
                <button onclick="closeModal('scores-report-modal')" class="text-gray-400 hover:text-gray-600 p-1 bg-gray-50 dark:bg-gray-700 rounded-full">
                    <i data-lucide="x" class="w-4 h-4"></i>
                </button>
            </div>

            <div class="space-y-4">
                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="block text-sm font-bold mb-2">من تاريخ</label>
                        <input type="date" id="score-report-start-date" value="${startStr}" class="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-3 text-sm">
                    </div>
                    <div>
                        <label class="block text-sm font-bold mb-2">إلى تاريخ</label>
                        <input type="date" id="score-report-end-date" value="${endStr}" class="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-3 text-sm">
                    </div>
                </div>

                <div class="flex gap-3 pt-4">
                    <button type="button" onclick="closeModal('scores-report-modal')" class="flex-1 py-3 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 font-medium transition">إلغاء</button>
                    <button onclick="exportScoresPDF()" class="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 shadow-lg transition flex justify-center items-center gap-2">
                        <i data-lucide="download" class="w-5 h-5"></i>
                        تحميل سجل مفصل
                    </button>
                </div>
            </div>
        </div>
    `;

    lucide.createIcons();
    toggleModal('scores-report-modal', true);
}

async function exportScoresPDF() {
    const startDate = document.getElementById('score-report-start-date').value;
    const endDate = document.getElementById('score-report-end-date').value;

    if (!startDate || !endDate) return showToast("الرجاء تحديد الفترة", "error");
    if (startDate > endDate) return showToast("تاريخ البداية يجب أن يكون قبل تاريخ النهاية", "error");

    const dateRange = [];
    let curr = new Date(startDate);
    const end = new Date(endDate);
    while (curr <= end) {
        dateRange.push(curr.toISOString().split('T')[0]);
        curr.setDate(curr.getDate() + 1);
    }

    try {
        showToast("جاري إعداد السجل...", "success");
        closeModal('scores-report-modal');

        const students = state.students.filter(s => s.level === state.currentLevel);
        const levelName = state.levels.find(l => l.id === state.currentLevel)?.name || state.currentLevel;

        const sSnap = await window.firebaseOps.getDocs(
            window.firebaseOps.query(
                window.firebaseOps.collection(window.db, "scores"),
                window.firebaseOps.where("date", ">=", startDate),
                window.firebaseOps.where("date", "<=", endDate)
            )
        );

        const logs = [];
        sSnap.forEach(d => {
            const row = d.data();
            const student = students.find(s => s.id === row.studentId);
            if (student) {
                logs.push({ ...row, studentName: student.name, group: state.groups.find(g => g.id === student.groupId)?.name || '-' });
            }
        });

        logs.sort((a, b) => new Date(a.date) - new Date(b.date) || a.studentName.localeCompare(b.studentName));

        const container = document.createElement('div');
        let tableRows = '';
        
        if (logs.length === 0) {
            tableRows = '<tr><td colspan="6" style="padding: 20px; text-align: center; color: #9ca3af; border: 1px solid #e5e7eb;">لا توجد درجات مسجلة في هذه الفترة</td></tr>';
        } else {
            tableRows = logs.map((log, idx) => `
                <tr style="background: ${idx % 2 === 0 ? '#f9fafb' : '#ffffff'};">
                    <td style="padding: 8px; border: 1px solid #e5e7eb; text-align: center;">${idx + 1}</td>
                    <td style="padding: 8px; border: 1px solid #e5e7eb; text-align: center;" dir="ltr">${log.date}</td>
                    <td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: bold;">${log.studentName}</td>
                    <td style="padding: 8px; border: 1px solid #e5e7eb; color: #4b5563;">${log.group}</td>
                    <td style="padding: 8px; border: 1px solid #e5e7eb; text-align: center; font-weight: bold; color: ${log.points >= 0 ? '#059669' : '#dc2626'};" dir="ltr">${log.points > 0 ? '+' : ''}${log.points}</td>
                    <td style="padding: 8px; border: 1px solid #e5e7eb;">${log.criteriaName || (log.criteriaId === 'ABSENCE_RECORD' ? 'غياب' : 'أخرى')}</td>
                </tr>
            `).join('');
        }

        container.innerHTML = `
            <div id="pdf-scores-content" style="width: 1040px; padding: 30px; background: white; color: #1f2937; font-family: sans-serif; direction: rtl; text-align: right;">
                <div style="text-align: center; margin-bottom: 30px; border-bottom: 2px solid #0d9488; padding-bottom: 20px;">
                    <h1 style="font-size: 26px; color: #0d9488; margin: 0; font-weight: bold;">مسابقات ابن تيمية</h1>
                    <h2 style="font-size: 20px; color: #374151; margin: 10px 0 5px 0;">السجل التفصيلي للدرجات والمشاركات</h2>
                    <p style="font-size: 14px; color: #6b7280; margin: 0;">المستوى: ${levelName} | الفترة: ${startDate} إلى ${endDate} | عدد الحركات: ${logs.length}</p>
                </div>
                
                <table style="width: 100%; border-collapse: collapse; text-align: right; font-size: 13px;">
                    <thead>
                        <tr style="background: #e5e7eb;">
                            <th style="padding: 10px; border: 1px solid #d1d5db; width: 40px; text-align: center;">م</th>
                            <th style="padding: 10px; border: 1px solid #d1d5db; width: 100px; text-align: center;">التاريخ</th>
                            <th style="padding: 10px; border: 1px solid #d1d5db; width: 220px;">اسم الطالب</th>
                            <th style="padding: 10px; border: 1px solid #d1d5db; width: 160px;">المجموعة</th>
                            <th style="padding: 10px; border: 1px solid #d1d5db; width: 60px; text-align: center;">النقاط</th>
                            <th style="padding: 10px; border: 1px solid #d1d5db;">المعيار / السبب</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRows}
                    </tbody>
                </table>
                <div style="margin-top: 40px; text-align: left; font-size: 12px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 10px;">
                    تم التوليد في: ${new Date().toLocaleString('ar-SA')}
                </div>
            </div>
        `;

        document.body.appendChild(container);
        const element = document.getElementById('pdf-scores-content');

        const opt = {
            margin:       [10, 10, 10, 10],
            filename:     `سجل_الدرجات_${startDate}_${endDate}.pdf`,
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2, useCORS: true, letterRendering: true },
            jsPDF:        { unit: 'mm', format: 'a4', orientation: 'landscape' }
        };

        await window.html2pdf().set(opt).from(element).save();
        document.body.removeChild(container);

        showToast("تم تصدير سجل الدرجات بنجاح", "success");
    } catch(e) {
        console.error(e);
        showToast("خطأ أثناء إعداد التصدير", "error");
    }
}

// ----------------------------------------
// STATS MODAL (Advanced)
// ----------------------------------------
function openStatsModal() {
    let modal = document.getElementById('stats-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'stats-modal';
        modal.dataset.dynamic = 'true';
        document.body.appendChild(modal);
    }

    modal.className = 'fixed inset-0 bg-black/50 z-[150] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in';
    
    const today = new Date();
    const lastWeek = new Date();
    lastWeek.setDate(today.getDate() - 30);
    const endStr = today.toISOString().split('T')[0];
    const startStr = lastWeek.toISOString().split('T')[0];

    modal.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-3xl p-6 shadow-2xl flex flex-col max-h-[90vh]">
            <div class="flex justify-between items-center mb-6 border-b pb-4 border-gray-100 dark:border-gray-700">
                <h3 class="font-bold text-lg flex items-center gap-2">
                    <i data-lucide="bar-chart-3" class="w-6 h-6 text-amber-600"></i>
                    المركز التحليلي والإحصائيات
                </h3>
                <button onclick="closeModal('stats-modal')" class="text-gray-400 hover:text-gray-600 p-1 bg-gray-50 dark:bg-gray-700 rounded-full">
                    <i data-lucide="x" class="w-5 h-5"></i>
                </button>
            </div>

            <!-- Date Filter & Group Filter -->
            <div class="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-xl flex flex-wrap gap-3 mb-6 items-end">
                <div class="flex-1 min-w-[120px]">
                    <label class="block text-xs font-bold mb-1 text-gray-500">من تاريخ</label>
                    <input type="date" id="stats-start-date" value="${startStr}" class="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm">
                </div>
                <div class="flex-1 min-w-[120px]">
                    <label class="block text-xs font-bold mb-1 text-gray-500">إلى تاريخ</label>
                    <input type="date" id="stats-end-date" value="${endStr}" class="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm">
                </div>
                <div class="flex-1 min-w-[150px]">
                    <label class="block text-xs font-bold mb-1 text-gray-500">المجموعة</label>
                    <select id="stats-group-select" class="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm">
                        <option value="all">جميع المجموعات (عام)</option>
                        ${state.groups.filter(g => g.level === state.currentLevel).map(g => `<option value="${g.id}">${g.name}</option>`).join('')}
                    </select>
                </div>
                <button onclick="calculateAndRenderStats()" class="px-6 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg transition h-[38px] flex items-center shadow-sm">
                    تحديث القراءة
                </button>
            </div>

            <div id="stats-results-container" class="overflow-y-auto space-y-4 pb-4">
                <div class="text-center py-10 text-gray-400">
                    <i data-lucide="loader-2" class="w-8 h-8 mx-auto mb-2 animate-spin"></i>
                    جاري حساب البيانات...
                </div>
            </div>
        </div>
    `;

    lucide.createIcons();
    toggleModal('stats-modal', true);
    
    // Automatically calculate stats on open
    setTimeout(() => { calculateAndRenderStats(); }, 100);
}

async function calculateAndRenderStats() {
    const startDate = document.getElementById('stats-start-date').value;
    const endDate = document.getElementById('stats-end-date').value;
    const groupId = document.getElementById('stats-group-select') ? document.getElementById('stats-group-select').value : 'all';
    const container = document.getElementById('stats-results-container');

    if (!startDate || !endDate) return showToast("الرجاء تحديد التواريخ", "error");

    const dateRange = [];
    let curr = new Date(startDate);
    const end = new Date(endDate);
    while (curr <= end) {
        dateRange.push(curr.toISOString().split('T')[0]);
        curr.setDate(curr.getDate() + 1);
    }

    try {
        container.innerHTML = `<div class="text-center py-10 text-gray-400"><i data-lucide="loader-2" class="w-8 h-8 mx-auto mb-2 animate-spin"></i> استخراج البيانات...</div>`;
        lucide.createIcons();

        // 1. Fetch Students
        let students = state.students.filter(s => s.level === state.currentLevel);
        if (groupId !== 'all') {
            students = students.filter(s => String(s.groupId) === String(groupId));
        }
        const stIds = students.map(s => s.id);
        
        if (stIds.length === 0) {
            container.innerHTML = `<div class="text-center text-gray-400 p-8 border border-dashed rounded-xl border-gray-200">لا يوجد طلاب مطابقين للبحث.</div>`;
            return;
        }

        // 2. Fetch Scores for Date Range
        const sSnap = await window.firebaseOps.getDocs(
            window.firebaseOps.query(
                window.firebaseOps.collection(window.db, "scores"),
                window.firebaseOps.where("date", ">=", startDate),
                window.firebaseOps.where("date", "<=", endDate)
            )
        );

        let totalScoresRows = 0;
        let posPoints = 0;
        let negPoints = 0;
        let absencesCount = 0;
        let excusesCount = 0;
        let criteriaUsage = {};

        sSnap.forEach(d => {
            const sc = d.data();
            // Only count if student is in the current level
            if (stIds.includes(sc.studentId)) {
                totalScoresRows++;
                const pts = parseInt(sc.points) || 0;
                
                if (pts > 0) posPoints += pts;
                else if (pts < 0) negPoints += Math.abs(pts);

                const cName = sc.criteriaName || (sc.criteriaId === 'ABSENCE_RECORD' ? 'غياب' : 'عام');
                
                if (cName.indexOf('بدون عذر') !== -1 || sc.criteriaId === 'ABSENCE_RECORD') absencesCount++;
                if (cName.indexOf('بعذر') !== -1) excusesCount++;

                if (!criteriaUsage[cName]) criteriaUsage[cName] = { count: 0, points: 0 };
                criteriaUsage[cName].count++;
                criteriaUsage[cName].points += pts;
            }
        });

        // HTML Setup
        const sortedCriteria = Object.entries(criteriaUsage).sort((a, b) => b[1].count - a[1].count);

        container.innerHTML = `
            <!-- Overview Cards -->
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div class="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-xl p-4 text-center">
                    <p class="text-3xl font-bold text-blue-600 mb-1">${totalScoresRows}</p>
                    <p class="text-xs text-blue-800 dark:text-blue-300">إجمالي الحركات (تقييمات)</p>
                </div>
                <div class="bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-800 rounded-xl p-4 text-center">
                    <p class="text-3xl font-bold text-green-600 mb-1">+${posPoints}</p>
                    <p class="text-xs text-green-800 dark:text-green-300">مجموع النقاط المكتسبة</p>
                </div>
                <div class="bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-xl p-4 text-center">
                    <p class="text-3xl font-bold text-red-600 mb-1">-${negPoints}</p>
                    <p class="text-xs text-red-800 dark:text-red-300">مجموع الخصومات</p>
                </div>
                <div class="bg-orange-50 dark:bg-orange-900/20 border border-orange-100 dark:border-orange-800 rounded-xl p-4 text-center">
                    <p class="text-3xl font-bold text-orange-600 mb-1">${absencesCount}</p>
                    <p class="text-xs text-orange-800 dark:text-orange-300">إجمالي أيام الغياب</p>
                </div>
            </div>

            <!-- Details Section -->
            <div class="mt-6 border border-gray-100 dark:border-gray-700 rounded-xl overflow-hidden">
                <div class="bg-gray-50 dark:bg-gray-800 p-3 border-b border-gray-100 dark:border-gray-700">
                    <h4 class="font-bold text-sm flex items-center gap-2"><i data-lucide="bar-chart" class="w-4 h-4 text-amber-500"></i> تفصيل تفاعل المعايير خلال الفترة</h4>
                </div>
                <div class="p-0">
                    <table class="w-full text-right text-sm">
                        <thead class="bg-gray-50 dark:bg-gray-800 text-gray-500 border-b border-gray-200 dark:border-gray-700">
                            <tr>
                                <th class="p-3 font-medium">اسم المعيار</th>
                                <th class="p-3 font-medium text-center">مرات الاستخدام</th>
                                <th class="p-3 font-medium text-center">صافي النقاط</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
                            ${sortedCriteria.length > 0 ? sortedCriteria.map(([name, data]) => `
                                <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition">
                                    <td class="p-3 font-bold">${name}</td>
                                    <td class="p-3 text-center"><span class="bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 py-1 px-3 rounded-full text-xs font-bold">${data.count}</span></td>
                                    <td class="p-3 text-center font-bold ${data.points >= 0 ? 'text-green-600' : 'text-red-600'}" dir="ltr">${data.points > 0 ? '+' : ''}${data.points}</td>
                                </tr>
                            `).join('') : `<tr><td colspan="3" class="p-6 text-center text-gray-400">لا يوجد حركات في هذه الفترة</td></tr>`}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        lucide.createIcons();

    } catch (e) {
        console.error("Stats Error:", e);
        container.innerHTML = `<div class="text-center py-6 text-red-500">حدث خطأ أثناء الاتصال بقاعدة البيانات. تأكد من استقرار الإنترنت.</div>`;
    }
}

// Auto-load Quran data on start
if (window.QuranService) {
    window.QuranService.loadData().catch(console.error);
}
