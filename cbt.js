// =========================================================
// RWA SKY PORTAL - DEEP TEST JSON PARSER & TCS CBT ENGINE (cbt.js)
// =========================================================

let testData = [];
let originalTestData = [];
let apiDataRef = null;
let currentSecIdx = 0;
let currentQIdx = 0;
let timerInterval = null;
let timeRemaining = 60 * 60;
let qStartTime = Date.now();
let currentFilter = "all";
let allQsFlat = [];
let currentFlatIdx = 0;
let testMode = "overall";
let isTimerActive = true;
let drawerViewMode = "grid";

// Global tracker for selected optional subjects (e.g., Hindi vs English)
window.selectedOptionalSubjects = {};

// Known RWA / AppX Section ID to Subject Name Mapping (from Deep Logs Analysis)
const RWA_SECTION_MAP = {
    "206": "General Knowledge & General Awareness",
    "207": "Elementary Mathematics",
    "208": "General Intelligence & Reasoning",
    "209": "English (Optional)",
    "210": "Hindi (Optional)",
    "211": "Quantitative Aptitude",
    "212": "Logical Reasoning",
    "213": "General Science",
    "214": "Computer Knowledge",
    "215": "UP GK & Current Affairs",
    "216": "Numerical & Mental Ability",
    "217": "Full Mock Test"
};

// =====================================================
// HELPER UTILITIES (MATHJAX, HTML CLEANER, IMAGE CHECK)
// =====================================================
function isImageUrl(url) {
    if (!url) return false;
    const str = url.toString().trim();
    if (str.startsWith("<")) return false;
    return (
        str.startsWith("http://") ||
        str.startsWith("https://") ||
        /\.(jpeg|jpg|gif|png|webp|svg)(\?.*)?$/i.test(str)
    );
}

function cleanRwaHtml(rawHtml) {
    if (!rawHtml) return "";
    let s = String(rawHtml);
    // Remove redundant embedded <style> blocks & outer html/head/body wrappers from AppX JSON
    s = s.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
    s = s.replace(/<\/?(html|head|body)[^>]*>/gi, "");
    // Convert raw LaTeX fractions to MathJax inline format
    s = s.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, "\\(\\frac{$1}{$2}\\)");
    return s.trim();
}

function triggerMathJax() {
    if (window.MathJax && window.MathJax.typesetPromise) {
        window.MathJax.typesetPromise().catch(err => console.warn("MathJax error:", err.message));
    }
}

function hideAllTcsScreens() {
    const container = document.getElementById("tcsAppContainer");
    if (!container) return;
    Array.from(container.children).forEach(el => el.classList.add("hidden"));
}

// =====================================================
// DEEP TEST JSON ANALYZER (SECTIONS, MARKING, TIMING, OPTIONALS)
// =====================================================
function parseSectionTimings(timeStr) {
    if (timeStr === undefined || timeStr === null) return { isSectional: false, totalMinutes: 60, secTimes: [] };
    const raw = String(timeStr).trim();
    if (raw.includes("+")) {
        const parts = raw.split("+").map(n => parseFloat(n.trim()) || 15);
        const sum = parts.reduce((a, b) => a + b, 0);
        return { isSectional: true, totalMinutes: sum, secTimes: parts };
    }
    const mins = parseFloat(raw);
    return {
        isSectional: false,
        totalMinutes: isNaN(mins) ? 60 : mins,
        secTimes: []
    };
}

function normalizeSingleQuestion(rawQ, idx, defaultPos, defaultNeg) {
    // Extract Question Text & Images
    let qText = cleanRwaHtml(rawQ.question || rawQ.text || "");
    const qImages = [rawQ.image_link_1, rawQ.image_link_2, rawQ.image_link_3, rawQ.image_link]
        .filter(u => u && String(u).trim().startsWith("http"));

    // Extract Options (Supports both option_1..4 and options: [{option, option_image}] formats)
    let optionsList = [];
    if (Array.isArray(rawQ.options) && rawQ.options.length > 0) {
        rawQ.options.forEach(optItem => {
            if (typeof optItem === "object" && optItem !== null) {
                let optHtml = cleanRwaHtml(optItem.option || optItem.text || "");
                if (optItem.option_image && String(optItem.option_image).startsWith("http")) {
                    optHtml += `<br><img src="${optItem.option_image}" style="max-height:90px; margin-top:6px;">`;
                }
                optionsList.push(optHtml || "Option");
            } else {
                optionsList.push(cleanRwaHtml(optItem));
            }
        });
    } else {
        for (let i = 1; i <= 10; i++) {
            const optTxt = cleanRwaHtml(rawQ[`option_${i}`] || "");
            const optImg = rawQ[`option_image_${i}`] || "";
            if (optTxt || optImg) {
                let combined = optTxt;
                if (optImg && String(optImg).startsWith("http")) {
                    combined += (combined ? "<br>" : "") + `<img src="${optImg}" style="max-height:90px; margin-top:6px;">`;
                }
                optionsList.push(combined);
            } else if (i <= 4 && optionsList.length < i) {
                // Keep at least 4 options if standard 4-option MCQ has empty text placeholder
                if (rawQ[`option_${i}`] !== undefined && i <= 4 && (rawQ.option_1 || rawQ.option_2)) {
                    optionsList.push(`Option ${String.fromCharCode(64 + i)}`);
                }
            }
        }
    }

    // Correct Answer Index (0-based for TCS engine, converted from 1-based AppX "answer": "1".."4")
    let correctIdx = 0;
    if (rawQ.correct !== undefined && rawQ.correct !== null) {
        correctIdx = parseInt(rawQ.correct, 10) || 0;
    } else if (rawQ.answer !== undefined && rawQ.answer !== null) {
        const ansNum = parseInt(String(rawQ.answer).trim(), 10);
        correctIdx = !isNaN(ansNum) && ansNum >= 1 ? ansNum - 1 : 0;
    }

    // Positive & Negative Marks per Question
    const posMarks =
        rawQ.positive_marks !== undefined && rawQ.positive_marks !== ""
            ? parseFloat(rawQ.positive_marks)
            : defaultPos;
    const negMarks =
        rawQ.negative_marks !== undefined && rawQ.negative_marks !== ""
            ? parseFloat(rawQ.negative_marks)
            : defaultNeg;

    // Solution Text & Solution Images
    let expHtml = cleanRwaHtml(rawQ.solution_text || rawQ.exp || "");
    const solImages = [rawQ.solution_image_1, rawQ.solution_image_2, rawQ.exp_image_link]
        .filter(u => u && String(u).trim().startsWith("http"));
    solImages.forEach(imgUrl => {
        if (!expHtml.includes(imgUrl)) {
            expHtml += `<br><img src="${imgUrl}" style="max-width:100%; margin-top:10px; display:block; border-radius:4px;">`;
        }
    });
    if (!expHtml) {
        expHtml = `<p>सही उत्तर: <b>विकल्प (${String.fromCharCode(65 + correctIdx)})</b></p>`;
    }

    return {
        id: String(rawQ.id || rawQ.question_id || idx + 1),
        text: qText,
        image_link: qImages[0] || "",
        extra_images: qImages.slice(1),
        options: optionsList.length > 0 ? optionsList : ["Option A", "Option B", "Option C", "Option D"],
        correct: correctIdx,
        posMarks: isNaN(posMarks) ? defaultPos : posMarks,
        negMarks: isNaN(negMarks) ? defaultNeg : negMarks,
        exp: expHtml,
        section_id: String(rawQ.section_id || ""),
        subject_title: String(rawQ.subject_title || rawQ.subject || rawQ.part_title || "").trim(),
        userAns: null,
        status: "not_visited",
        time: 0
    };
}

