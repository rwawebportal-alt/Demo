// =========================================================
// RWA ULTIMATE ASMANI SKY OTT PLAYER ENGINE (player.js)
// =========================================================
const PROXY = "https://proplayer.allswbatch22.workers.dev/stream?url=";
const SEGMENT = "https://proplayer.allswbatch22.workers.dev/proxy?url=";

const v = document.getElementById("video");
const input = document.getElementById("url");
const bufferLoader = document.getElementById("bufferLoader");

let hls = null;
let cachedToken = "";
let resumeSeekTime = 0;

function showLoader(show) {
    if (!bufferLoader) return;
    if (show) bufferLoader.classList.remove("hidden");
    else bufferLoader.classList.add("hidden");
}

function valid(u) {
    try {
        return ["http:", "https:"].includes(new URL(u).protocol);
    } catch {
        return false;
    }
}

function unwrapOriginalUrl(u) {
    if (!u) return "";
    try {
        const parsed = new URL(u);
        if (parsed.hostname.includes("workers.dev") && parsed.searchParams.has("url")) {
            return decodeURIComponent(parsed.searchParams.get("url"));
        }
    } catch {}
    return u;
}

function manifest(u) {
    const rawUrl = unwrapOriginalUrl(u);
    try {
        const x = new URL(rawUrl);
        if (x.pathname.toLowerCase().includes(".m3u8") || x.hostname.includes("classx.co.in") || x.hostname.includes("akamai.net.in")) {
            return PROXY + encodeURIComponent(rawUrl);
        }
    } catch {}
    return rawUrl;
}

function segment(u) {
    return /\.(ts|m4s|mp4|aac|mp3|vtt|webvtt)(\?|$)/i.test(u.split("?")[0]);
}

class BackendLoader extends Hls.DefaultConfig.loader {
    load(ctx, cfg, cb) {
        let originalUrl = ctx.url;
        let mainUrl = input ? unwrapOriginalUrl(input.value.trim()) : "";

        let match = mainUrl.match(/(edge-cache-token=[^&]+)/);
        if (match) {
            cachedToken = match[1];
        }

        if (originalUrl.includes("allswbatch22.workers.dev")) {
            ctx.url = originalUrl;
            super.load(ctx, cfg, cb);
            return;
        }

        if (cachedToken && !originalUrl.includes("edge-cache-token=")) {
            originalUrl += (originalUrl.includes("?") ? "&" : "?") + cachedToken;
        }

        if (originalUrl.includes(".m3u8")) {
            ctx.url = PROXY + encodeURIComponent(originalUrl);
        } else if (segment(originalUrl)) {
            ctx.url = SEGMENT + encodeURIComponent(originalUrl);
        } else {
            ctx.url = originalUrl;
        }

        super.load(ctx, cfg, cb);
    }
}

function stopPlayer() {
    if (hls) {
        try { hls.destroy(); } catch {}
        hls = null;
    }
    if (v) {
        v.pause();
        v.removeAttribute("src");
        v.load();
    }
    const ytFrame = document.getElementById("ytFrame");
    if (ytFrame) ytFrame.src = "";
    showLoader(false);
}

window.closePlayerBox = function() {
    stopPlayer();
    const menu = document.getElementById("settingsMenu");
    if (menu) menu.classList.remove("show");
    if (typeof closeInlinePdfAndReset === "function") {
        closeInlinePdfAndReset();
    }
    if (typeof showSlide === "function") {
        showSlide("slideExplorer");
    }
};

