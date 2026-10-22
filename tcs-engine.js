// =========================================================
// RWA SKY PORTAL - DEDICATED TCS CBT MOCK TEST ENGINE (tcs-engine.js)
// =========================================================

let tcsState = {
    activeTestKey: null,
    testMeta: null,
    questions: [],
    currentQIdx: 0,
    responses: {}, // qId -> { chosenOption, status: 'unattempted'|'attempted'|'marked'|'marked_attempted', timeSpent: 0 }
    sections: [],
    activeSectionIndex: 0,
    timerInterval: null,
    secondsLeft: 0,
    isSubmitted: false,
    lang: "en", // 'en' or 'hi'
    selectedOptionalSubject: null
};

window.launchTcsCbtEngine = async function(tKey) {
    const t = state.testMap[tKey];
    if (!t) return;

    tcsState.activeTestKey = tKey;
    tcsState.testMeta = t;
    tcsState.isSubmitted = false;
    tcsState.responses = {};
    tcsState.currentQIdx = 0;
    tcsState.activeSectionIndex = 0;
    tcsState.selectedOptionalSubject = null;

    showSlide("slideTestAttempt");
    
    // Switch to Start Screen
    document.getElementById("start-screen").classList.remove("tcs-hidden");
    document.getElementById("live-test-screen").classList.add("tcs-hidden");
    document.getElementById("submit-screen").classList.add("tcs-hidden");
    document.getElementById("analysis-screen").classList.add("tcs-hidden");
    document.getElementById("solutions-screen").classList.add("tcs-hidden");
    document.getElementById("full-sol-screen").classList.add("tcs-hidden");

    document.getElementById("tcs-start-title").textContent = t.title || "TCS Pattern Mock Test";
    document.getElementById("tcs-series-tag").textContent = `SERIES #${t.seriesId || "708"} • CBT MODE`;

    // Fetch Questions JSON
    let rawQUrl = t.test_questions_url || t.questions_url || "";
    if (rawQUrl) rawQUrl = rawQUrl.replace(/\\\//g, "/");

    let loadedQuestions = [];
    if (rawQUrl) {
        try {
            const res = await fetch(rawQUrl);
            const json = await res.json();
            if (Array.isArray(json)) loadedQuestions = json;
            else if (json.data && Array.isArray(json.data)) loadedQuestions = json.data;
            else if (json.questions && Array.isArray(json.questions)) loadedQuestions = json.questions;
        } catch (e) {
            console.warn("CBT JSON fetch direct error, trying proxy...", e);
            try {
                const proxyRes = await fetch(WORKER_RAW_PROXY + encodeURIComponent(rawQUrl));
                const proxyJson = await proxyRes.json();
                if (Array.isArray(proxyJson)) loadedQuestions = proxyJson;
                else if (proxyJson.data && Array.isArray(proxyJson.data)) loadedQuestions = proxyJson.data;
            } catch {}
        }
    }

    if (!loadedQuestions || loadedQuestions.length === 0) {
        loadedQuestions = DB.fallbackCbtQuestions;
    }

    tcsState.questions = loadedQuestions;

    // Parse Sections & Metadata
    parseTestSectionsAndSetup();

    document.getElementById("stat-qs").textContent = tcsState.questions.length;
    document.getElementById("stat-marks").textContent = t.marks || (tcsState.questions.length * 2);
    
    let timeStr = String(t.time || "60");
    document.getElementById("stat-time").textContent = timeStr.includes("+") ? `${timeStr} Mins (Sectional)` : `${timeStr} Mins`;
    document.getElementById("stat-mode").textContent = timeStr.includes("+") ? "Sectional Timing" : "Overall Exam Timing";
};

function parseTestSectionsAndSetup() {
    const secMap = {};
    tcsState.questions.forEach((q, idx) => {
        const sName = q.subject || q.section_name || `Section ${q.section_id || 1}`;
        if (!secMap[sName]) {
            secMap[sName] = { name: sName, questions: [] };
        }
        secMap[sName].questions.push({ ...q, originalIndex: idx });
    });

    tcsState.sections = Object.values(secMap);
    if (tcsState.sections.length === 0) {
        tcsState.sections = [{ name: "General Section", questions: tcsState.questions.map((q, i) => ({ ...q, originalIndex: i })) }];
    }

    // Render Start Screen Optional/Compulsory Subject Cards
    const container = document.getElementById("subjects-selection-container");
    container.innerHTML = "";

    tcsState.sections.forEach((sec, sIdx) => {
        container.innerHTML += `
            <div class="sub-card fixed">
                <div class="sub-name"><span class="fixed-icon">📘</span> ${sec.name}</div>
                <span class="sub-badge">${sec.questions.length} Questions</span>
            </div>`;
    });
}

window.startTest = function() {
    const t = tcsState.testMeta;
    let totalMins = 60;
    const tStr = String(t.time || "60");
    if (tStr.includes("+")) {
        const parts = tStr.split("+").map(n => parseInt(n.trim()) || 0);
        totalMins = parts.reduce((a, b) => a + b, 0);
    } else {
        totalMins = parseInt(tStr) || 60;
    }

    tcsState.secondsLeft = totalMins * 60;

    document.getElementById("start-screen").classList.add("tcs-hidden");
    document.getElementById("live-test-screen").classList.remove("tcs-hidden");

    renderTcsTabs();
    loadQuestion(0);
    startTcsTimer();
};

function startTcsTimer() {
    if (tcsState.timerInterval) clearInterval(tcsState.timerInterval);
    tcsState.timerInterval = setInterval(() => {
        if (tcsState.secondsLeft <= 0) {
            clearInterval(tcsState.timerInterval);
            alert("⏰ Time is up! Submitting your test automatically.");
            submitTest();
            return;
        }
        tcsState.secondsLeft--;
        const hrs = String(Math.floor(tcsState.secondsLeft / 3600)).padStart(2, '0');
        const mins = String(Math.floor((tcsState.secondsLeft % 3600) / 60)).padStart(2, '0');
        const secs = String(tcsState.secondsLeft % 60).padStart(2, '0');
        
        const timerEl = document.getElementById("tcs-timer-display");
        if (timerEl) timerEl.textContent = `${hrs}:${mins}:${secs}`;
    }, 1000);
}

function renderTcsTabs() {
    const wrap = document.getElementById("tcs-tabs-container");
    wrap.innerHTML = "";
    tcsState.sections.forEach((sec, idx) => {
        const activeClass = (idx === tcsState.activeSectionIndex) ? "tcs-tab active" : "tcs-tab";
        wrap.innerHTML += `<div class="${activeClass}" onclick="switchTcsSection(${idx})">${sec.name}</div>`;
    });
}

window.switchTcsSection = function(secIdx) {
    tcsState.activeSectionIndex = secIdx;
    renderTcsTabs();
    const firstQInSec = tcsState.sections[secIdx].questions[0];
    if (firstQInSec) {
        loadQuestion(firstQInSec.originalIndex);
    }
};

function loadQuestion(globalIdx) {
    tcsState.currentQIdx = globalIdx;
    const q = tcsState.questions[globalIdx];
    if (!q) return;

    // Find section
    let secIdx = 0;
    tcsState.sections.forEach((sec, sIdx) => {
        if (sec.questions.some(sq => sq.originalIndex === globalIdx)) {
            secIdx = sIdx;
        }
    });
    tcsState.activeSectionIndex = secIdx;
    renderTcsTabs();

    document.getElementById("tcs-q-num").textContent = globalIdx + 1;
    document.getElementById("tcs-footer-sec-info").textContent = tcsState.sections[secIdx].name;

    document.getElementById("tcs-live-pos").textContent = `+${q.positive_marks || "2.00"}`;
    document.getElementById("tcs-live-neg").textContent = `-${q.negative_marks || "0.25"}`;

    // Question Text
    const qTxtBox = document.getElementById("tcs-q-text");
    qTxtBox.innerHTML = (tcsState.lang === "hi" && (q.question_hi || q.question_hindi)) ? (q.question_hi || q.question_hindi) : (q.question || q.question_text || "");

    // Options
    const optBox = document.getElementById("tcs-options-container");
    optBox.innerHTML = "";

    const resp = tcsState.responses[globalIdx] || {};
    const chosen = resp.chosenOption;

    const opts = [
        { id: "1", text: q.option_1 || q.opt1 },
        { id: "2", text: q.option_2 || q.opt2 },
        { id: "3", text: q.option_3 || q.opt3 },
        { id: "4", text: q.option_4 || q.opt4 },
        q.option_5 ? { id: "5", text: q.option_5 } : null
    ].filter(Boolean);

    opts.forEach(opt => {
        const isSel = (String(chosen) === String(opt.id));
        const selClass = isSel ? "tcs-option selected" : "tcs-option";
        optBox.innerHTML += `
            <div class="${selClass}" onclick="selectTcsOption('${opt.id}')">
                <div class="tcs-opt-lbl">${opt.id}</div>
                <div style="flex: 1; word-break: break-word;">${opt.text || ""}</div>
            </div>`;
    });

    if (window.MathJax && MathJax.typesetPromise) {
        MathJax.typesetPromise([qTxtBox, optBox]).catch(() => {});
    }
}

window.selectTcsOption = function(optId) {
    const idx = tcsState.currentQIdx;
    if (!tcsState.responses[idx]) {
        tcsState.responses[idx] = { status: 'attempted', chosenOption: optId };
    } else {
        tcsState.responses[idx].chosenOption = optId;
        tcsState.responses[idx].status = 'attempted';
    }
    loadQuestion(idx);
};

window.saveAndNext = function() {
    const idx = tcsState.currentQIdx;
    if (tcsState.responses[idx] && tcsState.responses[idx].chosenOption) {
        tcsState.responses[idx].status = 'attempted';
    } else {
        tcsState.responses[idx] = { status: 'unattempted', chosenOption: null };
    }
    nextQuestion();
};

window.markForReview = function() {
    const idx = tcsState.currentQIdx;
    const cur = tcsState.responses[idx] || {};
    const hasAns = Boolean(cur.chosenOption);
    tcsState.responses[idx] = {
        ...cur,
        status: hasAns ? 'marked_attempted' : 'marked'
    };
    nextQuestion();
};

window.clearResponse = function() {
    const idx = tcsState.currentQIdx;
    tcsState.responses[idx] = { status: 'unattempted', chosenOption: null };
    loadQuestion(idx);
};

window.nextQuestion = function() {
    if (tcsState.currentQIdx < tcsState.questions.length - 1) {
        loadQuestion(tcsState.currentQIdx + 1);
    }
};

window.prevQuestion = function() {
    if (tcsState.currentQIdx > 0) {
        loadQuestion(tcsState.currentQIdx - 1);
    }
};

window.toggleTcsLangMode = function() {
    tcsState.lang = (tcsState.lang === "en") ? "hi" : "en";
    loadQuestion(tcsState.currentQIdx);
};

window.toggleTcsFullScreen = function() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
    } else {
        if (document.exitFullscreen) document.exitFullscreen();
    }
};

