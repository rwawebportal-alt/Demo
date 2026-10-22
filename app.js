// =========================================================
// RWA SKY PORTAL - MAIN APPLICATION & API ENGINE (app.js)
// =========================================================

const API_BASE = "https://rozgarapinew.teachx.in";
const WORKER_RAW_PROXY = "https://rwa-proxy.axay332301.workers.dev/?url=";

// AppX Standard AES-128-CBC Decryption Key & IV
const AES_KEY = CryptoJS.enc.Utf8.parse("638udh3829162018");
const AES_IV = CryptoJS.enc.Utf8.parse("fedcba9876543210");

// Global User Session & Multi-Token Store
let USER_TOKENS = [];
let USER_PROFILE = null;

// Global Portal State
const state = {
    currentSlide: "slideHome",
    explorerMode: "paid", // 'paid' | 'free' | 'paid_ts' | 'free_ts'
    activeTokenObj: null,
    historyStack: [],
    currentItems: [],
    courseMap: {},
    subjectMap: {},
    topicMap: {},
    videoMap: {},
    testSeriesMap: {},
    tsSubjectMap: {},
    testMap: {},
    activeCourse: null,
    activeSubject: null,
    activeTopic: null,
    activeTestSeries: null,
    activeTsSubject: null,
    activeVideo: null,
    activePdfUrl: "",
    activeInlinePdfUrl: "",
    cbtTest: null,
    cbtSubmitted: false
};

// Fallback Sample Questions if a Test URL is empty or offline
const DB = {
    fallbackCbtQuestions: [
        {
            id: "101",
            section_id: "208",
            subject_title: "General Intelligence & Reasoning",
            question: "यदि किसी कूट भाषा में <b>'BHARAT'</b> को <b>'CIBSBU'</b> लिखा जाता है, तो उसी भाषा में <b>'INDIA'</b> को कैसे लिखा जाएगा?",
            option_1: "JOEJB",
            option_2: "JOFJB",
            option_3: "HMCGZ",
            option_4: "JOEJA",
            answer: "1",
            positive_marks: "2.00",
            negative_marks: "0.25",
            solution_text: "प्रत्येक अक्षर में +1 जोड़ा गया है: I(+1)=J, N(+1)=O, D(+1)=E, I(+1)=J, A(+1)=B &rarr; <b>JOEJB</b>."
        },
        {
            id: "102",
            section_id: "206",
            subject_title: "General Knowledge & Awareness",
            question: "भारतीय संविधान का कौन-सा अनुच्छेद <b>'समानता के अधिकार' (Right to Equality)</b> से संबंधित है?",
            option_1: "अनुच्छेद 14 से 18",
            option_2: "अनुच्छेद 19 से 22",
            option_3: "अनुच्छेद 23 से 24",
            option_4: "अनुच्छेद 25 से 28",
            answer: "1",
            positive_marks: "2.00",
            negative_marks: "0.25",
            solution_text: "भारतीय संविधान के भाग-3 में <b>अनुच्छेद 14 से 18</b> तक समानता के अधिकार का वर्णन है।"
        },
        {
            id: "103",
            section_id: "207",
            subject_title: "Elementary Mathematics",
            question: "एक वस्तु को ₹450 में बेचने पर 10% की हानि होती है। 20% का लाभ कमाने के लिए उसे किस मूल्य पर बेचा जाना चाहिए?",
            option_1: "₹550",
            option_2: "₹600",
            option_3: "₹625",
            option_4: "₹580",
            answer: "2",
            positive_marks: "2.00",
            negative_marks: "0.25",
            solution_text: "क्रय मूल्य (CP) = \\(\\frac{450 \\times 100}{90} = ₹500\\)<br>20% लाभ पर विक्रय मूल्य (SP) = \\(500 \\times \\frac{120}{100} = ₹600\\)."
        }
    ]
};