function start() {
    let raw = input ? input.value.trim() : "";
    if (!raw) return;

    stopPlayer();
    showLoader(true);

    const cleanRaw = unwrapOriginalUrl(raw);
    const isYT = (!cleanRaw.startsWith("http") && cleanRaw.length >= 10 && cleanRaw.length <= 15) || cleanRaw.includes("youtube.com") || cleanRaw.includes("youtu.be");

    if (isYT) {
        showLoader(false);
        document.getElementById("hlsScreen").classList.add("hidden");
        document.getElementById("ytScreen").classList.remove("hidden");

        let ytId = cleanRaw;
        if (cleanRaw.includes("v=")) ytId = cleanRaw.split("v=")[1].split("&")[0];
        else if (cleanRaw.includes("youtu.be/")) ytId = cleanRaw.split("youtu.be/")[1].split("?")[0];

        const ytFrame = document.getElementById("ytFrame");
        if (ytFrame) ytFrame.src = `https://www.youtube.com/embed/${ytId}?autoplay=1&rel=0`;
        return;
    }

    document.getElementById("ytScreen").classList.add("hidden");
    document.getElementById("hlsScreen").classList.remove("hidden");

    if (!valid(cleanRaw)) {
        showLoader(false);
        return;
    }

    let tokMatch = cleanRaw.match(/(edge-cache-token=[^&]+)/);
    if (tokMatch) cachedToken = tokMatch[1];

    if (cleanRaw.includes(".mp4") && !cleanRaw.includes(".m3u8")) {
        v.src = cleanRaw;
        populateQualitySettings([]);
        v.onloadedmetadata = () => {
            showLoader(false);
            if (resumeSeekTime > 0) {
                v.currentTime = resumeSeekTime;
                resumeSeekTime = 0;
            }
            v.play().catch(() => {});
        };
        return;
    }

    let src = manifest(cleanRaw);

    if (Hls.isSupported()) {
        hls = new Hls({
            enableWorker: true,
            lowLatencyMode: false,
            backBufferLength: 30,
            maxBufferLength: 25,
            loader: BackendLoader
        });

        hls.on(Hls.Events.MEDIA_ATTACHED, () => hls.loadSource(src));

        hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
            showLoader(false);
            populateQualitySettings(data.levels || []);
            if (resumeSeekTime > 0) {
                v.currentTime = resumeSeekTime;
                resumeSeekTime = 0;
            }
            v.play().catch(() => {});
        });

        hls.on(Hls.Events.ERROR, (_, d) => {
            if (d.fatal) {
                showLoader(false);
                if (d.type === Hls.ErrorTypes.MEDIA_ERROR) {
                    try { hls.recoverMediaError(); } catch {}
                }
            }
        });

        hls.attachMedia(v);
    } else if (v.canPlayType("application/vnd.apple.mpegurl")) {
        v.src = src;
        v.onloadedmetadata = () => {
            showLoader(false);
            if (resumeSeekTime > 0) {
                v.currentTime = resumeSeekTime;
                resumeSeekTime = 0;
            }
            v.play().catch(() => {});
        };
    }
}

function populateQualitySettings(hlsLevels) {
    const qList = document.getElementById("qualityList");
    if (!qList) return;

    const activeInfo = (typeof state !== "undefined" && state.activeKey && state.mediaMap) ? state.mediaMap[state.activeKey] : null;
    const serverQualsObj = (activeInfo && activeInfo.qualities) ? activeInfo.qualities : {};
    const serverKeys = Object.keys(serverQualsObj);

    let html = "";

    if (serverKeys.length > 0) {
        const currentRaw = unwrapOriginalUrl(input.value);
        serverKeys.forEach((qKey, idx) => {
            const targetRaw = unwrapOriginalUrl(serverQualsObj[qKey]);
            const isAct = (currentRaw && targetRaw && currentRaw === targetRaw) || (!currentRaw && idx === 0);
            html += `<div class="q-option ${isAct ? 'active' : ''}" onclick="switchServerQuality('${qKey.replace(/'/g, "")}', this)">${qKey}</div>`;
        });
    } else if (hlsLevels && hlsLevels.length > 1) {
        html += `<div class="q-option active" onclick="changeHlsLevel(-1, this)">Auto</div>`;
        const seenHeights = new Set();
        hlsLevels.forEach((lvl, idx) => {
            let label = lvl.height ? `${lvl.height}p` : `${idx + 1}p`;
            if (!seenHeights.has(label)) {
                seenHeights.add(label);
                html += `<div class="q-option" onclick="changeHlsLevel(${idx}, this)">${label}</div>`;
            }
        });
    } else {
        html = `<div class="q-option active" onclick="toggleSettingsMenu()">720p HD</div>`;
    }

    qList.innerHTML = html;
}

