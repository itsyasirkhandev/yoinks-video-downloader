const $ = (id) => document.getElementById(id);
const api = window.yoinks;
const state = { url: "", info: null, choice: null, busy: false, jobId: null, lastFile: null, ignoredClip: "", settings: null };

// ---------- theme ----------
const themes = ["auto", "light", "dark"];
async function setTheme(t) {
  state.settings = await api.setSettings({ theme: t });
  $("theme").textContent = "theme: " + t;
}
$("theme").onclick = () => setTheme(themes[(themes.indexOf(state.settings.theme) + 1) % 3]);

// ---------- folder ----------
function renderFolder() {
  $("openFolder").textContent = state.settings.saveDir;
  $("openFolder").title = "Open " + state.settings.saveDir;
}
$("openFolder").onclick = () => api.openFolder();
$("changeFolder").onclick = async () => {
  state.settings.saveDir = await api.chooseFolder();
  renderFolder();
};

// ---------- notices ----------
function notice(msg, kind, file) {
  const n = $("notice");
  if (!msg) { n.hidden = true; return; }
  n.className = "notice " + kind;
  $("noticeText").textContent = msg;
  $("noticeActions").hidden = !file;
  state.lastFile = file || null;
  n.hidden = false;
}
$("openFile").onclick = () => api.openFile(state.lastFile);
$("showFile").onclick = () => api.showFile(state.lastFile);

function fmtDur(s) {
  if (!s) return "";
  s = Math.round(s);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = String(s % 60).padStart(2, "0");
  return h ? h + ":" + String(m).padStart(2, "0") + ":" + sec : m + ":" + sec;
}
const tag = (h) => (h >= 2160 ? "4K" : h >= 1440 ? "2K" : h >= 720 ? "HD" : "SD");
const isUrl = (s) => /^https?:\/\/\S+$/i.test(s);

// ---------- clipboard detection ----------
async function checkClipboard() {
  if (!state.settings || !state.settings.watchClipboard || state.busy) return;
  try {
    const clip = await api.readClipboard();
    const show = isUrl(clip) && clip !== state.ignoredClip && clip !== state.url && !$("url").value;
    $("suggest").hidden = !show;
    if (show) $("suggestUrl").textContent = clip;
  } catch {}
}
$("suggest").onclick = () => {
  const u = $("suggestUrl").textContent;
  state.ignoredClip = u;
  $("suggest").hidden = true;
  $("url").value = u;
  $("form").requestSubmit();
};
api.onFocus(checkClipboard);

// ---------- flow ----------
function reset() {
  if (state.busy) return;
  state.info = null; state.choice = null;
  $("picker").hidden = true; $("loading").hidden = true; notice("");
  $("url").value = ""; $("url").focus(); $("go").disabled = false;
  checkClipboard();
}
$("home").onclick = reset;
$("back").onclick = reset;

$("form").onsubmit = async (e) => {
  e.preventDefault();
  const url = $("url").value.trim();
  if (!url || state.busy) return;
  state.url = url; notice(""); $("suggest").hidden = true;
  $("picker").hidden = true; $("loading").hidden = false; $("go").disabled = true;
  $("loadingText").textContent = "Looking up that video…";
  try {
    state.info = await api.info(url);
    renderPicker();
  } catch (err) {
    notice("Couldn't yoink that: " + (err.message || "unknown error"), "err");
  } finally {
    $("loading").hidden = true; $("go").disabled = false;
  }
};

function renderPicker() {
  const i = state.info;
  $("title").textContent = i.title;
  $("sub").textContent = [i.site, i.uploader, fmtDur(i.duration)].filter(Boolean).join(" · ");
  if (i.thumbnail) { $("thumb").src = i.thumbnail; $("thumb").hidden = false; } else $("thumb").hidden = true;
  const opts = [];
  if (i.hasVideo || i.resolutions.length) {
    opts.push({ v: "best", name: "Best quality", k: i.resolutions[0] ? i.resolutions[0] + "p · mp4" : "mp4" });
    for (const h of i.resolutions) opts.push({ v: String(h), name: h + "p", k: tag(h) + " · mp4" });
  }
  opts.push({ v: "mp3", name: "Audio only", k: "mp3" });
  const box = $("formats");
  box.textContent = "";
  opts.forEach((o, idx) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "fmt"; b.setAttribute("role", "radio"); b.dataset.v = o.v;
    const l = document.createElement("span"); l.className = "label";
    const r = document.createElement("span"); r.className = "radio";
    const n = document.createElement("span"); n.textContent = o.name;
    const k = document.createElement("span"); k.className = "k"; k.textContent = (idx < 9 ? idx + 1 + " · " : "") + o.k;
    l.append(r, n); b.append(l, k);
    b.onclick = () => select(o.v);
    b.ondblclick = () => { select(o.v); download(); };
    box.appendChild(b);
  });
  select(opts[0].v);
  $("actions").hidden = false; $("progress").hidden = true;
  $("picker").hidden = false;
  box.querySelector('[aria-checked="true"]').focus();
}