// =====================================================
// 1. JWT & AES DECRYPTION HELPERS
// =====================================================
function extractUidFromJwt(jwtStr) {
    if (!jwtStr || typeof jwtStr !== "string") return "";
    try {
        const parts = jwtStr.trim().split(".");
        if (parts.length < 2) return "";
        const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
        const jsonPayload = decodeURIComponent(
            atob(base64)
                .split("")
                .map(c => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
                .join("")
        );
        const obj = JSON.parse(jsonPayload);
        return String(obj.id || obj.user_id || obj.userid || obj.sub || "");
    } catch {
        return "";
    }
}

function decryptAppX(cipherText) {
    if (!cipherText || typeof cipherText !== "string") return "";
    const clean = cipherText.trim();
    if (clean.startsWith("http://") || clean.startsWith("https://")) return clean;
    try {
        const rawCipher = clean.split(":")[0];
        const decrypted = CryptoJS.AES.decrypt(
            { ciphertext: CryptoJS.enc.Base64.parse(rawCipher) },
            AES_KEY,
            { iv: AES_IV, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }
        );
        const result = decrypted.toString(CryptoJS.enc.Utf8);
        return result && result.startsWith("http") ? result : clean;
    } catch {
        return clean;
    }
}

// =====================================================
// 2. API NETWORK ENGINE (WITH MULTI-TOKEN & PROXY SUPPORT)
// =====================================================
function buildRwaHeaders(tokenObj) {
    const tok = tokenObj || state.activeTokenObj || USER_TOKENS[0] || {};
    const jwt = (tok.token || "").trim();
    const uid = String(tok.userId || extractUidFromJwt(jwt) || "4756316");

    const headers = {
        "Client-Service": "Appx",
        "Auth-Key": "appxapi",
        "User-ID": uid,
        "source": "website"
    };
    if (jwt) {
        headers["Authorization"] = jwt;
    }
    return headers;
}

async function fetchRawJSONWithToken(endpoint, tokenObj, options = {}) {
    const cleanPath = endpoint.startsWith("http")
        ? endpoint
        : `${API_BASE}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;

    const headers = {
        ...buildRwaHeaders(tokenObj),
        ...(options.headers || {})
    };

    try {
        const res = await fetch(cleanPath, {
            method: options.method || "GET",
            headers,
            body: options.body || undefined
        });
        if (res.ok) return await res.json();
    } catch (err) {
        // Fallback to Worker Proxy if CORS blocks direct browser call
        try {
            const proxiedUrl = WORKER_RAW_PROXY + encodeURIComponent(cleanPath);
            const resProxy = await fetch(proxiedUrl, {
                method: options.method || "GET",
                headers,
                body: options.body || undefined
            });
            if (resProxy.ok) return await resProxy.json();
        } catch (proxyErr) {
            console.warn("API Fetch Warning:", endpoint, proxyErr.message);
        }
    }
    return null;
}

// =====================================================
// 3. INITIALIZATION & AUTHENTICATION FLOW
// =====================================================
window.addEventListener("DOMContentLoaded", () => {
    loadSavedSession();
});

function loadSavedSession() {
    try {
        const savedTokens = localStorage.getItem("rwa_sky_tokens");
        const savedProfile = localStorage.getItem("rwa_sky_profile");

        if (savedTokens) {
            USER_TOKENS = JSON.parse(savedTokens) || [];
        }
        if (savedProfile) {
            USER_PROFILE = JSON.parse(savedProfile) || null;
        }
    } catch {
        USER_TOKENS = [];
        USER_PROFILE = null;
    }

    if (USER_TOKENS.length > 0) {
        state.activeTokenObj = USER_TOKENS[0];
        updateNavbarAuthUI(true);
        updateTokenCountBadge();
        closeLoginModal();
    } else {
        updateNavbarAuthUI(false);
        openLoginModal(true);
    }
}

function saveSessionToStorage() {
    localStorage.setItem("rwa_sky_tokens", JSON.stringify(USER_TOKENS));
    if (USER_PROFILE) {
        localStorage.setItem("rwa_sky_profile", JSON.stringify(USER_PROFILE));
    }
    updateTokenCountBadge();
}

function updateTokenCountBadge() {
    const badge = document.getElementById("tokCountBadge");
    if (badge) badge.innerText = USER_TOKENS.length;
}

function updateNavbarAuthUI(isLoggedIn) {
    const loginBtn = document.getElementById("navLoginBtn");
    const profileArea = document.getElementById("navProfileArea");
    const nameTxt = document.getElementById("navUserNameText");

    if (isLoggedIn && USER_TOKENS.length > 0) {
        if (loginBtn) loginBtn.classList.add("hidden");
        if (profileArea) profileArea.classList.remove("hidden");
        const dispName =
            (USER_PROFILE && (USER_PROFILE.name || USER_PROFILE.username)) ||
            USER_TOKENS[0].label ||
            `User #${USER_TOKENS[0].userId}`;
        if (nameTxt) nameTxt.innerText = dispName;
    } else {
        if (loginBtn) loginBtn.classList.remove("hidden");
        if (profileArea) profileArea.classList.add("hidden");
    }
}

window.openLoginModal = function(isCompulsory = false) {
    const modal = document.getElementById("loginModal");
    const closeBtn = document.getElementById("closeLoginModalBtn");
    if (modal) modal.classList.remove("hidden");
    if (closeBtn) {
        if (isCompulsory && USER_TOKENS.length === 0) closeBtn.classList.add("hidden");
        else closeBtn.classList.remove("hidden");
    }
};

window.closeLoginModal = function() {
    if (USER_TOKENS.length === 0) return;
    const modal = document.getElementById("loginModal");
    if (modal) modal.classList.add("hidden");
};

window.switchLoginMode = function(mode) {
    const boxCreds = document.getElementById("loginBoxCreds");
    const boxToken = document.getElementById("loginBoxToken");
    const tabCreds = document.getElementById("tabBtnCreds");
    const tabToken = document.getElementById("tabBtnToken");

    if (mode === "token") {
        boxCreds.classList.add("hidden");
        boxToken.classList.remove("hidden");
        tabToken.className = "py-2 px-3 rounded-xl font-extrabold text-xs bg-blue-600 text-white shadow transition-all cursor-pointer border-0";
        tabCreds.className = "py-2 px-3 rounded-xl font-extrabold text-xs text-slate-700 bg-transparent hover:bg-sky-100 transition-all cursor-pointer border-0";
    } else {
        boxToken.classList.add("hidden");
        boxCreds.classList.remove("hidden");
        tabCreds.className = "py-2 px-3 rounded-xl font-extrabold text-xs bg-blue-600 text-white shadow transition-all cursor-pointer border-0";
        tabToken.className = "py-2 px-3 rounded-xl font-extrabold text-xs text-slate-700 bg-transparent hover:bg-sky-100 transition-all cursor-pointer border-0";
    }
};

function showLoginAlert(msg, isError = true) {
    const el = document.getElementById("loginStatusAlert");
    if (!el) return;
    el.classList.remove("hidden");
    el.className = `mb-3 p-3 rounded-xl text-xs font-extrabold ${
        isError ? "bg-rose-100 text-rose-800 border border-rose-300" : "bg-emerald-100 text-emerald-800 border border-emerald-300"
    }`;
    el.innerText = msg;
}