window.changeHlsLevel = function(idx, el) {
    if (hls) hls.currentLevel = idx;
    document.querySelectorAll("#qualityList .q-option").forEach(o => o.classList.remove("active"));
    if (el) el.classList.add("active");
    toggleSettingsMenu();
};

window.switchServerQuality = function(qKey, el) {
    resumeSeekTime = v ? v.currentTime : 0;
    document.querySelectorAll("#qualityList .q-option").forEach(o => o.classList.remove("active"));
    if (el) el.classList.add("active");
    toggleSettingsMenu();
    if (typeof changeLectureQuality === "function") {
        changeLectureQuality(qKey, resumeSeekTime);
    }
};

window.changeSpd = function(rate, el) {
    if (v) v.playbackRate = rate;
    document.querySelectorAll(".spd-option").forEach(o => o.classList.remove("active"));
    if (el) el.classList.add("active");
    toggleSettingsMenu();
};

window.toggleSettingsMenu = function() {
    const menu = document.getElementById("settingsMenu");
    if (menu) menu.classList.toggle("show");
};

// TAP-TO-TOGGLE CONTROLS VISIBILITY LOGIC
const hlsScreen = document.getElementById("hlsScreen");
const playerControlsBar = document.getElementById("playerControlsBar");

if (hlsScreen) {
    hlsScreen.addEventListener("click", (e) => {
        // Prevent toggle if clicking directly on buttons or settings menu
        if (e.target.closest("button") || e.target.closest("input") || e.target.closest("#settingsMenu")) {
            return;
        }
        if (playerControlsBar) {
            playerControlsBar.classList.toggle("hidden-controls");
        }
        const menu = document.getElementById("settingsMenu");
        if (menu && menu.classList.contains("show")) {
            menu.classList.remove("show");
        }
    });
}

async function downloadMerged() {
    const raw = input ? unwrapOriginalUrl(input.value.trim()) : "";
    if (!valid(raw) || !hls || !hls.levels || hls.levels.length === 0) return;

    const box = document.getElementById("downloadBox");
    const text = document.getElementById("downloadText");
    const bar = document.getElementById("bar");
    if (box) box.classList.add("show");
    if (bar) bar.style.width = "2%";
    if (text) text.textContent = "Preparing video segments...";

    try {
        let levelIndex = hls.currentLevel >= 0 ? hls.currentLevel : 0;
        let fragments = hls.levels[levelIndex].details.fragments;
        let downloadedBuffers = [];
        let total = fragments.length;
        let match = raw.match(/(edge-cache-token=[^&]+)/);
        let tokenStr = match ? match[1] : cachedToken;

        if (fragments[0] && fragments[0].initSegment) {
            let initUrl = fragments[0].initSegment.url;
            if (!initUrl.includes("allswbatch22.workers.dev")) {
                if (tokenStr && !initUrl.includes("edge-cache-token=")) initUrl += (initUrl.includes("?") ? "&" : "?") + tokenStr;
                initUrl = SEGMENT + encodeURIComponent(initUrl);
            }
            let res = await fetch(initUrl);
            if (res.ok) downloadedBuffers.push(await res.arrayBuffer());
        }

        for (let i = 0; i < total; i++) {
            if (text) text.textContent = `Downloading: ${i + 1} / ${total} (${Math.round(((i + 1) / total) * 100)}%)`;
            let segUrl = fragments[i].url;
            if (!segUrl.includes("allswbatch22.workers.dev")) {
                if (tokenStr && !segUrl.includes("edge-cache-token=")) segUrl += (segUrl.includes("?") ? "&" : "?") + tokenStr;
                segUrl = SEGMENT + encodeURIComponent(segUrl);
            }
            let segRes = await fetch(segUrl);
            if (!segRes.ok) throw new Error(`Segment ${i + 1} Error`);
            downloadedBuffers.push(await segRes.arrayBuffer());
            if (bar) bar.style.width = Math.round(((i + 1) / total) * 100) + "%";
        }

        if (text) text.textContent = "Merging MP4 file...";
        const blob = new Blob(downloadedBuffers, { type: "video/mp4" });
        const finalUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = finalUrl;
        a.download = `RWA_Class_${Math.floor(Math.random() * 10000)}.mp4`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(finalUrl), 60000);
        if (text) text.textContent = "✅ Download Complete!";
        setTimeout(() => { if (box) box.classList.remove("show"); }, 4000);
    } catch (e) {
        if (text) text.textContent = "⚠️ Download error: " + e.message;
    }
}