window.toggleTcsPalette = function() {
    const palette = document.getElementById("tcs-palette");
    palette.classList.toggle("show");
    if (palette.classList.contains("show")) {
        renderTcsAccordionGrid();
    }
};

function renderTcsAccordionGrid() {
    const cont = document.getElementById("tcs-accordion-container");
    cont.innerHTML = "";

    tcsState.sections.forEach((sec, sIdx) => {
        let att = 0, una = 0, mar = 0;
        sec.questions.forEach(sq => {
            const r = tcsState.responses[sq.originalIndex];
            if (r && (r.status === 'attempted' || r.status === 'marked_attempted')) att++;
            else if (r && r.status === 'marked') mar++;
            else una++;
        });

        let gridHtml = `<div class="tcs-q-grid open" id="grid_sec_${sIdx}">`;
        sec.questions.forEach((sq, qPos) => {
            const gIdx = sq.originalIndex;
            const r = tcsState.responses[gIdx];
            let boxCls = "tcs-q-box st-not-ans";
            if (r) {
                if (r.status === 'attempted') boxCls = "tcs-q-box st-ans";
                else if (r.status === 'marked') boxCls = "tcs-q-box st-mark";
                else if (r.status === 'marked_attempted') boxCls = "tcs-q-box st-mark-ans";
            }
            gridHtml += `<div class="${boxCls}" onclick="jumpToQuestion(${gIdx})">${qPos + 1}</div>`;
        });
        gridHtml += `</div>`;

        cont.innerHTML += `
            <div class="tcs-accordion">
                <div class="tcs-acc-header" onclick="toggleGridSec(${sIdx})">
                    <span>${sec.name}</span>
                    <span>▼</span>
                </div>
                <div class="tcs-acc-stats">
                    <span>Attempted: ${att}</span>
                    <span>Marked: ${mar}</span>
                    <span>Unattempted: ${una}</span>
                </div>
                ${gridHtml}
            </div>`;
    });
}