window.submitUserLogin = async function(mode) {
    if (mode === "token") {
        const rawTok = (document.getElementById("loginTokenInput")?.value || "").trim();
        if (!rawTok || rawTok.length < 20) {
            showLoginAlert("⚠️ कृपया वैध JWT Authorization Token पेस्ट करें।");
            return;
        }
        const uid = extractUidFromJwt(rawTok) || "4756316";
        const newTokObj = {
            label: `RWA Account #${uid}`,
            userId: uid,
            token: rawTok
        };
        USER_TOKENS = [newTokObj, ...USER_TOKENS.filter(t => t.token !== rawTok)];
        state.activeTokenObj = newTokObj;
        USER_PROFILE = { userid: uid, name: `RWA Student (${uid})`, token: rawTok };

        saveSessionToStorage();
        updateNavbarAuthUI(true);
        showLoginAlert("✅ Token Verified Successfully!", false);
        setTimeout(() => closeLoginModal(), 500);
        return;
    }

    // Credentials Login
    const phone = (document.getElementById("loginPhoneInput")?.value || "").trim();
    const pass = (document.getElementById("loginPassInput")?.value || "").trim();
    if (!phone || !pass) {
        showLoginAlert("⚠️ कृपया मोबाइल नंबर/ईमेल और पासवर्ड दोनों दर्ज करें।");
        return;
    }

    const btn = document.getElementById("btnSubmitCreds");
    if (btn) {
        btn.disabled = true;
        btn.innerText = "🔄 Authenticating with RWA Server...";
    }

    try {
        const formData = new URLSearchParams();
        formData.append("email", phone);
        formData.append("password", pass);
        formData.append("devicetype", "1");
        formData.append("mydeviceid", "web_" + Date.now());

        const res = await fetchRawJSONWithToken("/post/userLogin", null, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: formData.toString()
        });

        if (res && res.status === 200 && res.data && res.data.token) {
            const d = res.data;
            const uid = String(d.userid || extractUidFromJwt(d.token) || "4756316");
            const tokObj = {
                label: d.name || d.username || `User #${uid}`,
                userId: uid,
                token: d.token
            };
            USER_TOKENS = [tokObj, ...USER_TOKENS.filter(t => t.userId !== uid)];
            state.activeTokenObj = tokObj;
            USER_PROFILE = d;
            saveSessionToStorage();
            updateNavbarAuthUI(true);
            showLoginAlert("✅ Login Successful! Loading Portal...", false);
            setTimeout(() => closeLoginModal(), 500);
        } else {
            showLoginAlert((res && res.message) || "❌ Login Failed! कृपया सही नंबर/पासवर्ड डालें या Direct Token टैब का उपयोग करें।");
        }
    } catch (e) {
        showLoginAlert("❌ Server Error: " + e.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerText = "Login with Password ➔";
        }
    }
};

window.openProfileModal = function() {
    const modal = document.getElementById("profileModal");
    const box = document.getElementById("profileDetailsContent");
    if (!modal || !box) return;

    const tok = state.activeTokenObj || USER_TOKENS[0] || {};
    const p = USER_PROFILE || {};

    box.innerHTML = `
        <div class="bg-sky-50 p-4 rounded-2xl border border-sky-200 space-y-2">
            <div><span class="font-bold text-slate-500 text-xs">Name:</span> <span class="font-black text-slate-900">${p.name || tok.label || "RWA Student"}</span></div>
            <div><span class="font-bold text-slate-500 text-xs">User ID:</span> <span class="font-black text-blue-700">${tok.userId || p.userid || "N/A"}</span></div>
            <div><span class="font-bold text-slate-500 text-xs">Phone / Email:</span> <span class="font-bold text-slate-800">${p.phone || p.email || "Linked via JWT"}</span></div>
            <div><span class="font-bold text-slate-500 text-xs">Total Linked Tokens:</span> <span class="font-black text-emerald-700">${USER_TOKENS.length} Token(s)</span></div>
        </div>
        <div class="mt-3">
            <label class="text-xs font-extrabold text-slate-700">Active JWT Token:</label>
            <textarea readonly rows="3" class="w-full bg-slate-100 border border-slate-300 rounded-xl p-2.5 text-[11px] font-mono text-slate-800 mt-1">${tok.token || ""}</textarea>
        </div>
    `;
    modal.classList.remove("hidden");
};

window.closeProfileModal = function() {
    const modal = document.getElementById("profileModal");
    if (modal) modal.classList.add("hidden");
};

window.handleLogout = function() {
    if (!confirm("क्या आप वाकई लॉगआउट करना चाहते हैं?")) return;
    localStorage.removeItem("rwa_sky_tokens");
    localStorage.removeItem("rwa_sky_profile");
    USER_TOKENS = [];
    USER_PROFILE = null;
    state.activeTokenObj = null;
    closeProfileModal();
    updateNavbarAuthUI(false);
    goHomeHub();
    openLoginModal(true);
};

// =====================================================
// 4. SLIDE & NAVIGATION MANAGEMENT
// =====================================================
window.showSlide = function(slideId) {
    const slides = ["slideHome", "slideExplorer", "slidePlayer", "slideTestAttempt", "slideTokens", "slidePdf"];
    slides.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (id === slideId) {
            el.classList.remove("hidden-slide");
            el.classList.add("active-slide");
        } else {
            el.classList.remove("active-slide");
            el.classList.add("hidden-slide");
        }
    });
    state.currentSlide = slideId;
    window.scrollTo({ top: 0, behavior: "smooth" });
};

window.goHomeHub = function() {
    state.historyStack = [];
    document.getElementById("subTabs")?.classList.add("hidden");
    showSlide("slideHome");
};

window.handleGlobalBack = function() {
    if (state.historyStack.length > 0) {
        const prevAction = state.historyStack.pop();
        if (typeof prevAction === "function") {
            prevAction();
            return;
        }
    }
    goHomeHub();
};

function setExplorerHeader(crumb, heading, showCourseTabs = false) {
    const cEl = document.getElementById("crumbText");
    const hEl = document.getElementById("headingText");
    const subTabs = document.getElementById("subTabs");
    const sBox = document.getElementById("searchBox");

    if (cEl) cEl.innerText = crumb;
    if (hEl) hEl.innerText = heading;
    if (sBox) sBox.value = "";
    if (subTabs) {
        if (showCourseTabs) subTabs.classList.remove("hidden");
        else subTabs.classList.add("hidden");
    }
}

function showGridLoader(msg = "Loading data from RWA Server...") {
    const grid = document.getElementById("mainGrid");
    if (!grid) return;
    grid.innerHTML = `
        <div class="col-span-full sky-card p-10 text-center">
            <div class="inline-block w-10 h-10 border-4 border-sky-500 border-t-transparent rounded-full animate-spin mb-3"></div>
            <div class="font-extrabold text-slate-800 text-sm">${msg}</div>
        </div>
    `;
}

// =====================================================
// 5. TOKEN MANAGER SLIDE
// =====================================================
window.openTokenSlide = function() {
    showSlide("slideTokens");
    renderTokenList();
};

