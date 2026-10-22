// =========================================================
// RWA SKY PORTAL - TCS PATTERN MOCK TEST & CBT ENGINE (tcs_test.js)
// =========================================================

let testData = [];
let originalTestData = []; 
let apiDataRef = null;     
let currentSecIdx = 0, currentQIdx = 0; 
let tcsTimerInterval = null, tcsTimeRemaining = 15 * 60;
let qStartTime = Date.now();
let currentFilter = 'all', allQsFlat = [], currentFlatIdx = 0;
let testMode = 'overall';
let isTimerActive = true;
let activeTestKey = null;

window.selectedOptionalSubjects = {};

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
    if (window.MathJax && window.MathJax.typesetPromise) {
        MathJax.typesetPromise().catch((err) => console.log('MathJax error: ' + err.message));
    }
}

// Hooked into app.js `launchCbtTest(tKey)`
async function launchCbtTest(tKey) {
    const t = state.testMap[tKey];
    if (!t) return;
    activeTestKey = tKey;

    showSlide("slideTestAttempt");

    const startBtn = document.getElementById('tcs-start-btn');
    if(startBtn) { startBtn.innerText = "Loading Questions..."; startBtn.disabled = true; }

    document.getElementById('start-screen').classList.remove('hidden');
    document.getElementById('live-test-screen').classList.add('hidden');
    document.getElementById('submit-screen').classList.add('hidden');
    document.getElementById('analysis-screen').classList.add('hidden');
    document.getElementById('solutions-screen').classList.add('hidden');
    document.getElementById('full-sol-screen').classList.add('hidden');

    document.getElementById('tcs-start-title').innerText = t.title || "Mock Test";

    const testTok = t.tokenObj || state.activeTokenObj || USER_TOKENS[0];
    state.activeTokenObj = testTok;
    const uid = testTok.userId || extractUidFromJwt(testTok.token) || "4756316";

    fetchRawJSONWithToken(`/Test_Series/check_test_attempts?test_id=${t.id}&user_id=${uid}`, testTok);

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

    if (!Array.isArray(questions) || questions.length === 0) {
        questions = DB.fallbackCbtQuestions;
    }

    // Wrap questions into TCS Section format compatible with tcs.html engine
    originalTestData = [{
        section: "General Section",
        optional_group: "",
        time: parseInt(t.time) || 60,
        questions: questions
    }];

    apiDataRef = {
        time: parseInt(t.time) || 60,
        pos: 2.00,
        neg: 0.50
    };

    testMode = 'overall';
    setupTestStartScreen();
}

function setupTestStartScreen() {
    const startBtn = document.getElementById('tcs-start-btn');
    
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

    let subjectHtml = `
        <div style="font-weight:bold; color:#1a237e; border-bottom: 2px solid #e8eaf6; padding-bottom: 8px; margin-bottom: 12px; font-size: 14px; display: flex; align-items: center;">
            📚 Sections & Subjects in Test:
        </div>
        <div>
    `;

    compulsorySubjects.forEach(sec => {
        let qCount = sec.questions ? sec.questions.length : 0;
        subjectHtml += `
        <div class="sub-card fixed">
            <span class="sub-name"><span class="fixed-icon">✅</span> ${sec.section}</span>
            <span class="sub-badge">${qCount} Qs</span>
        </div>`;
    });

    for (let group in optionalGroups) {
        window.selectedOptionalSubjects[group] = optionalGroups[group][0].section;
        subjectHtml += `<div class="opt-group"><div class="opt-group-title">📝 Select Optional (${group}):</div>`;
        optionalGroups[group].forEach((sec, idx) => {
            let qCount = sec.questions ? sec.questions.length : 0;
            let isSelectedClass = idx === 0 ? "selected" : "";
            subjectHtml += `
            <div class="sub-card opt-card ${isSelectedClass}" onclick="selectOptionalSubject(this, '${group}', '${sec.section}')">
                <span class="sub-name"><span class="check-icon">✓</span>${sec.section}</span>
                <span class="sub-badge">${qCount} Qs</span>
            </div>`;
        });
        subjectHtml += `</div>`;
    }
    subjectHtml += `</div>`;

    document.getElementById('subjects-selection-container').innerHTML = subjectHtml;
    updateStartStatsUI();

    if(startBtn) { startBtn.innerText = "Start Test Now ➔"; startBtn.disabled = false; }
}