window.toggleGridSec = function(sIdx) {
    const g = document.getElementById(`grid_sec_${sIdx}`);
    if (g) g.classList.toggle("open");
};

window.jumpToQuestion = function(globalIdx) {
    toggleTcsPalette();
    loadQuestion(globalIdx);
};

window.handleDynamicSubmit = function() {
    prepareSubmit();
};

function prepareSubmit() {
    document.getElementById("tcs-palette").classList.remove("show");
    document.getElementById("live-test-screen").classList.add("tcs-hidden");
    document.getElementById("submit-screen").classList.remove("tcs-hidden");

    let totalAtt = 0, totalUna = 0, totalMar = 0;
    tcsState.questions.forEach((_, i) => {
        const r = tcsState.responses[i];
        if (r && (r.status === 'attempted' || r.status === 'marked_attempted')) totalAtt++;
        else if (r && r.status === 'marked') totalMar++;
        else totalUna++;
    });

    const cont = document.getElementById("submit-summary-container");
    cont.innerHTML = `
        <div class="section-summary-card">
            <h3 style="font-weight:800; color:#1a237e; margin-bottom:12px;">Overall Test Summary</h3>
            <div class="stat-row"><span>Total Questions:</span> <strong>${tcsState.questions.length}</strong></div>
            <div class="stat-row"><span>Attempted Questions:</span> <strong style="color:#2563eb;">${totalAtt}</strong></div>
            <div class="stat-row"><span>Marked For Review:</span> <strong style="color:#d97706;">${totalMar}</strong></div>
            <div class="stat-row"><span>Unattempted Questions:</span> <strong style="color:#64748b;">${totalUna}</strong></div>
        </div>`;
}