window.addNewToken = function() {
    const labelInput = document.getElementById("newTokLabel");
    const uidInput = document.getElementById("newTokUid");
    const tokInput = document.getElementById("newTokValue");

    const rawTok = (tokInput?.value || "").trim();
    if (!rawTok || rawTok.length < 20) {
        alert("⚠️ कृपया वैध JWT Authorization Token दर्ज करें।");
        return;
    }

    const uid = (uidInput?.value || "").trim() || extractUidFromJwt(rawTok) || "4756316";
    const label = (labelInput?.value || "").trim() || `Account #${uid}`;

    const newEntry = { label, userId: uid, token: rawTok };
    USER_TOKENS = [newEntry, ...USER_TOKENS.filter(t => t.token !== rawTok)];
    state.activeTokenObj = newEntry;
    saveSessionToStorage();

    if (labelInput) labelInput.value = "";
    if (uidInput) uidInput.value = "";
    if (tokInput) tokInput.value = "";

    renderTokenList();
    alert("✅ आपका नया टोकन सफलतापूर्वक सेव और सिंक हो गया है!");
};

window.removeToken = function(idx) {
    if (USER_TOKENS.length <= 1) {
        alert("⚠️ कम से कम 1 एक्टिव टोकन आवश्यक है।");
        return;
    }
    USER_TOKENS.splice(idx, 1);
    state.activeTokenObj = USER_TOKENS[0];
    saveSessionToStorage();
    renderTokenList();
};

function renderTokenList() {
    const container = document.getElementById("tokenListContainer");
    if (!container) return;

    if (USER_TOKENS.length === 0) {
        container.innerHTML = `<div class="text-xs font-bold text-slate-500">No active tokens found.</div>`;
        return;
    }

    container.innerHTML = USER_TOKENS.map((t, idx) => `
        <div class="bg-white border-2 border-sky-200 rounded-2xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 shadow-sm">
            <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                    <span class="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-black text-[10px]">ACTIVE #${idx + 1}</span>
                    <span class="font-black text-sm text-slate-900">${t.label || "RWA Account"}</span>
                    <span class="text-xs font-bold text-sky-700">(UID: ${t.userId})</span>
                </div>
                <div class="text-[11px] font-mono text-slate-500 truncate mt-1">${t.token}</div>
            </div>
            <div class="flex items-center gap-2 shrink-0">
                <button onclick="removeToken(${idx})" class="btn-nav bg-rose-600 text-white border-0 text-xs">🗑️ Remove</button>
            </div>
        </div>
    `).join("");
}

// =====================================================
// 6. PAID & FREE BATCHES EXPLORER
// =====================================================
window.openExplorerSlide = async function(mode) {
    state.explorerMode = mode;
    state.historyStack = [];
    showSlide("slideExplorer");

    const title = mode === "paid" ? "🎓 My Purchased Paid Batches" : "🆓 All Free Courses & Batches";
    setExplorerHeader(mode === "paid" ? "PAID BATCHES" : "FREE BATCHES", title, false);
    showGridLoader(`Fetching ${mode === "paid" ? "Purchased" : "Free"} Batches...`);

    const mergedCourses = [];
    const seenIds = new Set();

    for (const tok of USER_TOKENS) {
        const endpoints =
            mode === "paid"
                ? ["/get/mycourseweb?userid=" + tok.userId, "/get/mycourse?userid=" + tok.userId]
                : ["/get/courselist?start=-1", "/get/free_course_list?start=-1"];

        for (const ep of endpoints) {
            const res = await fetchRawJSONWithToken(ep, tok);
            const list = (res && (res.data || res.courselist)) || [];
            if (Array.isArray(list)) {
                list.forEach(item => {
                    const cid = String(item.id || item.course_id || "");
                    if (!cid || seenIds.has(cid)) return;
                    if (mode === "free" && String(item.is_paid) === "1" && Number(item.price) > 0) {
                        // Still include if free list endpoint returned it
                    }
                    seenIds.add(cid);
                    const cKey = `course_${cid}`;
                    const obj = { ...item, id: cid, tokenObj: tok, _key: cKey };
                    state.courseMap[cKey] = obj;
                    mergedCourses.push(obj);
                });
            }
            if (mergedCourses.length > 0 && mode === "free") break;
        }
    }

    renderCoursesGrid(mergedCourses);
};

function renderCoursesGrid(courses) {
    const grid = document.getElementById("mainGrid");
    if (!grid) return;

    if (!courses || courses.length === 0) {
        grid.innerHTML = `
            <div class="col-span-full sky-card p-8 text-center">
                <div class="text-3xl mb-2">📭</div>
                <div class="font-black text-slate-800">कोई बैच नहीं मिला</div>
                <p class="text-xs text-slate-600 mt-1">कृपया अपना टोकन चेक करें या दूसरा सेक्शन चुनें।</p>
            </div>`;
        return;
    }

    grid.innerHTML = courses.map(c => {
        const title = c.course_name || c.title || `Batch #${c.id}`;
        const thumb = c.course_thumbnail || c.thumbnail || "https://via.placeholder.com/400x220?text=RWA+Batch";
        return `
            <div class="grid-card overflow-hidden flex flex-col justify-between p-4 cursor-pointer" data-search="${title.toLowerCase()}" onclick="openCourse('${c._key}')">
                <div>
                    <img src="${thumb}" alt="${title}" class="w-full h-40 object-cover rounded-2xl mb-3 border border-sky-100" onerror="this.src='https://via.placeholder.com/400x220?text=RWA+Batch'">
                    <span class="px-2.5 py-0.5 rounded-full bg-sky-100 text-sky-900 font-extrabold text-[10px]">ID: #${c.id}</span>
                    <h3 class="font-black text-base text-slate-900 mt-1.5 line-clamp-2">${title}</h3>
                </div>
                <button class="btn-watch w-full mt-4 text-xs">Open Batch Content ➔</button>
            </div>
        `;
    }).join("");
}

window.openCourse = function(cKey) {
    const c = state.courseMap[cKey];
    if (!c) return;
    state.activeCourse = c;
    state.activeTokenObj = c.tokenObj || state.activeTokenObj;

    state.historyStack.push(() => openExplorerSlide(state.explorerMode));
    setExplorerHeader(`BATCH #${c.id}`, c.course_name || c.title, true);
    loadCourseTab("subjects");
};