function selectOptionalSubject(element, group, secName) {
    let groupContainer = element.parentElement;
    groupContainer.querySelectorAll('.opt-card').forEach(c => c.classList.remove('selected'));
    element.classList.add('selected');
    window.selectedOptionalSubjects[group] = secName;
    updateStartStatsUI();
}

function updateStartStatsUI() {
    let selectedOptionals = Object.values(window.selectedOptionalSubjects || {});
    let totalQs = 0, totalTime = 0;

    originalTestData.forEach(sec => {
        if (sec.optional_group && sec.optional_group.trim() !== "") {
            if (!selectedOptionals.includes(sec.section)) return;
        }
        totalQs += sec.questions ? sec.questions.length : 0;
        totalTime += sec.time !== undefined ? sec.time : 60;
    });

    let displayTime = testMode === 'overall' ? (apiDataRef.time !== undefined ? apiDataRef.time * 60 : totalTime * 60) : totalTime * 60;
    isTimerActive = true;

    let dbPos = apiDataRef.pos !== undefined ? apiDataRef.pos : 2.00;
    let dbNeg = apiDataRef.neg !== undefined ? apiDataRef.neg : 0.50;
    let dbMaxMarks = totalQs * dbPos;

    document.getElementById('stat-qs').innerText = totalQs;
    document.getElementById('stat-time').innerText = isTimerActive ? Math.floor(displayTime/60) + " mins" : "No Limit";
    document.getElementById('stat-marks').innerText = dbMaxMarks.toFixed(2);
    document.getElementById('stat-marking').innerText = `+${dbPos} / -${dbNeg}`;
}

function startTest() {
    let elem = document.documentElement;
    if (elem.requestFullscreen) {
        elem.requestFullscreen().catch(() => {});
    }

    let selectedOptionals = Object.values(window.selectedOptionalSubjects || {});
    testData = [];
    let totalTime = 0;

    originalTestData.forEach(sec => {
        if (sec.optional_group && sec.optional_group.trim() !== "") {
            if (!selectedOptionals.includes(sec.section)) return; 
        }
        let secCopy = JSON.parse(JSON.stringify(sec)); 
        if(secCopy.questions) {
            secCopy.questions.forEach(q => {
                q.userAns = null;
                q.status = 'not_visited';
                q.time = 0;
            });
        }
        testData.push(secCopy);
        totalTime += secCopy.time !== undefined ? secCopy.time : 60;
    });

    if (testMode === 'overall') {
        tcsTimeRemaining = apiDataRef.time !== undefined ? apiDataRef.time * 60 : totalTime * 60;
    } else {
        tcsTimeRemaining = (testData[0].time || 60) * 60; 
    }

    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('live-test-screen').classList.remove('hidden');

    if (!isTimerActive) {
        document.getElementById('tcs-timer-display').parentElement.style.display = 'none';
    }

    loadSection(0);
    startTcsTimer();
}

function loadSection(sIdx) {
    currentSecIdx = sIdx;
    currentQIdx = 0;
    if (testMode === 'sectional') {
        tcsTimeRemaining = (testData[sIdx].time || 60) * 60;
    }
    renderTabs();
    loadQuestion(sIdx, 0);
}

function formatTcsTimer(totalSecs) {
    let h = Math.floor(totalSecs / 3600);
    let m = Math.floor((totalSecs % 3600) / 60);
    let s = totalSecs % 60;
    return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
}