window.closeSubmit = function() {
    document.getElementById("submit-screen").classList.add("tcs-hidden");
    document.getElementById("live-test-screen").classList.remove("tcs-hidden");
};

window.submitTest = function() {
    if (tcsState.timerInterval) clearInterval(tcsState.timerInterval);
    tcsState.isSubmitted = true;

    document.getElementById("submit-screen").classList.add("tcs-hidden");
    document.getElementById("live-test-screen").classList.add("tcs-hidden");
    document.getElementById("analysis-screen").classList.remove("tcs-hidden");

    let correct = 0, incorrect = 0, unattempted = 0, score = 0;
    const maxMarks = tcsState.questions.length * 2;

    tcsState.questions.forEach((q, i) => {
        const r = tcsState.responses[i];
        const correctAns = String(q.answer || q.correct_option || "1").trim();
        if (!r || !r.chosenOption) {
            unattempted++;
        } else if (String(r.chosenOption) === correctAns) {
            correct++;
            score += parseFloat(q.positive_marks || 2.0);
        } else {
            incorrect++;
            score -= parseFloat(q.negative_marks || 0.5);
        }
    });

    score = Math.max(0, parseFloat(score.toFixed(2)));
    const accuracy = (correct + incorrect) > 0 ? Math.round((correct / (correct + incorrect)) * 100) : 0;

    document.getElementById("res-score").textContent = `${score} / ${maxMarks}`;
    document.getElementById("res-correct").textContent = correct;
    document.getElementById("res-incorrect").textContent = incorrect;
    document.getElementById("res-unatt").textContent = unattempted;
    document.getElementById("res-acc").textContent = `${accuracy}%`;
    document.getElementById("res-rank").textContent = "#14";
    document.getElementById("res-perc").textContent = "98.5%";

    // Comparison Table
    document.getElementById("cmp-score").textContent = score;
    document.getElementById("cmp-top").textContent = (maxMarks * 0.85).toFixed(1);
    document.getElementById("cmp-avg").textContent = (maxMarks * 0.45).toFixed(1);
    document.getElementById("cmp-acc").textContent = `${accuracy}%`;
    document.getElementById("cmp-c").textContent = correct;
    document.getElementById("cmp-w").textContent = incorrect;

    // Donut chart color setup
    const cDeg = (correct / tcsState.questions.length) * 360;
    const wDeg = cDeg + (incorrect / tcsState.questions.length) * 360;
    const donut = document.getElementById("res-donut");
    if (donut) {
        donut.style.background = `conic-gradient(#4caf50 0deg ${cDeg}deg, #e53935 ${cDeg}deg ${wDeg}deg, #5c6bc0 ${wDeg}deg 360deg)`;
    }

    // Remark
    const rem = document.getElementById("dynamic-remark");
    if (rem) {
        rem.style.display = "block";
        if (accuracy >= 80) {
            rem.className = "remark-banner rem-excellent";
            rem.textContent = "🎉 Excellent Performance! Keep it up!";
        } else if (accuracy >= 50) {
            rem.className = "remark-banner rem-great";
            rem.textContent = "👍 Good Attempt! Practice more to reach the top.";
        } else {
            rem.className = "remark-banner rem-poor";
            rem.textContent = "⚠️ Needs Improvement! Review your solutions carefully.";
        }
    }

    // Section-wise analysis cards
    const sCont = document.getElementById("analysis-sections-container");
    sCont.innerHTML = "";
    tcsState.sections.forEach(sec => {
        let sCorr = 0, sInc = 0, sUna = 0;
        sec.questions.forEach(sq => {
            const r = tcsState.responses[sq.originalIndex];
            const ans = String(sq.answer || "1").trim();
            if (!r || !r.chosenOption) sUna++;
            else if (String(r.chosenOption) === ans) sCorr++;
            else sInc++;
        });

        sCont.innerHTML += `
            <div class="a-card">
                <div class="subj-header">
                    <div class="subj-name">${sec.name}</div>
                    <div class="black-circle"><span>Questions</span><span>${sec.questions.length}</span></div>
                </div>
                <div class="subj-q-stats">Correct: ${sCorr} | Incorrect: ${sInc} | Unattempted: ${sUna}</div>
            </div>`;
    });
};