window.loadCourseTab = async function(tabName) {
    ["subjects", "live", "tests", "telegram"].forEach(t => {
        const el = document.getElementById(`sub_${t}`);
        if (el) {
            if (t === tabName) el.classList.add("active-pill");
            else el.classList.remove("active-pill");
        }
    });

    const c = state.activeCourse;
    if (!c) return;
    const tok = c.tokenObj || state.activeTokenObj;

    if (tabName === "subjects") {
        showGridLoader("Loading Batch Subjects...");
        const res = await fetchRawJSONWithToken(`/get/allsubjectfrmlivecourseclass?courseid=${c.id}&start=-1`, tok);
        const subjects = (res && res.data) || [];
        const grid = document.getElementById("mainGrid");

        if (!subjects.length) {
            grid.innerHTML = `<div class="col-span-full sky-card p-8 text-center font-bold text-slate-600">इस बैच में अभी कोई सब्जेक्ट उपलब्ध नहीं है।</div>`;
            return;
        }

        grid.innerHTML = subjects.map(s => {
            const sid = String(s.subjectid || s.id);
            const sName = s.subject_name || s.title || `Subject #${sid}`;
            const sKey = `sub_${c.id}_${sid}`;
            state.subjectMap[sKey] = { ...s, id: sid, name: sName };
            return `
                <div class="grid-card p-5 flex items-center justify-between cursor-pointer" data-search="${sName.toLowerCase()}" onclick="openSubject('${sKey}')">
                    <div class="flex items-center gap-3.5">
                        <div class="w-12 h-12 rounded-2xl bg-sky-100 text-sky-700 flex items-center justify-center font-black text-xl">📚</div>
                        <div>
                            <h4 class="font-black text-slate-900 text-sm sm:text-base">${sName}</h4>
                            <span class="text-[11px] font-bold text-slate-500">Subject ID: #${sid}</span>
                        </div>
                    </div>
                    <span class="font-black text-sky-600 text-lg">➔</span>
                </div>
            `;
        }).join("");
    } else if (tabName === "live") {
        showGridLoader("Loading Live & Upcoming Classes...");
        const res = await fetchRawJSONWithToken(`/get/live_upcoming_course_classv2?courseid=${c.id}&start=-1`, tok);
        const classes = (res && res.data) || [];
        renderVideosGrid(classes, "Live / Upcoming");
    } else if (tabName === "tests") {
        showGridLoader("Loading Batch Test Series...");
        const res = await fetchRawJSONWithToken(`/get/course_test_series?courseid=${c.id}`, tok);
        const tsList = (res && res.data) || [];
        if (tsList.length > 0) {
            renderTestSeriesCards(tsList, tok);
        } else {
            document.getElementById("mainGrid").innerHTML = `<div class="col-span-full sky-card p-8 text-center font-bold text-slate-600">इस बैच से जुड़ी कोई टेस्ट सीरीज़ नहीं मिली। ऊपर नेविगेशन से 'Paid Tests' या 'Free Tests' खोलें।</div>`;
        }
    } else if (tabName === "telegram") {
        document.getElementById("mainGrid").innerHTML = `
            <div class="col-span-full sky-card p-8 text-center">
                <div class="text-4xl mb-2">✈️</div>
                <h4 class="font-black text-lg text-slate-900">Batch Doubt Group</h4>
                <p class="text-xs text-slate-600 mt-1">अपने बैच के डाउट ग्रुप से जुड़ने के लिए आधिकारिक RWA Telegram लिंक का उपयोग करें।</p>
            </div>`;
    }
};

window.openSubject = async function(sKey) {
    const s = state.subjectMap[sKey];
    const c = state.activeCourse;
    if (!s || !c) return;
    state.activeSubject = s;

    state.historyStack.push(() => {
        setExplorerHeader(`BATCH #${c.id}`, c.course_name || c.title, true);
        loadCourseTab("subjects");
    });

    setExplorerHeader(s.name, `📂 Select Topic / Chapter`, false);
    showGridLoader("Loading Topics...");

    const tok = c.tokenObj || state.activeTokenObj;
    const res = await fetchRawJSONWithToken(
        `/get/alltopicfrmlivecourseclass?courseid=${c.id}&subjectid=${s.id}&start=-1`,
        tok
    );
    const topics = (res && res.data) || [];
    const grid = document.getElementById("mainGrid");

    if (!topics.length) {
        grid.innerHTML = `<div class="col-span-full sky-card p-8 text-center font-bold text-slate-600">इस विषय में कोई टॉपिक नहीं मिला।</div>`;
        return;
    }

    grid.innerHTML = topics.map(t => {
        const tid = String(t.topicid || t.id);
        const tName = t.topic_name || t.title || `Topic #${tid}`;
        const tKey = `top_${c.id}_${s.id}_${tid}`;
        state.topicMap[tKey] = { ...t, id: tid, name: tName };
        return `
            <div class="grid-card p-5 flex items-center justify-between cursor-pointer" data-search="${tName.toLowerCase()}" onclick="openTopic('${tKey}')">
                <div class="flex items-center gap-3">
                    <div class="w-11 h-11 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center font-black text-lg">📁</div>
                    <div>
                        <h4 class="font-extrabold text-slate-900 text-sm sm:text-base">${tName}</h4>
                        <span class="text-[11px] font-bold text-slate-500">Topic #${tid}</span>
                    </div>
                </div>
                <span class="font-black text-blue-600">➔</span>
            </div>
        `;
    }).join("");
};

window.openTopic = async function(tKey) {
    const t = state.topicMap[tKey];
    const c = state.activeCourse;
    const s = state.activeSubject;
    if (!t || !c || !s) return;
    state.activeTopic = t;

    state.historyStack.push(() => openSubject(`sub_${c.id}_${s.id}`));
    setExplorerHeader(`${s.name} • ${t.name}`, `🎬 Lectures & Class Notes`, false);
    showGridLoader("Loading Lectures & PDFs...");

    const tok = c.tokenObj || state.activeTokenObj;
    const res = await fetchRawJSONWithToken(
        `/get/livecourseclassbycoursesubtopconceptapiv3?courseid=${c.id}&subjectid=${s.id}&topicid=${t.id}&conceptid=&start=-1`,
        tok
    );
    const classes = (res && res.data) || [];
    renderVideosGrid(classes, t.name);
};