function startTcsTimer() {
    if (tcsTimerInterval) clearInterval(tcsTimerInterval);
    if (!isTimerActive) return;

    tcsTimerInterval = setInterval(() => {
        tcsTimeRemaining--;
        let display = document.getElementById('tcs-timer-display');
        if (display) display.innerText = formatTcsTimer(tcsTimeRemaining);

        let elapsed = Math.floor((Date.now() - qStartTime) / 1000);
        let m = Math.floor(elapsed/60), s = elapsed%60;
        const qTimeEl = document.getElementById('tcs-q-time');
        if (qTimeEl) qTimeEl.innerText = `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;

        if (tcsTimeRemaining <= 0) {
            clearInterval(tcsTimerInterval);
            prepareSubmit();
        }
    }, 1000);
}

function stopTcsTimer() {
    if (tcsTimerInterval) clearInterval(tcsTimerInterval);
}

function renderTabs() {
    let html = '';
    testData.forEach((sec, idx) => {
        let isActive = (idx === currentSecIdx) ? 'active' : '';
        html += `<div class="tcs-tab ${isActive}" id="tab-${idx}" onclick="loadSection(${idx})">${sec.section}</div>`;
    });
    document.getElementById('tcs-tabs-container').innerHTML = html;
}

function updateQuestionTime() {
    let elapsed = Math.floor((Date.now() - qStartTime) / 1000);
    if (testData[currentSecIdx] && testData[currentSecIdx].questions[currentQIdx]) {
        testData[currentSecIdx].questions[currentQIdx].time += elapsed;
    }
    qStartTime = Date.now();
}

function loadQuestion(secIdx, qIdx) {
    updateQuestionTime();
    currentSecIdx = secIdx;
    currentQIdx = qIdx;

    let q = testData[secIdx].questions[qIdx];
    if (q.status === 'not_visited') q.status = 'not_answered';

    document.getElementById('tcs-q-num').innerText = qIdx + 1;
    document.getElementById('tcs-sec-progress-lbl').innerText = `${testData[secIdx].section} (${qIdx + 1}/${testData[secIdx].questions.length})`;

    let qHtml = q.question || q.text || "";
    qHtml = formatMathText(qHtml);
    if (q.image_link_1) qHtml += `<br><img src="${q.image_link_1}" style="max-width:100%; margin-top:10px; display:block;">`;
    document.getElementById('tcs-q-text').innerHTML = qHtml || 'Question';

    let optionsHtml = '';
    let optPrefix = ['A', 'B', 'C', 'D'];
    [1, 2, 3, 4].forEach(optNum => {
        let optText = q[`option_${optNum}`];
        let optImg = q[`option_image_${optNum}`];
        if (!optText && !optImg) return;

        let i = optNum - 1;
        let isSel = (q.userAns === optNum || q.userAns === i) ? 'selected' : '';
        let optContent = optImg ? `<img src="${optImg}" style="max-height:80px; max-width:100%; display:block;">` : formatMathText(optText);

        optionsHtml += `
        <div class="tcs-option ${isSel}" onclick="selectOption(${optNum})">
            <span class="tcs-opt-lbl">${optPrefix[i]}</span>
            <div style="flex:1;">${optContent}</div>
        </div>`;
    });
    document.getElementById('tcs-options-container').innerHTML = optionsHtml;
    triggerMathJax();
}

function selectOption(optNum) {
    testData[currentSecIdx].questions[currentQIdx].userAns = optNum;
    loadQuestion(currentSecIdx, currentQIdx);
}

function saveAndNext() {
    let q = testData[currentSecIdx].questions[currentQIdx];
    if (q.userAns !== null) q.status = 'answered';
    else if (q.status !== 'marked') q.status = 'not_answered';
    nextQuestion();
}

function markForReview() {
    testData[currentSecIdx].questions[currentQIdx].status = 'marked';
    nextQuestion();
}

function clearResponse() {
    testData[currentSecIdx].questions[currentQIdx].userAns = null;
    testData[currentSecIdx].questions[currentQIdx].status = 'not_answered';
    loadQuestion(currentSecIdx, currentQIdx);
}

function nextQuestion() {
    if (currentQIdx < testData[currentSecIdx].questions.length - 1) {
        loadQuestion(currentSecIdx, currentQIdx + 1);
    } else if (currentSecIdx < testData.length - 1) {
        loadSection(currentSecIdx + 1);
    } else {
        alert("Yeh aakhri question hai. Aap 'Submit Quiz' kar sakte hain.");
    }
}

function prevQuestion() {
    if (currentQIdx > 0) {
        loadQuestion(currentSecIdx, currentQIdx - 1);
    } else if (currentSecIdx > 0) {
        let prevSec = currentSecIdx - 1;
        loadSection(prevSec);
        loadQuestion(prevSec, testData[prevSec].questions.length - 1);
    }
}

function toggleTcsPalette() {
    let drawer = document.getElementById('tcs-palette');
    if (drawer.classList.contains('show')) drawer.classList.remove('show');
    else { renderTcsDrawer(); drawer.classList.add('show'); }
}

function switchDrawerView(mode) {
    document.getElementById('dr-tab-grid').className = mode === 'grid' ? 'tcs-dr-tab active' : 'tcs-dr-tab';
    document.getElementById('dr-tab-list').className = mode === 'list' ? 'tcs-dr-tab active' : 'tcs-dr-tab';
}

function renderTcsDrawer() {
    let html = '';
    testData.forEach((sec, sIdx) => {
        let counts = { ans: 0, notAns: 0, marked: 0, notVis: 0 };
        let gridHtml = '';

        sec.questions.forEach((q, qIdx) => {
            let cls = 'st-not-ans';
            if (q.status === 'answered') { cls = 'st-ans'; counts.ans++; }
            else if (q.status === 'not_answered') { cls = 'st-not-ans'; counts.notAns++; }
            else if (q.status === 'marked') { cls = q.userAns !== null ? 'st-mark-ans' : 'st-mark'; counts.marked++; }
            else { counts.notVis++; }

            gridHtml += `<div class="tcs-q-box ${cls}" onclick="jumpToQ(${sIdx}, ${qIdx})">${qIdx + 1}</div>`;
        });

        let isOpen = (sIdx === currentSecIdx) ? 'open' : '';
        html += `
        <div class="tcs-accordion">
            <div class="tcs-acc-header" onclick="toggleAcc(${sIdx})">
                <span>${sec.section}</span>
                <span id="arr-${sIdx}">${isOpen ? '▲' : '▼'}</span>
            </div>
            <div class="tcs-acc-stats">
                <span><div class="tcs-circ c-marked" style="width:10px;height:10px;margin-right:2px;"></div> ${counts.marked}</span>
                <span><div class="tcs-circ c-attempt" style="width:10px;height:10px;margin-right:2px;"></div> ${counts.ans}</span>
                <span><div class="tcs-circ c-unattempt" style="width:10px;height:10px;margin-right:2px;"></div> ${counts.notAns + counts.notVis}</span>
            </div>
            <div class="tcs-q-grid ${isOpen}" id="acc-grid-${sIdx}">${gridHtml}</div>
        </div>`;
    });
    document.getElementById('tcs-accordion-container').innerHTML = html;
}

function toggleAcc(idx) {
    let grid = document.getElementById(`acc-grid-${idx}`);
    let arr = document.getElementById(`arr-${idx}`);
    if (grid.classList.contains('open')) { grid.classList.remove('open'); arr.innerText = '▼'; }
    else { grid.classList.add('open'); arr.innerText = '▲'; }
}

function jumpToQ(sIdx, qIdx) {
    toggleTcsPalette();
    loadQuestion(sIdx, qIdx);
}

function handleDynamicSubmit() {
    prepareSubmit();
}

function prepareSubmit() {
    updateQuestionTime();
    document.getElementById('live-test-screen').classList.add('hidden');
    document.getElementById('submit-screen').classList.remove('hidden');

    let html = '';
    testData.forEach((sec) => {
        let ans = 0, marked = 0, notVis = 0;
        sec.questions.forEach(q => {
            if (q.status === 'answered') ans++;
            else if (q.status === 'marked') marked++;
            else notVis++;
        });
        html += `
        <div class="section-summary-card">
            <h2 style="margin-bottom:10px; font-size:16px; font-weight:bold; color:#1a237e;">${sec.section}</h2>
            <div class="stat-row"><span>Total Questions</span> <strong>${sec.questions.length}</strong></div>
            <div class="stat-row"><span>Answered</span> <strong style="color:#1976d2;">${ans}</strong></div>
            <div class="stat-row"><span>Marked for Review</span> <strong style="color:#fbc02d;">${marked}</strong></div>
            <div class="stat-row"><span>Unattempted</span> <strong style="color:#888;">${notVis}</strong></div>
        </div>`;
    });
    document.getElementById('submit-summary-container').innerHTML = html;
}

function closeSubmit() {
    document.getElementById('submit-screen').classList.add('hidden');
    document.getElementById('live-test-screen').classList.remove('hidden');
}

function formatTime(sec) {
    if (!sec || sec === 0) return "0 sec";
    let m = Math.floor(sec / 60), s = sec % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

async function submitTest() {
    stopTcsTimer();
    document.getElementById('submit-screen').classList.add('hidden');
    document.getElementById('analysis-screen').classList.remove('hidden');

    if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
    }

    let tC = 0, tI = 0, tU = 0, secHtml = '';
    allQsFlat = []; 
    let globalQNum = 1;
    let weakAreas = [];

    let posMark = apiDataRef.pos || 2.00;
    let negMark = apiDataRef.neg || 0.50;

    testData.forEach((sec, sIdx) => {
        let c = 0, inc = 0, u = 0, cT = 0, incT = 0, uT = 0;
        sec.questions.forEach((q, qIdx) => {
            let correctAns = String(q.answer || "1").trim();
            let userAnsStr = q.userAns !== null ? String(q.userAns).trim() : null;

            let state = 'unattempted';
            if (userAnsStr === null) {
                u++; uT += (q.time || 0);
            } else if (userAnsStr === correctAns || (parseInt(userAnsStr) + 1) === parseInt(correctAns)) {
                c++; cT += (q.time || 0); state = 'correct';
            } else {
                inc++; incT += (q.time || 0); state = 'incorrect';
            }

            let simTopperTime = Math.max(5, Math.floor(Math.random() * 15) + 8);
            allQsFlat.push({ ...q, secName: sec.section, globalNum: globalQNum++, state: state, secIdx: sIdx, qIdx: qIdx, topperTime: simTopperTime });
        });

        tC += c; tI += inc; tU += u;
        let secMarks = Math.max(0, (c * posMark) - (inc * negMark));

        secHtml += `
        <div class="a-card">
            <div class="subj-header">
                <div class="subj-name">${sec.section}</div>
                <div class="black-circle"><span>Marks</span><span>${secMarks.toFixed(2)}</span></div>
            </div>
            <div class="subj-q-stats">Section Question Stats</div>
            <div class="time-split">
                <div class="col"><div class="c-green">Correct</div><div class="val-num c-green">${c}</div><div class="val-time">In ${formatTime(cT)}</div></div>
                <div class="col"><div class="c-red">Incorrect</div><div class="val-num c-red">${inc}</div><div class="val-time">In ${formatTime(incT)}</div></div>
                <div class="col"><div class="c-grey">Unattempted</div><div class="val-num c-grey">${u}</div><div class="val-time">In ${formatTime(uT)}</div></div>
            </div>
        </div>`;

        let totalSecQs = c + inc + u;
        let secAcc = totalSecQs > 0 ? (c / totalSecQs) * 100 : 0;
        if (secAcc < 50) {
            weakAreas.push(`${sec.section} (Accuracy: ${secAcc.toFixed(1)}%)`);
        }
    });

    let totalQs = tC + tI + tU;
    let totalMarks = Math.max(0, (tC * posMark) - (tI * negMark));
    let maxMarks = totalQs * posMark;
    let acc = (tC + tI) > 0 ? ((tC / (tC + tI)) * 100).toFixed(2) : 0;
    let percentage = maxMarks <= 0 ? 0 : (totalMarks / maxMarks) * 100;

    let remarkBox = document.getElementById('dynamic-remark');
    remarkBox.style.display = 'block';
    if (percentage >= 85) { remarkBox.className = 'remark-banner rem-excellent'; remarkBox.innerHTML = '🏆 Exceptional! Topper Material'; }
    else if (percentage >= 70) { remarkBox.className = 'remark-banner rem-great'; remarkBox.innerHTML = '🔥 Great Performance!'; }
    else if (percentage >= 50) { remarkBox.className = 'remark-banner rem-good'; remarkBox.innerHTML = '👍 Good attempt, keep practicing!'; }
    else { remarkBox.className = 'remark-banner rem-poor'; remarkBox.innerHTML = '⚠️ Needs Improvement! Review solutions.'; }

    let topperScore = (maxMarks * 0.90).toFixed(2);
    if (totalMarks > parseFloat(topperScore)) topperScore = totalMarks.toFixed(2);
    let avgScore = (maxMarks * 0.45).toFixed(2);
    let percentile = totalMarks <= 0 ? 0 : Math.min(99.9, ((totalMarks / maxMarks) * 100) + (Math.random() * 3)).toFixed(1);
    let rank = totalMarks <= 0 ? Math.floor(Math.random() * 5000) + 12000 : Math.floor((100 - percentile) * 100) + 1;

    document.getElementById('res-score').innerText = `${totalMarks.toFixed(2)}/${maxMarks.toFixed(2)}`;
    document.getElementById('res-correct').innerText = tC;
    document.getElementById('res-incorrect').innerText = tI;
    document.getElementById('res-unatt').innerText = tU;
    document.getElementById('res-acc').innerText = `${acc}%`;
    document.getElementById('res-rank').innerText = rank;
    document.getElementById('res-perc').innerText = percentile + "%";

    document.getElementById('cmp-score').innerText = totalMarks.toFixed(2);
    document.getElementById('cmp-acc').innerText = `${acc}%`;
    document.getElementById('cmp-c').innerText = tC;
    document.getElementById('cmp-w').innerText = tI;
    document.getElementById('cmp-top').innerText = topperScore;
    document.getElementById('cmp-avg').innerText = avgScore;

    let pC = totalQs > 0 ? (tC / totalQs) * 100 : 0;
    let pI = totalQs > 0 ? (tI / totalQs) * 100 : 0;
    document.getElementById('res-donut').style.background = `conic-gradient(#4caf50 0% ${pC}%, #e53935 ${pC}% ${pC + pI}%, #00bcd4 ${pC + pI}% 100%)`;
    document.getElementById('analysis-sections-container').innerHTML = secHtml;

    let weakCard = document.getElementById('weak-areas-card');
    let weakList = document.getElementById('weak-areas-list');
    if (weakAreas.length > 0) {
        weakCard.style.display = 'block';
        weakList.innerHTML = weakAreas.map(w => `<li>${w}</li>`).join('');
    } else {
        weakCard.style.display = 'block';
        weakCard.style.background = '#e8f5e9';
        weakCard.style.borderColor = '#c8e6c9';
        weakCard.querySelector('h3').innerText = '🌟 Outstanding Accuracy!';
        weakList.innerHTML = '<li style="color:#1b5e20;">All sections performed exceptionally well!</li>';
    }
}

function reAttemptCbtTest() {
    if (activeTestKey) {
        launchCbtTest(activeTestKey);
    } else {
        exitCbtTest();
    }
}

function exitCbtTest() {
    stopTcsTimer();
    showSlide("slideExplorer");
}

function openSolutions() {
    document.getElementById('analysis-screen').classList.add('hidden');
    document.getElementById('solutions-screen').classList.remove('hidden');
    renderSolutions();
}

function closeSolutions() {
    document.getElementById('solutions-screen').classList.add('hidden');
    document.getElementById('analysis-screen').classList.remove('hidden');
}

function filterSol(type, btn) {
    document.querySelectorAll('.flt-btn').forEach(b => b.classList.remove('flt-active'));
    btn.classList.add('flt-active');
    currentFilter = type;
    renderSolutions();
}

function renderSolutions() {
    let html = '';
    allQsFlat.forEach((q, idx) => {
        if (currentFilter !== 'all' && q.state !== currentFilter) return;
        let iconStr = '', iconCls = '';
        if (q.state === 'correct') { iconStr = '✓'; iconCls = 'st-corr'; }
        else if (q.state === 'incorrect') { iconStr = '✕'; iconCls = 'st-wr'; }
        else { iconStr = '−'; iconCls = 'st-una'; }

        let solQText = q.question || q.text ? formatMathText(q.question || q.text) : '';
        let solQImg = q.image_link_1 ? `<br><img src="${q.image_link_1}" style="max-width:100%; max-height:80px; display:block; margin-top:6px;">` : '';

        html += `
        <div class="sol-item">
            <div class="sol-num-col">
                <div class="sol-num">${q.globalNum}<div class="sol-status-icon ${iconCls}">${iconStr}</div></div>
                <div class="sol-line"></div>
            </div>
            <div class="sol-card">
                <div class="sol-sec-badge">${q.secName}</div>
                <div class="sol-q-txt">${solQText + solQImg || "Question"}</div>
                <button class="tcs-btn tcs-btn-submit" style="padding:10px 14px; border-radius:8px; background: #1a237e; border-color: #1a237e; font-size:12px;" onclick="openFullSolution(${idx})">See Full Solution ➔</button>
            </div>
        </div>`;
    });
    document.getElementById('sol-list-container').innerHTML = html;
    triggerMathJax();
}

function openFullSolution(flatIdx) {
    currentFlatIdx = flatIdx;
    document.getElementById('solutions-screen').classList.add('hidden');
    document.getElementById('full-sol-screen').classList.remove('hidden');
    renderFullSolution();
}

function closeFullSol() {
    document.getElementById('full-sol-screen').classList.add('hidden');
    document.getElementById('solutions-screen').classList.remove('hidden');
}

function renderFullSolution() {
    let q = allQsFlat[currentFlatIdx];
    document.getElementById('fs-q-num').innerText = `Question ${q.globalNum}`;

    let youTimeColor = (q.time || 0) > q.topperTime ? 'tc-alert' : 'tc-good';
    document.getElementById('fs-q-time-compare').innerHTML = `
    <div class="time-compare-badge">
        <span class="tc-you ${youTimeColor}">⏱️ You: ${q.time || 0}s</span> 
        <span style="color:#ccc;">|</span> 
        <span class="tc-topper">👑 Topper: ${q.topperTime}s</span>
    </div>`;

    let fsQHtml = q.question || q.text ? formatMathText(q.question || q.text) : '';
    if (q.image_link_1) fsQHtml += `<br><img src="${q.image_link_1}" style="max-width:100%; margin-top:10px; display:block;">`;
    document.getElementById('fs-q-txt').innerHTML = fsQHtml || 'Question';

    let optHtml = '', optPrefix = ['A', 'B', 'C', 'D'];
    let correctAns = String(q.answer || "1").trim();

    [1, 2, 3, 4].forEach(optNum => {
        let optText = q[`option_${optNum}`];
        let optImg = q[`option_image_${optNum}`];
        if (!optText && !optImg) return;

        let i = optNum - 1;
        let isCorrect = String(optNum) === correctAns || String(i) === correctAns;
        let isUserSelected = (q.userAns === optNum || q.userAns === i);

        let cls = '', rightTxt = '';
        if (isCorrect) {
            cls = 'correct'; rightTxt = '<span class="fs-opt-perc">Correct Answer</span>';
        } else if (isUserSelected && !isCorrect) {
            cls = 'wrong';
        }

        let optContent = optImg ? `<img src="${optImg}" style="max-height:80px; max-width:100%; display:block;">` : formatMathText(optText);

        optHtml += `
        <div class="fs-opt ${cls}">
            <div style="display:flex; align-items:center; gap:10px; flex:1;">
                <span style="font-weight:bold; color:#1a237e;">${optPrefix[i]}.</span> 
                <div style="flex:1;">${optContent}</div>
            </div> 
            ${rightTxt}
        </div>`;
    });
    document.getElementById('fs-options-container').innerHTML = optHtml;

    let solText = q.solution_text || q.exp || "";
    solText = formatMathText(solText);
    if (q.solution_image_1) solText += `<br><img src="${q.solution_image_1}" style="max-width:100%; margin-top:10px; display:block;">`;
    document.getElementById('fs-exp-text').innerHTML = solText || 'Detailed solution will be updated soon.';

    triggerMathJax();
}

function nextFullSol() {
    if (currentFlatIdx < allQsFlat.length - 1) {
        currentFlatIdx++;
        renderFullSolution();
    } else {
        closeFullSol();
    }
}

function prevFullSol() {
    if (currentFlatIdx > 0) {
        currentFlatIdx--;
        renderFullSolution();
    }
}

function toggleTcsFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
    } else {
        if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
    }
}

function toggleTcsLang() {
    alert("Language toggle: Currently viewing in Hindi / Bilingual mode.");
}