window.reAttemptTcsTest = function() {
    launchCbtTest(tcsState.activeTestKey);
};

window.openSolutions = function() {
    document.getElementById("analysis-screen").classList.add("tcs-hidden");
    document.getElementById("solutions-screen").classList.remove("tcs-hidden");
    renderSolutionsList("all");
};

window.closeSolutions = function() {
    document.getElementById("solutions-screen").classList.add("tcs-hidden");
    document.getElementById("analysis-screen").classList.remove("tcs-hidden");
};

window.filterSol = function(filterType, btnEl) {
    document.querySelectorAll(".flt-btn").forEach(b => b.classList.remove("flt-active"));
    btnEl.classList.add("flt-active");
    renderSolutionsList(filterType);
};

function renderSolutionsList(filter) {
    const cont = document.getElementById("sol-list-container");
    cont.innerHTML = "";

    tcsState.questions.forEach((q, idx) => {
        const r = tcsState.responses[idx];
        const correctAns = String(q.answer || "1").trim();
        const hasChosen = r && r.chosenOption;
        const isCorr = hasChosen && String(r.chosenOption) === correctAns;
        const isInc = hasChosen && !isCorr;
        const isUna = !hasChosen;

        if (filter === "correct" && !isCorr) return;
        if (filter === "incorrect" && !isInc) return;
        if (filter === "unattempted" && !isUna) return;

        let badgeClass = "st-una", iconHtml = "−";
        if (isCorr) { badgeClass = "st-corr"; iconHtml = "✓"; }
        else if (isInc) { badgeClass = "st-wr"; iconHtml = "✕"; }

        const qText = (tcsState.lang === "hi" && (q.question_hi || q.question_hindi)) ? (q.question_hi || q.question_hindi) : (q.question || "");

        cont.innerHTML += `
            <div class="sol-item" onclick="openFullSolution(${idx})">
                <div class="sol-num-col">
                    <div class="sol-num">${idx + 1}
                        <div class="sol-status-icon ${badgeClass}">${iconHtml}</div>
                    </div>
                    <div class="sol-line"></div>
                </div>
                <div class="sol-card">
                    <span class="sol-sec-badge">${q.subject || "General"}</span>
                    <div class="sol-q-txt">${qText.slice(0, 120)}...</div>
                    <div style="font-size:12px; font-weight:800; color:#1a237e;">Tap to view Full Solution ➔</div>
                </div>
            </div>`;
    });

    if (window.MathJax && MathJax.typesetPromise) {
        MathJax.typesetPromise([cont]).catch(() => {});
    }
}