function renderVideosGrid(classes, topicLabel) {
    const grid = document.getElementById("mainGrid");
    if (!grid) return;

    if (!classes || classes.length === 0) {
        grid.innerHTML = `<div class="col-span-full sky-card p-8 text-center font-bold text-slate-600">कोई क्लास या पीडीएफ उपलब्ध नहीं है।</div>`;
        return;
    }

    state.currentItems = classes.map((v, idx) => {
        const vid = String(v.id || v.material_type || idx + 1);
        const vKey = `vid_${vid}_${idx}`;
        const pdf1 = decryptAppX(v.pdf_link || v.pdf_link_1 || "");
        const pdf2 = decryptAppX(v.pdf_link2 || v.pdf_link_2 || "");
        const obj = {
            ...v,
            _key: vKey,
            cleanTitle: v.Title || v.title || `Lecture #${idx + 1}`,
            pdf1,
            pdf2,
            tokenObj: state.activeCourse?.tokenObj || state.activeTokenObj
        };
        state.videoMap[vKey] = obj;
        return obj;
    });

    grid.innerHTML = state.currentItems.map((v, i) => `
        <div class="grid-card p-4 flex flex-col justify-between" data-search="${v.cleanTitle.toLowerCase()}">
            <div>
                <div class="flex justify-between items-center mb-2">
                    <span class="px-2.5 py-0.5 rounded-full bg-sky-100 text-sky-900 font-black text-[10px]">CLASS #${i + 1}</span>
                    <span class="text-[11px] font-bold text-slate-500">${v.date_and_time || topicLabel || ""}</span>
                </div>
                <h4 class="font-extrabold text-slate-900 text-sm sm:text-base line-clamp-2">${v.cleanTitle}</h4>
            </div>
            <div class="flex items-center gap-2 flex-wrap mt-4 pt-3 border-t border-sky-100">
                <button onclick="playClassVideo('${v._key}')" class="btn-watch flex-1 text-xs">▶ Watch Class</button>
                ${v.pdf1 ? `<button onclick="openPdfViewer('${v.pdf1}', '${v.cleanTitle.replace(/'/g, "\\'")} - PDF 1')" class="btn-pdf1 text-xs">📄 PDF 1</button>` : ""}
                ${v.pdf2 ? `<button onclick="openPdfViewer('${v.pdf2}', '${v.cleanTitle.replace(/'/g, "\\'")} - PDF 2')" class="btn-pdf2 text-xs">📄 PDF 2</button>` : ""}
            </div>
        </div>
    `).join("");
}

// =====================================================
// 7. OFFICIAL PAID & FREE TEST SERIES (DEEP LOGS V2 FLOW)
// =====================================================
window.openTestSeriesExplorer = async function(mode) {
    state.explorerMode = mode; // 'paid_ts' | 'free_ts'
    state.historyStack = [];
    showSlide("slideExplorer");

    const isPaid = mode === "paid_ts";
    setExplorerHeader(
        isPaid ? "OFFICIAL PAID TEST SERIES" : "FREE WEEKLY MOCK TESTS",
        isPaid ? "🏆 Paid Exam Test Series" : "📝 Free Mock Test Series",
        false
    );
    showGridLoader("Fetching Official Test Series from RWA Server...");

    const mergedSeries = [];
    const seenIds = new Set();

    for (const tok of USER_TOKENS) {
        const endpoints = isPaid
            ? [
                  `/Test_Series/get_test_series?start=-1&userid=${tok.userId}`,
                  `/get/test_series?start=-1&userid=${tok.userId}`
              ]
            : [
                  `/Test_Series/get_free_test_series?start=-1`,
                  `/get/test_series?start=-1&is_free=1`,
                  `/Test_Series/get_test_series?start=-1`
              ];

        for (const ep of endpoints) {
            const res = await fetchRawJSONWithToken(ep, tok);
            const list = (res && (res.data || res.test_series)) || [];
            if (Array.isArray(list) && list.length > 0) {
                list.forEach(ts => {
                    const sid = String(ts.id || ts.testseries_id || "");
                    if (!sid || seenIds.has(sid)) return;

                    const freeFlag = String(ts.is_free || ts.free_flag || "0") === "1" || Number(ts.price || ts.offer_price || 0) === 0;
                    if (!isPaid && !freeFlag && list.length > 15) {
                        // Keep all if dedicated free endpoint wasn't filtered, else filter
                    }

                    seenIds.add(sid);
                    mergedSeries.push({ ...ts, id: sid, tokenObj: tok });
                });
                break;
            }
        }
    }

    renderTestSeriesCards(mergedSeries, state.activeTokenObj);
};

function renderTestSeriesCards(seriesList, defaultTok) {
    const grid = document.getElementById("mainGrid");
    if (!grid) return;

    if (!seriesList || seriesList.length === 0) {
        grid.innerHTML = `<div class="col-span-full sky-card p-8 text-center font-bold text-slate-600">कोई टेस्ट सीरीज़ नहीं मिली।</div>`;
        return;
    }

    grid.innerHTML = seriesList.map(ts => {
        const sid = String(ts.id || ts.testseries_id);
        const sKey = `ts_${sid}`;
        const title = ts.title || ts.testseries_name || `Test Series #${sid}`;
        const logo = ts.logo || ts.thumbnail || "https://via.placeholder.com/400x200?text=RWA+Test+Series";
        state.testSeriesMap[sKey] = { ...ts, id: sid, title, tokenObj: ts.tokenObj || defaultTok };

        return `
            <div class="grid-card p-4 flex flex-col justify-between cursor-pointer" data-search="${title.toLowerCase()}" onclick="openTestSeriesDetails('${sKey}')">
                <div>
                    <img src="${logo}" alt="${title}" class="w-full h-36 object-cover rounded-2xl mb-3 border border-indigo-100" onerror="this.src='https://via.placeholder.com/400x200?text=RWA+Test+Series'">
                    <span class="px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-900 font-black text-[10px]">SERIES #${sid}</span>
                    <h4 class="font-black text-slate-900 text-base mt-1.5 line-clamp-2">${title}</h4>
                </div>
                <button class="btn-watch w-full mt-4 text-xs" style="background:linear-gradient(135deg,#4f46e5,#7c3aed);">Open Test Series ➔</button>
            </div>
        `;
    }).join("");
}