function select(v) {
  state.choice = v;
  for (const b of document.querySelectorAll(".fmt")) {
    const on = b.dataset.v === v;
    b.setAttribute("aria-checked", String(on)); b.tabIndex = on ? 0 : -1;
  }
}

$("dl").onclick = () => download();
$("cancel").onclick = () => state.jobId && api.cancel(state.jobId);

async function download() {
  if (state.busy || !state.choice) return;
  state.busy = true; notice("");
  $("actions").hidden = true; $("progress").hidden = false;
  for (const b of document.querySelectorAll(".fmt")) b.disabled = true;
  setProgress({ status: "downloading", progress: 0 });
  try {
    const job = await api.download(state.url, state.choice);
    state.jobId = job.id;
  } catch (err) {
    notice("Download failed: " + (err.message || "unknown error"), "err");
    finish();
  }
}

api.onProgress((j) => {
  if (j.id !== state.jobId) return;
  setProgress(j);
  if (j.status === "done") {
    notice("Yoinked! Saved " + (j.fileName ? "“" + j.fileName + "”" : "your file"), "ok", j.file || "");
    if (!j.file) $("noticeActions").hidden = false;
    finish();
  } else if (j.status === "error") {
    notice("Download failed: " + j.error, "err"); finish();
  } else if (j.status === "cancelled") {
    notice("Download cancelled.", "info"); finish();
  }
});

function finish() {
  state.busy = false; state.jobId = null;
  $("actions").hidden = false; $("progress").hidden = true;
  for (const b of document.querySelectorAll(".fmt")) b.disabled = false;
}

function setProgress(j) {
  const processing = j.status === "processing";
  $("pstatus").textContent = processing ? "Merging & converting…" : j.status === "done" ? "Done" : "Downloading…";
  $("ppct").textContent = processing ? "" : Math.round(j.progress || 0) + "%";
  $("bar").classList.toggle("indeterminate", processing);
  $("fill").style.width = processing ? "" : (j.progress || 0) + "%";
  $("pspeed").textContent = j.speed && !processing && j.speed !== "NA" ? j.speed : "";
  $("peta").textContent = j.eta && !processing && j.eta !== "NA" ? "ETA " + j.eta : "";
}

// ---------- keyboard ----------
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { reset(); return; }
  if ($("picker").hidden || state.busy || document.activeElement === $("url")) return;
  const btns = [...document.querySelectorAll(".fmt")];
  const idx = btns.findIndex((b) => b.dataset.v === state.choice);
  const go = (b) => { if (b) { select(b.dataset.v); b.focus(); } };
  if (e.key === "ArrowDown" || e.key === "j") { e.preventDefault(); go(btns[Math.min(btns.length - 1, idx + 1)]); }
  else if (e.key === "ArrowUp" || e.key === "k") { e.preventDefault(); go(btns[Math.max(0, idx - 1)]); }
  else if (/^[1-9]$/.test(e.key)) go(btns[+e.key - 1]);
  else if (e.key === "Enter") { e.preventDefault(); download(); }
});

api.onStatus((msg) => notice(msg, "info"));

// ---------- boot ----------
(async () => {
  state.settings = await api.getSettings();
  $("theme").textContent = "theme: " + state.settings.theme;
  renderFolder();
  $("url").focus();
  checkClipboard();
  try {
    $("go").disabled = true;
    const r = await api.ready();
    if ($("notice").classList.contains("info")) notice("");
    if (!r.ffmpeg) notice("ffmpeg wasn't found, so high-res merging and mp3 may not work.", "err");
  } catch (e) {
    notice("Setup failed: " + e.message, "err");
  } finally {
    $("go").disabled = false;
  }
})();