function analyzeAndBuildTestSections(rawPayload, testMeta) {
    const tMeta = testMeta || {};
    const timeInfo = parseSectionTimings(tMeta.time);
    const totalMetaMarks = parseFloat(tMeta.marks) || 100;
    const totalMetaQs = parseInt(tMeta.questions, 10) || 100;

    const showSecSelector = String(tMeta.show_sectionselector || "0") === "1";
    const minSections = parseInt(tMeta.minimumsection, 10) || 0;
    const maxSections = parseInt(tMeta.maximumsection, 10) || 0;
    const restrictSwitching = String(tMeta.restrict_part_switching || "0") === "1";

    // Default marking fallback if question doesn't specify
    let defaultPos = totalMetaQs > 0 ? +(totalMetaMarks / totalMetaQs).toFixed(2) : 2.0;
    let defaultNeg = 0.25;

    let builtSections = [];

    // CASE 1: Payload already has `test_sections` (like in attempt.json log 48060)
    const rawSectionsArr =
        (rawPayload && Array.isArray(rawPayload.test_sections) && rawPayload.test_sections) ||
        (rawPayload && rawPayload.attempt && Array.isArray(rawPayload.attempt.test_sections) && rawPayload.attempt.test_sections) ||
        null;

    if (rawSectionsArr && rawSectionsArr.length > 0) {
        rawSectionsArr.forEach((secObj, sIdx) => {
            const secId = String(secObj.section_id || sIdx + 1);
            const secTitle =
                (secObj.section_title || secObj.part_title || RWA_SECTION_MAP[secId] || `Section ${sIdx + 1}`).trim();
            const isOpt = String(secObj.is_optional || "0") === "1";
            const secFixedTime = String(secObj.fixed_timing || "0") === "1";
            if (secFixedTime) timeInfo.isSectional = true;

            const qs = (secObj.questions || []).map((q, qIdx) =>
                normalizeSingleQuestion(q, qIdx, defaultPos, defaultNeg)
            );

            builtSections.push({
                section_id: secId,
                section: secTitle,
                is_optional_flag: isOpt,
                optional_group: "",
                time: timeInfo.secTimes[sIdx] || Math.max(5, Math.round(timeInfo.totalMinutes / rawSectionsArr.length)),
                questions: qs
            });
        });
    }
    // CASE 2: Payload is already in tcs.html grouped format `[{ section: "...", questions: [...] }]`
    else if (Array.isArray(rawPayload) && rawPayload.length > 0 && Array.isArray(rawPayload[0].questions)) {
        rawPayload.forEach((secObj, sIdx) => {
            const qs = (secObj.questions || []).map((q, qIdx) =>
                normalizeSingleQuestion(q, qIdx, defaultPos, defaultNeg)
            );
            builtSections.push({
                section_id: String(secObj.section_id || sIdx + 1),
                section: secObj.section || secObj.section_title || `Section ${sIdx + 1}`,
                is_optional_flag: Boolean(secObj.optional_group),
                optional_group: secObj.optional_group || "",
                time: secObj.time || timeInfo.secTimes[sIdx] || 15,
                questions: qs
            });
        });
    }
    // CASE 3: Standard RWA `test_questions_url` flat array of question objects
    else {
        const flatList = Array.isArray(rawPayload)
            ? rawPayload
            : (rawPayload && Array.isArray(rawPayload.questions) ? rawPayload.questions : DB.fallbackCbtQuestions);

        // Group questions by section_id or subject_title preserving order
        const groupMap = new Map();
        flatList.forEach((rawQ, idx) => {
            const normQ = normalizeSingleQuestion(rawQ, idx, defaultPos, defaultNeg);
            const groupKey = normQ.subject_title || normQ.section_id || "default_sec";
            if (!groupMap.has(groupKey)) {
                groupMap.set(groupKey, []);
            }
            groupMap.get(groupKey).push(normQ);
        });

        // Special SSC GD / 5-Section Pattern Detection:
        // If all 100 questions had the exact same section_id in flat JSON, but `show_sectionselector == "1"` and `minimumsection == 4`
        if (groupMap.size === 1 && showSecSelector && minSections === 4 && flatList.length === 100) {
            const allNormalized = Array.from(groupMap.values())[0];
            const sscGdLayout = [
                { id: "208", title: "General Intelligence & Reasoning", opt: "" },
                { id: "206", title: "General Knowledge & Awareness", opt: "" },
                { id: "207", title: "Elementary Mathematics", opt: "" },
                { id: "209", title: "English", opt: "Language Selection (Choose Any 1)" },
                { id: "210", title: "Hindi", opt: "Language Selection (Choose Any 1)" }
            ];
            sscGdLayout.forEach((layout, sIdx) => {
                builtSections.push({
                    section_id: layout.id,
                    section: layout.title,
                    is_optional_flag: Boolean(layout.opt),
                    optional_group: layout.opt,
                    time: timeInfo.secTimes[sIdx] || 15,
                    questions: allNormalized.slice(sIdx * 20, (sIdx + 1) * 20)
                });
            });
        } else {
            let sIdx = 0;
            groupMap.forEach((qArr, key) => {
                let secName = "";
                if (RWA_SECTION_MAP[key]) {
                    secName = RWA_SECTION_MAP[key];
                } else if (key !== "default_sec" && isNaN(Number(key))) {
                    secName = key;
                } else if (groupMap.size === 1) {
                    secName = tMeta.title || "Full Mock Test";
                } else {
                    secName = `Part ${String.fromCharCode(65 + sIdx)} (Section #${key})`;
                }

                builtSections.push({
                    section_id: String(key),
                    section: secName,
                    is_optional_flag: false,
                    optional_group: "",
                    time: timeInfo.secTimes[sIdx] || Math.max(5, Math.round(timeInfo.totalMinutes / groupMap.size)),
                    questions: qArr
                });
                sIdx++;
            });
        }
    }

    // =====================================================
    // SMART OPTIONAL SUBJECT DETECTION (HINDI / ENGLISH / SSC PATTERN)
    // =====================================================
    const hasExplicitOptionalGroup = builtSections.some(s => s.optional_group && s.optional_group.trim() !== "");

    if (!hasExplicitOptionalGroup && builtSections.length > 1) {
        // 1. Check if any sections are named Hindi / English / Language or have section_id 209 & 210 when showSecSelector is active or 5 sections exist
        const langSections = builtSections.filter(s => {
            const n = s.section.toLowerCase();
            return (
                s.section_id === "209" ||
                s.section_id === "210" ||
                n.includes("hindi") ||
                n.includes("english") ||
                n.includes("हिंदी") ||
                n.includes("अंग्रेजी")
            );
        });

        if (langSections.length >= 2 && (showSecSelector || builtSections.length >= 5)) {
            langSections.forEach(s => {
                s.optional_group = "Optional Language (Select Any 1)";
                s.is_optional_flag = true;
            });
        }
        // 2. Or if show_sectionselector == "1" and minimumsection == 4 with 5 sections total
        else if (showSecSelector && minSections === 4 && builtSections.length === 5) {
            builtSections[3].optional_group = "Optional Subject (Select Any 1)";
            builtSections[4].optional_group = "Optional Subject (Select Any 1)";
            builtSections[3].is_optional_flag = true;
            builtSections[4].is_optional_flag = true;
        }
        // 3. Or if specific sections have `is_optional: "1"` (and not all sections are marked optional)
        else {
            const optFlagged = builtSections.filter(s => s.is_optional_flag);
            if (optFlagged.length >= 2 && optFlagged.length < builtSections.length) {
                optFlagged.forEach(s => {
                    s.optional_group = "Optional Subject (Select Any 1)";
                });
            }
        }
    }

    // Determine Final Test Mode (Sectional vs Overall)
    const finalMode = timeInfo.isSectional || restrictSwitching ? "sectional" : "overall";

    // Determine representative Pos / Neg marks from the first question
    const firstQ = builtSections[0] && builtSections[0].questions && builtSections[0].questions[0];
    const repPos = firstQ ? firstQ.posMarks : defaultPos;
    const repNeg = firstQ ? firstQ.negMarks : defaultNeg;

    return {
        sections: builtSections,
        testMode: finalMode,
        totalMinutes: timeInfo.totalMinutes,
        secTimes: timeInfo.secTimes,
        pos: repPos,
        neg: repNeg,
        metaMarks: totalMetaMarks
    };
}