let activeFullSolIdx = 0;
window.openFullSolution = function(idx) {
    activeFullSolIdx = idx;
    document.getElementById("solutions-screen").classList.add("tcs-hidden");
    document.getElementById("full-sol-screen").classList.remove("tcs-hidden");
    renderFullSolutionContent(idx);
};

function renderFullSolutionContent(idx) {
    const q = tcsState.questions[idx];
    const r = tcsState.responses[idx];
    const correctAns = String(q.answer || "1").trim();

    document.getElementById("fs-q-num").textContent = `Question ${idx + 1} of ${tcsState.questions.length}`;
    
    const qTxt = (tcsState.lang === "hi" && (q.question_hi || q.question_hindi)) ? (q.question_hi || q.question_hindi) : (q.question || "");
    document.getElementById("fs-q-txt").innerHTML = qTxt;

    const optBox = document.getElementById("fs-options-container");
    optBox.innerHTML = "";

    const opts = [
        { id: "1", text: q.option_1 || q.opt1 },
        { id: "2", text: q.option_2 || q.opt2 },
        { id: "3", text: q.option_3 || q.opt3 },
        { id: "4", text: q.option_4 || q.opt4 },
        q.option_5 ? { id: "5", text: q.option_5 } : null
    ].filter(Boolean);

    opts.forEach(opt => {
        const isCorrectOpt = (String(opt.id) === correctAns);
        const isUserChosen = r && String(r.chosenOption) === String(opt.id);

        let cls = "fs-opt";
        if (isCorrectOpt) cls = "fs-opt correct";
        else if (isUserChosen && !isCorrectOpt) cls = "fs-opt wrong";

        optBox.innerHTML += `
            <div class="${cls}">
                <div style="display:flex; align-items:center; gap:10px;">
                    <div class="tcs-opt-lbl">${opt.id}</div>
                    <div>${opt.text || ""}</div>
                </div>
                ${isCorrectOpt ? `<span class="fs-opt-perc">Correct Answer</span>` : ""}
                ${isUserChosen && !isCorrectOpt ? `<span style="font-size:11px;font-weight:800;color:#c62828;">Your Choice</span>` : ""}
            </div>`;
    });

    const expText = (tcsState.lang === "hi" && (q.explanation_hi || q.solution_hi)) ? (q.explanation_hi || q.solution_hi) : (q.explanation || q.solution_text || q.solution || "Official detailed solution is provided by RWA expert faculty.");
    document.getElementById("fs-exp-text").innerHTML = expText;

    if (window.MathJax && MathJax.typesetPromise) {
        MathJax.typesetPromise([document.getElementById("full-sol-screen")]).catch(() => {});
    }
}

window.closeFullSol = function() {
    document.getElementById("full-sol-screen").classList.add("tcs-hidden");
    document.getElementById("solutions-screen").classList.remove("tcs-hidden");
};

window.nextFullSol = function() {
    if (activeFullSolIdx < tcsState.questions.length - 1) {
        activeFullSolIdx++;
        renderFullSolutionContent(activeFullSolIdx);
    }
};

window.prevFullSol = function() {
    if (activeFullSolIdx > 0) {
        activeFullSolIdx--;
        renderFullSolutionContent(activeFullSolIdx);
    }
};