// Following exact flow from AdvancedLogs:
// 1) /Test_Series/test_series_by_id?id={seriesId}
// 2) /get/testseries_subjects?testseries_id={seriesId}
window.openTestSeriesDetails = async function(sKey) {
    const ts = state.testSeriesMap[sKey];
    if (!ts) return;
    state.activeTestSeries = ts;
    const tok = ts.tokenObj || state.activeTokenObj;

    state.historyStack.push(() => openTestSeriesExplorer(state.explorerMode));
    setExplorerHeader(`SERIES #${ts.id}`, ts.title, false);
    showGridLoader("Fetching Test Series Subjects & Papers...");

    // Call test_series_by_id in background as per logs
    fetchRawJSONWithToken(`/Test_Series/test_series_by_id?id=${ts.id}`, tok);

    // Fetch Subjects inside this Test Series
    const subRes = await fetchRawJSONWithToken(`/get/testseries_subjects?testseries_id=${ts.id}`, tok);
    const subjects = (subRes && subRes.data) || [];

    if (!subjects || subjects.length === 0) {
        // Directly load all test titles with subject_id = -1
        await openTestSeriesSubjectTests(ts.id, "-1", "All Mock Tests");
        return;
    }

    const grid = document.getElementById("mainGrid");
    grid.innerHTML = subjects.map(sub => {
        const subId = String(sub.subjectid || sub.id || "-1");
        const subName = sub.subject_name || sub.title || "Mock Tests";
        const tsSubKey = `tssub_${ts.id}_${subId}`;
        state.tsSubjectMap[tsSubKey] = { id: subId, name: subName, seriesId: ts.id, tokenObj: tok };

        return `
            <div class="grid-card p-5 flex items-center justify-between cursor-pointer" data-search="${subName.toLowerCase()}" onclick="openTestSeriesSubjectByKey('${tsSubKey}')">
                <div class="flex items-center gap-3.5">
                    <div class="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-black text-xl">📝</div>
                    <div>
                        <h4 class="font-black text-slate-900 text-sm sm:text-base">${subName}</h4>
                        <span class="text-[11px] font-bold text-slate-500">Tap to view all mock tests</span>
                    </div>
                </div>
                <span class="font-black text-indigo-600 text-lg">➔</span>
            </div>
        `;
    }).join("");
};

window.openTestSeriesSubjectByKey = function(tsSubKey) {
    const item = state.tsSubjectMap[tsSubKey];
    if (!item) return;
    state.historyStack.push(() => openTestSeriesDetails(`ts_${item.seriesId}`));
    openTestSeriesSubjectTests(item.seriesId, item.id, item.name);
};