function fmt(x) {
    if (!Number.isFinite(x)) return "00:00";
    x = Math.floor(x);
    let h = Math.floor(x / 3600), m = Math.floor(x % 3600 / 60), s = x % 60;
    return h
        ? `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
        : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const toggleBtn = document.getElementById("toggle");
if (toggleBtn) toggleBtn.onclick = () => v.paused ? v.play() : v.pause();

v.onplay = () => { if (toggleBtn) toggleBtn.textContent = "⏸"; showLoader(false); };
v.onpause = () => { if (toggleBtn) toggleBtn.textContent = "▶"; };
v.onwaiting = () => showLoader(true);
v.onplaying = () => showLoader(false);
v.oncanplay = () => showLoader(false);

const backBtn = document.getElementById("back");
if (backBtn) backBtn.onclick = () => v.currentTime = Math.max(0, v.currentTime - 10);

const nextBtn = document.getElementById("next");
if (nextBtn) nextBtn.onclick = () => v.currentTime = Math.min(v.duration || Infinity, v.currentTime + 10);

const muteBtn = document.getElementById("mute");
if (muteBtn) muteBtn.onclick = () => {
    v.muted = !v.muted;
    muteBtn.textContent = v.muted ? "🔇" : "🔊";
};

const dlBtn = document.getElementById("download");
if (dlBtn) dlBtn.onclick = downloadMerged;

const pipBtn = document.getElementById("pip");
if (pipBtn) pipBtn.onclick = async () => {
    try {
        if (document.pictureInPictureElement) await document.exitPictureInPicture();
        else if (v.requestPictureInPicture) await v.requestPictureInPicture();
    } catch {}
};

// FULLSCREEN & MINIMIZE BUTTON LOGIC
const fsBtn = document.getElementById("fs");
const headerBar = document.getElementById("playerHeaderBar");

if (fsBtn && hlsScreen) {
    fsBtn.onclick = async () => {
        try {
            if (!document.fullscreenElement) {
                await hlsScreen.requestFullscreen();
            } else {
                await document.exitFullscreen();
            }
        } catch {}
    };
}

document.addEventListener("fullscreenchange", () => {
    if (document.fullscreenElement) {
        if (headerBar) headerBar.classList.add("hidden");
        if (fsBtn) fsBtn.textContent = "🗗";
    } else {
        if (headerBar) headerBar.classList.remove("hidden");
        if (fsBtn) fsBtn.textContent = "⛶";
    }
});

v.ontimeupdate = () => {
    let d = v.duration;
    const seekEl = document.getElementById("seek");
    const timeEl = document.getElementById("time");
    if (Number.isFinite(d) && d > 0 && seekEl) seekEl.value = v.currentTime / d * 1000;
    if (timeEl) timeEl.textContent = fmt(v.currentTime) + " / " + fmt(d);
};

const seekEl = document.getElementById("seek");
if (seekEl) seekEl.oninput = e => {
    if (Number.isFinite(v.duration)) v.currentTime = e.target.value / 1000 * v.duration;
};