// =====================================================
// LAUNCH CBT TEST FROM WEBSITE CARD (NO URL ID FETCH NEEDED)
// =====================================================
window.launchCbtTest = async function(tKey) {
    const t = state.testMap[tKey];
    if (!t) return;

    state.cbtTest = t;
    state.cbtSubmitted = false;
    if (timerInterval) clearInterval(timerInterval);

    const testTok = t.tokenObj || state.activeTokenObj || USER_TOKENS[0];
    state.activeTokenObj = testTok;

    // Open Full Page TCS Slide
    showSlide("slideTestAttempt");
    hideAllTcsScreens();
    document.getElementById("start-screen").classList.remove("hidden");

    // Set Initial Loading UI on Start Card
    const titleHeading = document.getElementById("tcs-test-title-heading");
    const seriesTag = document.getElementById("tcs-series-tag");
    const startBtn = document.getElementById("tcs-main-start-btn");
    const subContainer = document.getElementById("subjects-selection-container");

    if (titleHeading) titleHeading.innerText = t.title || "(TCS Pattern) Mock Test";
    if (seriesTag) seriesTag.innerText = `${t.ui_type || "TCS"} CBT • TEST #${t.id || "LIVE"}`;
    if (startBtn) {
        startBtn.innerText = "🔄 Loading Test & Analyzing Sections...";
        startBtn.disabled = true;
    }
    if (subContainer) {
        subContainer.innerHTML = `<div style="text-align:center; padding:18px; color:#555; font-size:13px; font-weight:bold;">Fetching official question paper & marking scheme...</div>`;
    }

    // Fire Official RWA Attempt Check & Saved Questions APIs (Exact Old Website Logs Flow)
    const uid = testTok ? (testTok.userId || extractUidFromJwt(testTok.token) || "4756316") : "4756316";
    fetchRawJSONWithToken(`/Test_Series/check_test_attempts?test_id=${t.id}&user_id=${uid}`, testTok);
    fetchRawJSONWithToken(`/Test_Series/getSavedQuestions?start=0`, testTok);

    // Fetch Questions JSON from `test_questions_url`
    let rawQuestionsJson = null;
    const qUrl = (t.test_questions_url || "").replace(/\\\//g, "/").trim();

    if (qUrl && qUrl.startsWith("http")) {
        try {
            const res = await fetch(qUrl);
            if (res.ok) rawQuestionsJson = await res.json();
        } catch {
            try {
                const proxiedRes = await fetch(WORKER_RAW_PROXY + encodeURIComponent(qUrl));
                if (proxiedRes.ok) rawQuestionsJson = await proxiedRes.json();
            } catch (e) {
                console.warn("Proxy test fetch failed:", e);
            }
        }
    }

    if (!rawQuestionsJson || (Array.isArray(rawQuestionsJson) && rawQuestionsJson.length === 0)) {
        rawQuestionsJson = DB.fallbackCbtQuestions;
    }

    // Deep Analyze JSON for Sections, Optional Subjects, Marking & Timing
    const parsed = analyzeAndBuildTestSections(rawQuestionsJson, t);
    apiDataRef = {
        ...t,
        time: parsed.totalMinutes,
        pos: parsed.pos,
        neg: parsed.neg,
        test_mode: parsed.testMode
    };
    originalTestData = parsed.sections;
    testMode = parsed.testMode;

    // Render Compulsory & Optional Subject Cards on Start Screen
    window.selectedOptionalSubjects = {};
    let optionalGroups = {};
    let compulsorySubjects = [];

    originalTestData.forEach(sec => {
        if (sec.optional_group && sec.optional_group.trim() !== "") {
            const gName = sec.optional_group.trim();
            if (!optionalGroups[gName]) optionalGroups[gName] = [];
            optionalGroups[gName].push(sec);
        } else {
            compulsorySubjects.push(sec);
        }
    });

    let subjectHtml = `
        <div style="font-weight:bold; color:#1a237e; border-bottom: 2px solid #e8eaf6; padding-bottom: 8px; margin-bottom: 12px; font-size: 14px; display: flex; align-items: center; justify-content: space-between;">
            <span>📚 Subjects & Sections in this Test:</span>
            <span style="font-size:11px; color:#555;">${originalTestData.length} Sections</span>
        </div>
        <div>
    `;

    // 1. Render Compulsory Fixed Subjects
    compulsorySubjects.forEach(sec => {
        const qCount = sec.questions ? sec.questions.length : 0;
        const firstQ = sec.questions && sec.questions[0];
        const secPos = firstQ ? firstQ.posMarks : parsed.pos;
        const timeTag = testMode === "sectional" ? ` • ⏱️ ${sec.time}m` : "";
        subjectHtml += `
        <div class="sub-card fixed">
            <span class="sub-name"><span class="fixed-icon">✅</span> ${sec.section}</span>
            <span class="sub-badge">${qCount} Qs (${(qCount * secPos).toFixed(0)}M${timeTag})</span>
        </div>`;
    });

    // 2. Render Clickable Optional Subject Cards (e.g. Hindi or English)
    for (let group in optionalGroups) {
        window.selectedOptionalSubjects[group] = optionalGroups[group][0].section;

        subjectHtml += `
        <div class="opt-group">
            <div class="opt-group-title">📝 ${group}:</div>
        `;

        optionalGroups[group].forEach((sec, idx) => {
            const qCount = sec.questions ? sec.questions.length : 0;
            const firstQ = sec.questions && sec.questions[0];
            const secPos = firstQ ? firstQ.posMarks : parsed.pos;
            const isSelectedClass = idx === 0 ? "selected" : "";
            const safeGroup = group.replace(/'/g, "\\'");
            const safeSec = sec.section.replace(/'/g, "\\'");

            subjectHtml += `
            <div class="sub-card opt-card ${isSelectedClass}" onclick="selectOptionalSubject(this, '${safeGroup}', '${safeSec}')">
                <span class="sub-name"><span class="check-icon">✓</span>${sec.section}</span>
                <span class="sub-badge">${qCount} Qs (${(qCount * secPos).toFixed(0)}M)</span>
            </div>`;
        });

        subjectHtml += `</div>`;
    }

    subjectHtml += `</div>`;
    if (subContainer) subContainer.innerHTML = subjectHtml;

    updateStartStatsUI();

    if (startBtn) {
        startBtn.innerText = "Start Test ➔";
        startBtn.disabled = false;
    }
};

window.selectOptionalSubject = function(element, group, secName) {
    const groupContainer = element.parentElement;
    const cards = groupContainer.querySelectorAll(".opt-card");
    cards.forEach(c => c.classList.remove("selected"));

    element.classList.add("selected");
    window.selectedOptionalSubjects[group] = secName;

    updateStartStatsUI();
};

function updateStartStatsUI() {
    const selectedOptionals = Object.values(window.selectedOptionalSubjects || {});

    let totalQs = 0;
    let calcSectionTimeSum = 0;
    let totalMaxMarks = 0;

    originalTestData.forEach(sec => {
        if (sec.optional_group && sec.optional_group.trim() !== "") {
            if (!selectedOptionals.includes(sec.section)) return;
        }
        const qList = sec.questions || [];
        totalQs += qList.length;
        calcSectionTimeSum += sec.time !== undefined ? Number(sec.time) : 15;
        qList.forEach(q => {
            totalMaxMarks += Number(q.posMarks) || 2;
        });
    });

    const overallMins = apiDataRef && apiDataRef.time ? Number(apiDataRef.time) : calcSectionTimeSum;
    isTimerActive = overallMins > 0;

    const dbPos = apiDataRef && apiDataRef.pos !== undefined ? Number(apiDataRef.pos) : 2;
    const dbNeg = apiDataRef && apiDataRef.neg !== undefined ? Number(apiDataRef.neg) : 0.25;

    document.getElementById("stat-qs").innerText = `${totalQs} Questions`;
    document.getElementById("stat-time").innerText = isTimerActive
        ? (testMode === "overall" ? `${overallMins} Mins` : `${calcSectionTimeSum} Mins (Sectional)`)
        : "No Time Limit";
    document.getElementById("stat-marks").innerText = `${totalMaxMarks.toFixed(0)} Marks`;
    document.getElementById("stat-marking").innerText = `+${dbPos.toFixed(2)} / -${dbNeg.toFixed(2)}`;
    document.getElementById("stat-mode").innerText =
        testMode === "sectional" ? "🔒 Sectional Timing" : "🌐 Overall Timing (Free Switch)";
}

// =====================================================
// STEP 2: START LIVE TEST & SECTION NAVIGATION
// =====================================================
window.startTest = function() {
    const elem = document.documentElement;
    if (elem.requestFullscreen) {
        elem.requestFullscreen().catch(() => {});
    } else if (elem.webkitRequestFullscreen) {
        elem.webkitRequestFullscreen();
    }

    const selectedOptionals = Object.values(window.selectedOptionalSubjects || {});

    testData = [];
    let totalSecTime = 0;

    originalTestData.forEach(sec => {
        if (sec.optional_group && sec.optional_group.trim() !== "") {
            if (!selectedOptionals.includes(sec.section)) return;
        }

        const secCopy = JSON.parse(JSON.stringify(sec));
        if (secCopy.questions) {
            secCopy.questions.forEach(q => {
                q.userAns = null;
                q.status = "not_visited";
                q.time = 0;
            });
        }
        testData.push(secCopy);
        totalSecTime += secCopy.time !== undefined ? Number(secCopy.time) : 15;
    });

    if (testMode === "overall") {
        const mins = apiDataRef && apiDataRef.time !== undefined ? Number(apiDataRef.time) : totalSecTime;
        timeRemaining = mins * 60;
    } else {
        timeRemaining = (Number(testData[0]?.time) || 15) * 60;
    }

    hideAllTcsScreens();
    document.getElementById("live-test-screen").classList.remove("hidden");

    const timerDisp = document.getElementById("tcs-timer-display");
    const timerLbl = document.getElementById("timer-lbl");
    const submitDynBtn = document.getElementById("btn-submit-dynamic");

    if (!isTimerActive) {
        if (timerDisp && timerDisp.parentElement) timerDisp.parentElement.style.display = "none";
    } else {
        if (timerDisp && timerDisp.parentElement) timerDisp.parentElement.style.display = "flex";
        if (testMode === "sectional") {
            if (timerLbl) timerLbl.innerText = "Sec Time";
            if (submitDynBtn) submitDynBtn.innerText = "Submit Sec";
        } else {
            if (timerLbl) timerLbl.innerText = "Time Left";
            if (submitDynBtn) submitDynBtn.innerText = "Submit Quiz";
        }
    }

    loadSection(0);
    startTimer();
};

window.loadSection = function(sIdx) {
    currentSecIdx = sIdx;
    currentQIdx = 0;

    if (testMode === "sectional") {
        timeRemaining = (Number(testData[sIdx]?.time) || 15) * 60;
    }

    renderTabs();
    loadQuestion(sIdx, 0);
};

function formatTcsTimer(totalSecs) {
    const safeSecs = Math.max(0, Math.floor(totalSecs));
    const h = Math.floor(safeSecs / 3600);
    const m = Math.floor((safeSecs % 3600) / 60);
    const s = safeSecs % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    if (!isTimerActive) return;

    const display = document.getElementById("tcs-timer-display");
    if (display) display.innerText = formatTcsTimer(timeRemaining);

    timerInterval = setInterval(() => {
        timeRemaining--;
        if (display) {
            display.innerText = formatTcsTimer(timeRemaining);
            display.style.color = timeRemaining < 60 ? "#ff5252" : "#ffffff";
        }

        const elapsed = Math.floor((Date.now() - qStartTime) / 1000);
        const curQ = testData[currentSecIdx]?.questions?.[currentQIdx];
        const totalQSecs = (curQ ? curQ.time : 0) + elapsed;
        const m = Math.floor(totalQSecs / 60);
        const s = totalQSecs % 60;
        const qTimeEl = document.getElementById("tcs-q-time");
        if (qTimeEl) {
            qTimeEl.innerText = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
        }

        if (timeRemaining <= 0) {
            if (testMode === "sectional") {
                alert("⏰ इस सेक्शन का समय समाप्त हुआ! अगला सेक्शन लोड हो रहा है।");
                if (currentSecIdx < testData.length - 1) {
                    loadSection(currentSecIdx + 1);
                } else {
                    prepareSubmit();
                }
            } else {
                clearInterval(timerInterval);
                prepareSubmit();
            }
        }
    }, 1000);
}

function renderTabs() {
    let html = "";
    testData.forEach((sec, idx) => {
        const isActive = idx === currentSecIdx ? "active" : "";
        if (testMode === "sectional") {
            const isLocked = idx !== currentSecIdx ? "locked" : "";
            html += `<div class="tcs-tab ${isActive} ${isLocked}" id="tab-${idx}">${sec.section}</div>`;
        } else {
            html += `<div class="tcs-tab ${isActive}" id="tab-${idx}" onclick="loadSection(${idx})">${sec.section}</div>`;
        }
    });
    const tabsBox = document.getElementById("tcs-tabs-container");
    if (tabsBox) tabsBox.innerHTML = html;

    setTimeout(() => {
        const activeTab = document.getElementById(`tab-${currentSecIdx}`);
        if (activeTab) activeTab.scrollIntoView({ behavior: "smooth", inline: "center" });
    }, 80);
}

function updateQuestionTime() {
    if (!testData[currentSecIdx] || !testData[currentSecIdx].questions[currentQIdx]) return;
    const elapsed = Math.max(0, Math.floor((Date.now() - qStartTime) / 1000));
    testData[currentSecIdx].questions[currentQIdx].time += elapsed;
    qStartTime = Date.now();
}

window.loadQuestion = function(secIdx, qIdx) {
    updateQuestionTime();
    currentSecIdx = secIdx;
    currentQIdx = qIdx;

    const q = testData[secIdx].questions[qIdx];
    if (q.status === "not_visited") q.status = "not_answered";

    document.getElementById("tcs-q-num").innerText = qIdx + 1;

    // Update Per-Question Positive & Negative Marks in Info Bar
    const posEl = document.getElementById("tcs-live-pos");
    const negEl = document.getElementById("tcs-live-neg");
    if (posEl) posEl.innerText = `+${Number(q.posMarks || 2).toFixed(2)}`;
    if (negEl) negEl.innerText = `-${Number(q.negMarks || 0).toFixed(2)}`;

    // Build Question HTML + Attached Images
    let qHtml = q.text || "";
    if (q.image_link && !qHtml.includes(q.image_link)) {
        qHtml += `<br><img src="${q.image_link}" style="max-width:100%; margin-top:10px; display:block; border-radius:4px;">`;
    }
    if (Array.isArray(q.extra_images)) {
        q.extra_images.forEach(img => {
            if (img && !qHtml.includes(img)) {
                qHtml += `<br><img src="${img}" style="max-width:100%; margin-top:10px; display:block; border-radius:4px;">`;
            }
        });
    }
    document.getElementById("tcs-q-text").innerHTML = qHtml || "Question";

    // Build Options HTML
    let optionsHtml = "";
    const optPrefix = ["A", "B", "C", "D", "E", "F"];
    q.options.forEach((opt, i) => {
        const isSel = q.userAns === i ? "selected" : "";
        const optContent = isImageUrl(opt)
            ? `<img src="${opt}" style="max-height:100px; max-width:100%; display:block; margin:4px 0; border-radius:4px;">`
            : opt;
        optionsHtml += `
            <div class="tcs-option ${isSel}" onclick="selectOption(${i})">
                <span class="tcs-opt-lbl">${optPrefix[i] || i + 1}.</span>
                <div style="flex:1;">${optContent}</div>
            </div>`;
    });
    document.getElementById("tcs-options-container").innerHTML = optionsHtml;

    triggerMathJax();
};

window.selectOption = function(optIndex) {
    const q = testData[currentSecIdx].questions[currentQIdx];
    // Single-option select (clicking again keeps it selected; Clear Response button clears it)
    q.userAns = optIndex;
    loadQuestion(currentSecIdx, currentQIdx);
};

window.saveAndNext = function() {
    const q = testData[currentSecIdx].questions[currentQIdx];
    if (q.userAns !== null) q.status = "answered";
    else if (q.status !== "marked") q.status = "not_answered";
    nextQuestion();
};

window.markForReview = function() {
    testData[currentSecIdx].questions[currentQIdx].status = "marked";
    nextQuestion();
};

window.clearResponse = function() {
    const q = testData[currentSecIdx].questions[currentQIdx];
    q.userAns = null;
    q.status = "not_answered";
    loadQuestion(currentSecIdx, currentQIdx);
};

window.nextQuestion = function() {
    if (currentQIdx < testData[currentSecIdx].questions.length - 1) {
        loadQuestion(currentSecIdx, currentQIdx + 1);
    } else {
        if (testMode === "overall") {
            if (currentSecIdx < testData.length - 1) {
                loadSection(currentSecIdx + 1);
            } else {
                prepareSubmit();
            }
        } else {
            alert("यह इस सेक्शन का आखिरी प्रश्न है। अगले सेक्शन में जाने के लिए 'Submit Sec' पर क्लिक करें।");
        }
    }
};

window.prevQuestion = function() {
    if (currentQIdx > 0) {
        loadQuestion(currentSecIdx, currentQIdx - 1);
    } else if (testMode === "overall" && currentSecIdx > 0) {
        const prevSec = currentSecIdx - 1;
        currentSecIdx = prevSec;
        renderTabs();
        loadQuestion(prevSec, testData[prevSec].questions.length - 1);
    }
};

// =====================================================
// TCS SLIDE-OUT QUESTION PALETTE DRAWER
// =====================================================
window.toggleTcsPalette = function() {
    const drawer = document.getElementById("tcs-palette");
    if (!drawer) return;
    if (drawer.classList.contains("show")) {
        drawer.classList.remove("show");
    } else {
        renderTcsDrawer();
        drawer.classList.add("show");
    }
};

window.switchDrawerView = function(mode) {
    drawerViewMode = mode;
    const tabGrid = document.getElementById("dr-tab-grid");
    const tabList = document.getElementById("dr-tab-list");
    if (mode === "list") {
        if (tabList) { tabList.classList.add("active"); tabList.style.fontWeight = "bold"; }
        if (tabGrid) { tabGrid.classList.remove("active"); tabGrid.style.fontWeight = "normal"; }
    } else {
        if (tabGrid) { tabGrid.classList.add("active"); tabGrid.style.fontWeight = "bold"; }
        if (tabList) { tabList.classList.remove("active"); tabList.style.fontWeight = "normal"; }
    }
    renderTcsDrawer();
};

function renderTcsDrawer() {
    let html = "";
    testData.forEach((sec, sIdx) => {
        let counts = { ans: 0, notAns: 0, marked: 0, notVis: 0 };
        let itemsHtml = "";

        sec.questions.forEach((q, qIdx) => {
            let cls = "st-not-ans";
            if (q.status === "answered") {
                cls = "st-ans";
                counts.ans++;
            } else if (q.status === "not_answered") {
                cls = "st-not-ans";
                counts.notAns++;
            } else if (q.status === "marked") {
                cls = q.userAns !== null ? "st-mark-ans" : "st-mark";
                counts.marked++;
            } else {
                cls = "st-not-ans";
                counts.notVis++;
            }

            if (drawerViewMode === "list") {
                const plainPreview = (q.text || "Question").replace(/<[^>]*>/g, " ").trim().slice(0, 55);
                itemsHtml += `
                    <div onclick="jumpToQ(${sIdx}, ${qIdx})" style="grid-column: 1 / -1; display:flex; align-items:center; gap:10px; padding:6px; border-bottom:1px solid #f0f0f0; cursor:pointer;">
                        <div class="tcs-q-box ${cls}" style="flex-shrink:0;">${qIdx + 1}</div>
                        <div style="font-size:12px; color:#333; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${plainPreview}...</div>
                    </div>`;
            } else {
                itemsHtml += `<div class="tcs-q-box ${cls}" onclick="jumpToQ(${sIdx}, ${qIdx})">${qIdx + 1}</div>`;
            }
        });

        const isOpen = sIdx === currentSecIdx ? "open" : "";

        html += `
        <div class="tcs-accordion">
            <div class="tcs-acc-header" onclick="toggleAcc(${sIdx})">
                <span>${sec.section}</span>
                <span id="arr-${sIdx}">${isOpen ? "▲" : "▼"}</span>
            </div>
            <div class="tcs-acc-stats">
                <span><div class="tcs-circ c-marked" style="width:10px;height:10px;margin-right:2px;"></div> ${String(counts.marked).padStart(2, "0")}</span>
                <span><div class="tcs-circ c-attempt" style="width:10px;height:10px;margin-right:2px;"></div> ${String(counts.ans).padStart(2, "0")}</span>
                <span><div class="tcs-circ c-unattempt" style="width:10px;height:10px;margin-right:2px;"></div> ${String(counts.notAns + counts.notVis).padStart(2, "0")}</span>
            </div>
            <div class="tcs-q-grid ${isOpen}" id="acc-grid-${sIdx}">${itemsHtml}</div>
        </div>`;
    });

    const container = document.getElementById("tcs-accordion-container");
    if (container) container.innerHTML = html;
}

window.toggleAcc = function(idx) {
    if (testMode === "sectional" && idx !== currentSecIdx) return;
    const grid = document.getElementById(`acc-grid-${idx}`);
    const arr = document.getElementById(`arr-${idx}`);
    if (!grid) return;
    if (grid.classList.contains("open")) {
        grid.classList.remove("open");
        if (arr) arr.innerText = "▼";
    } else {
        grid.classList.add("open");
        if (arr) arr.innerText = "▲";
    }
};

window.jumpToQ = function(sIdx, qIdx) {
    if (testMode === "sectional" && sIdx !== currentSecIdx) {
        alert("🔒 सेक्शनल टाइमिंग मोड में आप दूसरे सेक्शन में जंप नहीं कर सकते।");
        return;
    }
    toggleTcsPalette();
    if (sIdx !== currentSecIdx) {
        currentSecIdx = sIdx;
        renderTabs();
    }
    loadQuestion(sIdx, qIdx);
};

// =====================================================
// STEP 3: SUBMIT CONFIRMATION SCREEN
// =====================================================
window.handleDynamicSubmit = function() {
    if (testMode === "sectional") {
        if (currentSecIdx < testData.length - 1) {
            if (confirm("क्या आप वाकई इस सेक्शन को सबमिट करके अगले सेक्शन में जाना चाहते हैं? आप इस सेक्शन में वापस नहीं आ पाएंगे।")) {
                loadSection(currentSecIdx + 1);
            }
        } else {
            prepareSubmit();
        }
    } else {
        prepareSubmit();
    }
};

window.prepareSubmit = function() {
    updateQuestionTime();
    hideAllTcsScreens();
    document.getElementById("submit-screen").classList.remove("hidden");

    let html = "";
    testData.forEach(sec => {
        let ans = 0, marked = 0, notVis = 0, notAns = 0;
        sec.questions.forEach(q => {
            if (q.status === "answered") ans++;
            else if (q.status === "marked") marked++;
            else if (q.status === "not_visited") notVis++;
            else notAns++;
        });
        html += `
            <div class="section-summary-card">
                <h2 style="margin-bottom:12px; font-size:16px; color:#1a237e;">${sec.section}</h2>
                <div class="stat-row"><span>Number of Questions</span> <strong>${sec.questions.length}</strong></div>
                <div class="stat-row"><span>Answered</span> <strong style="color:#2e7d32;">${ans}</strong></div>
                <div class="stat-row"><span>Marked for Review</span> <strong style="color:#f57f17;">${marked}</strong></div>
                <div class="stat-row"><span>Not Answered</span> <strong style="color:#c62828;">${notAns}</strong></div>
                <div class="stat-row"><span>Not Visited</span> <strong>${notVis}</strong></div>
            </div>`;
    });
    document.getElementById("submit-summary-container").innerHTML = html;
};

window.closeSubmit = function() {
    hideAllTcsScreens();
    document.getElementById("live-test-screen").classList.remove("hidden");
    qStartTime = Date.now();
};

function formatTime(sec) {
    const sTotal = Math.max(0, Math.round(sec));
    if (sTotal === 0) return "0s";
    const m = Math.floor(sTotal / 60);
    const s = sTotal % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

// =====================================================
// STEP 4: SUBMIT TEST & FULL ANALYSIS SCREEN
// =====================================================
window.submitTest = async function() {
    if (timerInterval) clearInterval(timerInterval);
    state.cbtSubmitted = true;

    hideAllTcsScreens();
    document.getElementById("analysis-screen").classList.remove("hidden");

    if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
    }

    let tC = 0, tI = 0, tU = 0;
    let totalCorrectTime = 0, totalIncTime = 0, totalUnattTime = 0;
    let totalMarksEarned = 0, totalMaxMarksPossible = 0;
    let secHtml = "";
    allQsFlat = [];
    let globalQNum = 1;
    let weakAreas = [];

    testData.forEach((sec, sIdx) => {
        let c = 0, inc = 0, u = 0, cT = 0, incT = 0, uT = 0;
        let secScore = 0;

        sec.questions.forEach((q, qIdx) => {
            const qPos = Number(q.posMarks) || 2;
            const qNeg = Number(q.negMarks) || 0;
            totalMaxMarksPossible += qPos;

            let qState = "unattempted";
            if (q.userAns === null || q.userAns === undefined) {
                u++;
                uT += q.time;
            } else if (Number(q.userAns) === Number(q.correct)) {
                c++;
                cT += q.time;
                secScore += qPos;
                qState = "correct";
            } else {
                inc++;
                incT += q.time;
                secScore -= qNeg;
                qState = "incorrect";
            }

            const simTopperTime = Math.max(6, Math.floor(Math.random() * 18) + 10);

            allQsFlat.push({
                ...q,
                secName: sec.section,
                globalNum: globalQNum++,
                state: qState,
                secIdx: sIdx,
                qIdx: qIdx,
                topperTime: simTopperTime
            });
        });

        tC += c;
        tI += inc;
        tU += u;
        totalCorrectTime += cT;
        totalIncTime += incT;
        totalUnattTime += uT;
        totalMarksEarned += secScore;

        secHtml += `
            <div class="a-card">
                <div class="subj-header">
                    <div class="subj-name">${sec.section}</div>
                    <div class="black-circle"><span>Marks</span><span>${secScore.toFixed(2)}</span></div>
                </div>
                <div class="subj-q-stats">Section Question Stats</div>
                <div class="time-split">
                    <div class="col"><div class="c-green">Correct</div><div class="val-num c-green">${c}</div><div class="val-time">In ${formatTime(cT)}</div></div>
                    <div class="col"><div class="c-red">Incorrect</div><div class="val-num c-red">${inc}</div><div class="val-time">In ${formatTime(incT)}</div></div>
                    <div class="col"><div class="c-grey">Unattempted</div><div class="val-num c-grey">${u}</div><div class="val-time">In ${formatTime(uT)}</div></div>
                </div>
            </div>`;

        const totalSecQs = c + inc + u;
        const secAcc = totalSecQs > 0 ? (c / totalSecQs) * 100 : 0;
        if (secAcc < 50) {
            weakAreas.push(`${sec.section} (Score: ${secScore.toFixed(2)} • Accuracy: ${secAcc.toFixed(1)}%)`);
        }
    });

    const weakCard = document.getElementById("weak-areas-card");
    const weakList = document.getElementById("weak-areas-list");
    if (weakCard && weakList) {
        weakCard.style.display = "block";
        if (weakAreas.length > 0) {
            weakCard.style.background = "#ffebee";
            weakCard.style.borderColor = "#ffcdd2";
            weakCard.querySelector("h3").innerText = "⚠️ Weak Subjects to Improve";
            weakCard.querySelector("h3").style.color = "#c62828";
            weakList.innerHTML = weakAreas.map(w => `<li style="color:#b71c1c;">${w}</li>`).join("");
        } else {
            weakCard.style.background = "#e8f5e9";
            weakCard.style.borderColor = "#c8e6c9";
            weakCard.querySelector("h3").innerText = "🌟 Excellent Work!";
            weakCard.querySelector("h3").style.color = "#2e7d32";
            weakList.innerHTML = `<li style="color:#1b5e20;">You have strong accuracy across all subjects! Keep it up!</li>`;
        }
    }

    const totalQs = Math.max(1, tC + tI + tU);
    const finalMarks = Math.max(0, totalMarksEarned);
    const maxMarks = totalMaxMarksPossible > 0 ? totalMaxMarksPossible : totalQs * 2;
    const acc = tC + tI > 0 ? ((tC / (tC + tI)) * 100).toFixed(2) : "0.00";

    const percentage = maxMarks <= 0 ? 0 : (finalMarks / maxMarks) * 100;
    const remarkBox = document.getElementById("dynamic-remark");
    if (remarkBox) {
        remarkBox.style.display = "block";
        if (percentage >= 85) {
            remarkBox.className = "remark-banner rem-excellent";
            remarkBox.innerHTML = "🏆 Exceptional! Topper Material";
        } else if (percentage >= 70) {
            remarkBox.className = "remark-banner rem-great";
            remarkBox.innerHTML = "🔥 Great Going! Keep it up";
        } else if (percentage >= 50) {
            remarkBox.className = "remark-banner rem-good";
            remarkBox.innerHTML = "👍 Good, but needs improvement";
        } else {
            remarkBox.className = "remark-banner rem-poor";
            remarkBox.innerHTML = "⚠️ Needs Serious Practice! Don't give up";
        }
    }

    let topperScore = (maxMarks * 0.91).toFixed(2);
    if (finalMarks > parseFloat(topperScore)) topperScore = finalMarks.toFixed(2);
    const avgScore = (maxMarks * 0.48).toFixed(2);

    const percentile =
        finalMarks <= 0
            ? "0.0"
            : Math.min(99.9, (finalMarks / maxMarks) * 100 + Math.random() * 4).toFixed(1);
    const rank =
        finalMarks <= 0
            ? Math.floor(Math.random() * 5000) + 12000
            : Math.max(1, Math.floor((100 - parseFloat(percentile)) * 95) + 1);

    const topC = Math.floor(totalQs * 0.91);
    const topW = Math.floor(totalQs * 0.04);
    const avgC = Math.floor(totalQs * 0.48);
    const avgW = Math.floor(totalQs * 0.22);

    document.getElementById("res-score").innerText = `${finalMarks.toFixed(2)}/${maxMarks.toFixed(0)}`;
    document.getElementById("res-correct").innerText = tC;
    document.getElementById("res-incorrect").innerText = tI;
    document.getElementById("res-unatt").innerText = tU;
    document.getElementById("res-acc").innerText = `${acc}%`;
    document.getElementById("res-rank").innerText = rank;
    document.getElementById("res-perc").innerText = `${percentile}%`;

    document.getElementById("cmp-score").innerText = finalMarks.toFixed(2);
    document.getElementById("cmp-acc").innerText = `${acc}%`;
    document.getElementById("cmp-c").innerText = tC;
    document.getElementById("cmp-w").innerText = tI;
    document.getElementById("cmp-top").innerText = topperScore;
    document.getElementById("cmp-avg").innerText = avgScore;
    document.getElementById("cmp-top-c").innerText = topC;
    document.getElementById("cmp-avg-c").innerText = avgC;
    document.getElementById("cmp-top-w").innerText = topW;
    document.getElementById("cmp-avg-w").innerText = avgW;

    // Update Time Stats Boxes with Real Time Spent
    const tsCorr = document.getElementById("ts-box-corr");
    const tsUna = document.getElementById("ts-box-una");
    const tsInc = document.getElementById("ts-box-inc");
    if (tsCorr) tsCorr.innerHTML = `Correct<br>${formatTime(totalCorrectTime)}`;
    if (tsUna) tsUna.innerHTML = `Unattempted (${formatTime(totalUnattTime)})`;
    if (tsInc) tsInc.innerHTML = `Incorrect<br>${formatTime(totalIncTime)}`;

    const pC = (tC / totalQs) * 100;
    const pI = (tI / totalQs) * 100;
    const donut = document.getElementById("res-donut");
    if (donut) {
        donut.style.background = `conic-gradient(#4caf50 0% ${pC}%, #e53935 ${pC}% ${pC + pI}%, #5c6bc0 ${pC + pI}% 100%)`;
    }

    document.getElementById("analysis-sections-container").innerHTML = secHtml;

    // Save Scorecard to Backend API
    await saveScorecardToAPI({
        testId: state.cbtTest?.id || "rwa_test",
        testName: state.cbtTest?.title || "RWA Mock Test",
        totalQuestions: totalQs,
        attempted: tC + tI,
        correct: tC,
        wrong: tI,
        unattempted: tU,
        marks: Number(finalMarks.toFixed(2)),
        maxMarks: Number(maxMarks.toFixed(2)),
        percentage: Number(percentage.toFixed(2)),
        accuracy: Number(acc),
        timeTaken: totalCorrectTime + totalIncTime + totalUnattTime
    });
};

// =====================================================
// SCORECARD MONGODB SYNC (FROM TCS.HTML)
// =====================================================
async function getOrCreateUniqueUserId() {
    if (typeof USER_PROFILE !== "undefined" && USER_PROFILE && (USER_PROFILE.userid || USER_PROFILE.id)) {
        return String(USER_PROFILE.userid || USER_PROFILE.id);
    }
    const STORAGE_KEY = "uniqueUserId";
    let userId = localStorage.getItem(STORAGE_KEY) || "";
    if (!userId) {
        const randomPart = (Date.now().toString(36) + Math.random().toString(36).slice(2)).toUpperCase();
        userId = "USR_" + randomPart;
        localStorage.setItem(STORAGE_KEY, userId);
    }
    return userId;
}

async function saveScorecardToAPI(scorecard) {
    try {
        const userId = await getOrCreateUniqueUserId();
        if (!userId || !scorecard || !scorecard.testId) return;

        const payload = {
            ...scorecard,
            userId: String(userId),
            uid: String(userId),
            testId: String(scorecard.testId),
            test: String(scorecard.testId)
        };

        await fetch("https://scorecard-t8d7.onrender.com/api/submit-score", {
            method: "POST",
            mode: "cors",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
    } catch (e) {
        console.warn("Scorecard sync skipped:", e.message);
    }
}

// =====================================================
// STEP 5 & STEP 6: SOLUTIONS LIST & FULL SOLUTION VIEW
// =====================================================
window.openSolutions = function() {
    hideAllTcsScreens();
    document.getElementById("solutions-screen").classList.remove("hidden");
    renderSolutions();
};

window.closeSolutions = function() {
    hideAllTcsScreens();
    document.getElementById("analysis-screen").classList.remove("hidden");
};

window.filterSol = function(type, btn) {
    document.querySelectorAll("#solutions-screen .flt-btn").forEach(b => b.classList.remove("flt-active"));
    if (btn) btn.classList.add("flt-active");
    currentFilter = type;
    renderSolutions();
};

function renderSolutions() {
    let html = "";
    allQsFlat.forEach((q, idx) => {
        if (currentFilter !== "all" && q.state !== currentFilter) return;

        let iconStr = "−", iconCls = "st-una";
        if (q.state === "correct") {
            iconStr = "✓";
            iconCls = "st-corr";
        } else if (q.state === "incorrect") {
            iconStr = "✕";
            iconCls = "st-wr";
        }

        const solQText = q.text || "";
        const solQImg =
            q.image_link && !solQText.includes(q.image_link)
                ? `<br><img src="${q.image_link}" style="max-width: 100%; max-height: 80px; display: block; margin-top: 5px; border-radius: 4px;">`
                : "";
        const displayContent = solQText + solQImg || "Question";

        html += `
            <div class="sol-item">
                <div class="sol-num-col">
                    <div class="sol-num">${q.globalNum}<div class="sol-status-icon ${iconCls}">${iconStr}</div></div>
                    <div class="sol-line"></div>
                </div>
                <div class="sol-card">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                        <div class="sol-sec-badge" style="margin-bottom:0;">${q.secName}</div>
                        <span style="font-size:11px; font-weight:bold; color:#666;">+${q.posMarks} / -${q.negMarks}</span>
                    </div>
                    <div class="sol-q-txt">${displayContent}</div>
                    <button class="tcs-btn tcs-btn-submit" style="padding:10px 14px; border-radius:8px; background: #1a237e; border-color: #1a237e; width:auto;" onclick="openFullSolution(${idx})">See Full Solution ➔</button>
                </div>
            </div>`;
    });

    if (!html) {
        html = `<div style="text-align:center; padding:40px 16px; color:#666; font-weight:bold;">No questions found in "${currentFilter}" filter.</div>`;
    }

    document.getElementById("sol-list-container").innerHTML = html;
    triggerMathJax();
}

window.openFullSolution = function(flatIdx) {
    currentFlatIdx = flatIdx;
    hideAllTcsScreens();
    document.getElementById("full-sol-screen").classList.remove("hidden");
    renderFullSolution();
};

window.closeFullSol = function() {
    hideAllTcsScreens();
    document.getElementById("solutions-screen").classList.remove("hidden");
};

function renderFullSolution() {
    const q = allQsFlat[currentFlatIdx];
    if (!q) return;

    document.getElementById("fs-q-num").innerText = `Question ${q.globalNum} (${q.secName})`;

    const youTimeColor = q.time > q.topperTime ? "tc-alert" : "tc-good";
    document.getElementById("fs-q-time-compare").innerHTML = `
        <div class="time-compare-badge">
            <span class="tc-you ${youTimeColor}">⏱️ You: ${q.time}s</span>
            <span style="color:#ccc;">|</span>
            <span class="tc-topper">👑 Topper: ${q.topperTime}s</span>
        </div>`;

    let fsQHtml = q.text || "";
    if (q.image_link && !fsQHtml.includes(q.image_link)) {
        fsQHtml += `<br><img src="${q.image_link}" style="max-width:100%; margin-top:10px; display:block; border-radius:4px;">`;
    }
    if (Array.isArray(q.extra_images)) {
        q.extra_images.forEach(img => {
            if (img && !fsQHtml.includes(img)) {
                fsQHtml += `<br><img src="${img}" style="max-width:100%; margin-top:10px; display:block; border-radius:4px;">`;
            }
        });
    }
    document.getElementById("fs-q-txt").innerHTML = fsQHtml || "Question";

    let optHtml = "";
    const optPrefix = ["A", "B", "C", "D", "E", "F"];
    q.options.forEach((opt, i) => {
        let cls = "";
        let rightTxt = "";
        if (i === Number(q.correct)) {
            cls = "correct";
            rightTxt = `<span class="fs-opt-perc">✓ Correct</span>`;
        } else if (i === q.userAns && q.userAns !== Number(q.correct)) {
            cls = "wrong";
            rightTxt = `<span class="fs-opt-perc" style="color:#e53935;">✕ Your Ans</span>`;
        }

        const optContent = isImageUrl(opt)
            ? `<img src="${opt}" style="max-height:80px; max-width:100%; display:block; border-radius:4px;">`
            : opt;

        optHtml += `
            <div class="fs-opt ${cls}">
                <div style="display:flex; align-items:center; flex:1;">
                    <span style="font-weight:bold; margin-right:10px;">${optPrefix[i] || i + 1}.</span>
                    <div style="flex:1;">${optContent}</div>
                </div>
                ${rightTxt}
            </div>`;
    });
    document.getElementById("fs-options-container").innerHTML = optHtml;

    document.getElementById("fs-exp-text").innerHTML = q.exp || "No detailed explanation available.";

    triggerMathJax();
}

window.nextFullSol = function() {
    if (currentFlatIdx < allQsFlat.length - 1) {
        currentFlatIdx++;
        renderFullSolution();
    } else {
        closeFullSol();
    }
};

window.prevFullSol = function() {
    if (currentFlatIdx > 0) {
        currentFlatIdx--;
        renderFullSolution();
    } else {
        closeFullSol();
    }
};

window.reAttemptTcsTest = function() {
    if (timerInterval) clearInterval(timerInterval);
    hideAllTcsScreens();
    document.getElementById("start-screen").classList.remove("hidden");
    updateStartStatsUI();
};

window.exitCbtTest = function() {
    if (timerInterval) clearInterval(timerInterval);
    if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
    }
    showSlide("slideExplorer");
};