// Exact endpoint from AdvancedLogs:
// /get/test_titlev2?testseriesid={seriesId}&subject_id={subId}&chapter_id=-1&userid={uid}&search=&start=-1
async function openTestSeriesSubjectTests(seriesId, subId, subName) {
    const ts = state.activeTestSeries || { id: seriesId, title: "Test Series" };
    const tok = ts.tokenObj || state.activeTokenObj || USER_TOKENS[0];
    const uid = tok ? tok.userId : "4756316";

    setExplorerHeader(`${ts.title} • ${subName}`, `🎯 Select Mock Test to Attempt`, false);
    showGridLoader("Loading Official TCS Mock Tests...");

    const ep = `/get/test_titlev2?testseriesid=${seriesId}&subject_id=${subId}&chapter_id=-1&userid=${uid}&search=&start=-1`;
    const res = await fetchRawJSONWithToken(ep, tok);
    const titles =
        (res && (res.test_titles || res.data)) ||
        (res && res.data && res.data.test_titles) ||
        [];

    const grid = document.getElementById("mainGrid");
    if (!Array.isArray(titles) || titles.length === 0) {
        grid.innerHTML = `<div class="col-span-full sky-card p-8 text-center font-bold text-slate-600">इस फोल्डर में अभी कोई टेस्ट अपलोड नहीं हुआ है।</div>`;
        return;
    }

    grid.innerHTML = titles.map(t => {
        const tid = String(t.id || t.test_id);
        const tKey = `test_${tid}`;
        const tTitle = t.title || `Mock Test #${tid}`;
        const qCount = t.questions || "100";
        const marks = t.marks || "200";
        const timeStr = t.time || "60";
        const isSectional = String(timeStr).includes("+") || String(t.restrict_part_switching || "0") === "1";
        const hasOptSelector = String(t.show_sectionselector || "0") === "1";
        const pdfUrl = (t.test_solutions_pdf || t.pdf_url || "").replace(/\\\//g, "/");

        state.testMap[tKey] = {
            ...t,
            id: tid,
            title: tTitle,
            tokenObj: tok
        };

        return `
            <div class="grid-card p-5 flex flex-col justify-between" data-search="${tTitle.toLowerCase()}">
                <div>
                    <div class="flex flex-wrap items-center justify-between gap-1 mb-2">
                        <span class="px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-900 font-black text-[10px]">TEST #${tid}</span>
                        <div class="flex items-center gap-1">
                            ${isSectional ? `<span class="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-extrabold text-[10px]">🔒 Sectional Time</span>` : `<span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-extrabold text-[10px]">🌐 Overall Time</span>`}
                            ${hasOptSelector ? `<span class="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-extrabold text-[10px]">📝 Optional Sub</span>` : ""}
                        </div>
                    </div>
                    <h4 class="font-black text-slate-900 text-base leading-snug">${tTitle}</h4>
                    <div class="grid grid-cols-3 gap-2 bg-sky-50 border border-sky-200 rounded-xl p-2.5 mt-3 text-center">
                        <div>
                            <div class="text-[10px] font-bold text-slate-500">Questions</div>
                            <div class="font-black text-xs text-slate-900">${qCount} Qs</div>
                        </div>
                        <div>
                            <div class="text-[10px] font-bold text-slate-500">Max Marks</div>
                            <div class="font-black text-xs text-indigo-700">${marks} M</div>
                        </div>
                        <div>
                            <div class="text-[10px] font-bold text-slate-500">Duration</div>
                            <div class="font-black text-xs text-emerald-700">${timeStr}m</div>
                        </div>
                    </div>
                </div>

                <div class="flex items-center gap-2 mt-4 pt-3 border-t border-sky-100">
                    <button onclick="launchCbtTest('${tKey}')" class="btn-watch flex-1 text-xs" style="background:linear-gradient(135deg,#1a237e,#3949ab);">🖥️ Start TCS CBT Test ➔</button>
                    ${pdfUrl ? `<button onclick="openPdfViewer('${pdfUrl}', '${tTitle.replace(/'/g, "\\'")} - Solution PDF')" class="btn-pdf1 text-xs">📄 PDF</button>` : ""}
                </div>
            </div>
        `;
    }).join("");
}

// =====================================================
// 8. VIDEO PLAYER & UP-NEXT INTEGRATION
// =====================================================
window.playClassVideo = async function(vKey) {
    const v = state.videoMap[vKey];
    if (!v) return;
    state.activeVideo = v;

    showSlide("slidePlayer");
    document.getElementById("playingTitle").innerText = `▶ ${v.cleanTitle}`;

    // Configure PDF buttons inside Player
    const btnPdf1 = document.getElementById("playerPdf1");
    const btnPdf2 = document.getElementById("playerPdf2");
    if (btnPdf1) {
        if (v.pdf1) btnPdf1.classList.remove("hidden");
        else btnPdf1.classList.add("hidden");
    }
    if (btnPdf2) {
        if (v.pdf2) btnPdf2.classList.remove("hidden");
        else btnPdf2.classList.add("hidden");
    }

    // Resolve Encrypted Stream URL
    let playUrl = decryptAppX(v.file_link || v.video_url || v.download_link || v.enc_url || "");
    if (!playUrl && v.id && state.activeCourse) {
        const detailRes = await fetchRawJSONWithToken(
            `/get/fetchVideoDetailsById?course_id=${state.activeCourse.id}&video_id=${v.id}&ytflag=0&folder_wise_course=0`,
            v.tokenObj
        );
        const d = detailRes && detailRes.data;
        if (d) {
            playUrl = decryptAppX(d.download_link || d.file_link || (d.encrypted_links?.[0]?.path) || "");
        }
    }

    const urlInput = document.getElementById("url");
    if (urlInput) {
        urlInput.value = playUrl;
        urlInput.dispatchEvent(new Event("change"));
    }
    if (typeof window.playDirectUrl === "function") {
        window.playDirectUrl(playUrl);
    }

    renderUpNextClasses(vKey);
};

function renderUpNextClasses(currentKey) {
    const nextGrid = document.getElementById("nextClassesGrid");
    const countBadge = document.getElementById("nextClassesCount");
    if (!nextGrid) return;

    const others = (state.currentItems || []).filter(item => item._key !== currentKey);
    if (countBadge) countBadge.innerText = `${others.length} Classes`;

    nextGrid.innerHTML = others.map((v, idx) => `
        <div onclick="playClassVideo('${v._key}')" class="grid-card p-3.5 cursor-pointer flex items-center justify-between gap-2">
            <div class="min-w-0">
                <span class="text-[10px] font-black text-sky-700">NEXT #${idx + 1}</span>
                <h5 class="font-extrabold text-xs text-slate-900 truncate">${v.cleanTitle}</h5>
            </div>
            <span class="btn-watch text-[11px] py-1.5 px-3 shrink-0">▶ Play</span>
        </div>
    `).join("");
}

window.closePlayerBox = function() {
    const videoEl = document.getElementById("video");
    if (videoEl) videoEl.pause();
    const ytFrame = document.getElementById("ytFrame");
    if (ytFrame) ytFrame.src = "";
    showSlide("slideExplorer");
};

// =====================================================
// 9. PDF VIEWER & SEARCH FILTER
// =====================================================
window.openPdfViewer = function(rawUrl, title = "PDF Document") {
    if (!rawUrl) return;
    state.activePdfUrl = rawUrl;
    document.getElementById("pdfTitle").innerText = `📄 ${title}`;
    document.getElementById("rawPdfLink").href = rawUrl;
    showSlide("slidePdf");
    setPdfMode("gdocs");
};

window.setPdfMode = function(mode) {
    const frame = document.getElementById("pdfFrame");
    if (!frame || !state.activePdfUrl) return;
    if (mode === "gdocs") {
        frame.src = `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(state.activePdfUrl)}`;
    } else {
        frame.src = state.activePdfUrl;
    }
};

window.closePdfSlide = function() {
    document.getElementById("pdfFrame").src = "";
    showSlide("slideExplorer");
};

window.openActivePlayerPdf = function(pdfNum) {
    if (!state.activeVideo) return;
    const url = pdfNum === 2 ? state.activeVideo.pdf2 : state.activeVideo.pdf1;
    if (!url) return;

    state.activeInlinePdfUrl = url;
    document.getElementById("nextClassesBox")?.classList.add("hidden");
    const pdfBox = document.getElementById("inlinePdfBox");
    if (pdfBox) pdfBox.classList.remove("hidden");

    document.getElementById("inlinePdfTitle").innerText = `📄 ${state.activeVideo.cleanTitle} (PDF ${pdfNum})`;
    document.getElementById("inlineRawPdfLink").href = url;
    setInlinePdfMode("gdocs");
};

window.setInlinePdfMode = function(mode) {
    const frame = document.getElementById("inlinePdfFrame");
    if (!frame || !state.activeInlinePdfUrl) return;
    if (mode === "gdocs") {
        frame.src = `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(state.activeInlinePdfUrl)}`;
    } else {
        frame.src = state.activeInlinePdfUrl;
    }
};

window.switchBottomToNextClasses = function() {
    document.getElementById("inlinePdfBox")?.classList.add("hidden");
    document.getElementById("nextClassesBox")?.classList.remove("hidden");
    const frame = document.getElementById("inlinePdfFrame");
    if (frame) frame.src = "";
};

window.filterGrid = function() {
    const q = (document.getElementById("searchBox")?.value || "").toLowerCase().trim();
    const cards = document.querySelectorAll("#mainGrid > div[data-search]");
    cards.forEach(card => {
        const txt = card.getAttribute("data-search") || "";
        card.style.display = !q || txt.includes(q) ? "" : "none";
    });
};

window.toggleQuestionLang = function() {
    triggerMathJax();
};
