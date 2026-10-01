// yoinks desktop — Electron main process.
// Runs yt-dlp + ffmpeg locally and talks to the UI over IPC (no web server).
const { app, BrowserWindow, ipcMain, dialog, shell, clipboard, nativeTheme } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const IS_WIN = process.platform === "win32";
const YTDLP_NAME = IS_WIN ? "yt-dlp.exe" : "yt-dlp";
const GH = "https:" + "//github.com/yt-dlp/yt-dlp/releases/latest/download/";

let win = null;
let YTDLP = null;
let FFMPEG = null;
const jobs = new Map();

// ---------- settings ----------
const settingsFile = () => path.join(app.getPath("userData"), "settings.json");
function loadSettings() {
  const defaults = { saveDir: app.getPath("downloads"), theme: "auto", watchClipboard: true };
  try {
    return { ...defaults, ...JSON.parse(fs.readFileSync(settingsFile(), "utf8")) };
  } catch {
    return defaults;
  }
}
let settings;
function saveSettings() {
  fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
  fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2));
}

// ---------- binaries ----------
function ytdlpAsset() {
  if (IS_WIN) return "yt-dlp.exe";
  if (process.platform === "darwin") return "yt-dlp_macos";
  return process.arch === "arm64" ? "yt-dlp_linux_aarch64" : "yt-dlp_linux";
}

// We keep a writable copy of yt-dlp in the user's app-data folder so it can self-update
// (Program Files is read-only for normal users).
async function ensureYtDlp() {
  const userBin = path.join(app.getPath("userData"), "bin");
  const target = path.join(userBin, YTDLP_NAME);
  if (fs.existsSync(target)) return target;
  await fsp.mkdir(userBin, { recursive: true });
  const bundled = app.isPackaged
    ? path.join(process.resourcesPath, "bin", YTDLP_NAME)
    : path.join(__dirname, "bin", YTDLP_NAME);
  if (fs.existsSync(bundled)) {
    await fsp.copyFile(bundled, target);
  } else {
    sendStatus("Downloading yt-dlp (first run only)…");
    const res = await fetch(GH + ytdlpAsset());
    if (!res.ok) throw new Error("Couldn't download yt-dlp (" + res.status + ")");
    await fsp.writeFile(target, Buffer.from(await res.arrayBuffer()));
  }
  if (!IS_WIN) await fsp.chmod(target, 0o755);
  return target;
}

function findFfmpeg() {
  try {
    let p = require("ffmpeg-static");
    if (p) p = p.replace("app.asar" + path.sep, "app.asar.unpacked" + path.sep);
    if (p && fs.existsSync(p)) return p;
  } catch {}
  return null; // fall back to ffmpeg on PATH (yt-dlp finds it itself)
}

function selfUpdate() {
  // Sites change often; keep yt-dlp fresh in the background. Failures are harmless.
  const p = spawn(YTDLP, ["-U"], { windowsHide: true });
  p.on("error", () => {});
}

function sendStatus(msg) {
  if (win && !win.isDestroyed()) win.webContents.send("status", msg);
}

// ---------- yt-dlp helpers ----------
const baseArgs = () => ["--no-playlist", "--no-warnings", "--no-mtime", ...(FFMPEG ? ["--ffmpeg-location", FFMPEG] : [])];

function cleanErr(s) {
  const line = s.split("\n").reverse().find((l) => l.includes("ERROR"));
  return (line || s.trim().split("\n").pop() || "").replace(/^ERROR:\s*/, "").trim().slice(0, 300);
}

function validUrl(u) {
  try {
    const p = new URL(u);
    return p.protocol === "http:" || p.protocol === "https:";
  } catch {
    return false;
  }
}

function run(args) {
  return new Promise((resolve, reject) => {
    const p = spawn(YTDLP, args, { windowsHide: true });
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(cleanErr(err) || "yt-dlp exited with code " + code))));
  });
}

// Cache of the last lookup per URL so downloads know the expected size + video id.
const infoCache = new Map();

function sizeOf(f, dur) {
  if (!f) return 0;
  return f.filesize || f.filesize_approx || (f.tbr && dur ? (f.tbr * 1000 / 8) * dur : 0);
}

async function getInfo(url) {
  if (!validUrl(url)) throw new Error("That doesn't look like a valid link.");
  const info = JSON.parse(await run([...baseArgs(), "-J", url]));
  const dur = info.duration || 0;
  const fmts = info.formats || [];

  const videos = fmts.filter((f) => f.vcodec && f.vcodec !== "none" && f.height);
  const audios = fmts
    .filter((f) => f.acodec && f.acodec !== "none" && (!f.vcodec || f.vcodec === "none"))
    .sort((a, b) => (b.abr || b.tbr || 0) - (a.abr || a.tbr || 0));
  const bestAudio = audios[0] || null;

  // Mirror yt-dlp's "bv*[height<=H]+ba" choice: tallest video <= H, highest bitrate.
  const pickVideo = (h) => {
    const c = videos.filter((f) => f.height <= h);
    if (!c.length) return null;
    const maxH = Math.max(...c.map((f) => f.height));
    return c.filter((f) => f.height === maxH).sort((a, b) => (b.tbr || 0) - (a.tbr || 0))[0];
  };
  const estimate = (h) => {
    const v = pickVideo(h);
    if (!v) return null;
    let s = sizeOf(v, dur);
    if (!v.acodec || v.acodec === "none") s += sizeOf(bestAudio, dur); // separate audio stream gets merged
    return s || null;
  };

  const heights = [...new Set(videos.map((f) => f.height))].sort((a, b) => b - a);
  const standard = [2160, 1440, 1080, 720, 480, 360, 240, 144];
  const resolutions = standard.filter((h) => heights.some((a) => a <= h && a > h * 0.8));
  if (!resolutions.length && heights[0]) resolutions.push(heights[0]);

  const sizes = { best: estimate(Infinity) || info.filesize || info.filesize_approx || null, mp3: null };
  for (const h of resolutions) sizes[h] = estimate(h);
  // mp3 at --audio-quality 0 (VBR V0) averages ~245 kbps
  sizes.mp3 = dur ? Math.round((245000 / 8) * dur) : sizeOf(bestAudio, dur) || null;

  infoCache.set(url, { id: info.id || null, sizes });
  return {
    title: info.title || "Untitled",
    uploader: info.uploader || info.channel || info.uploader_id || "",
    duration: dur || null,
    thumbnail: info.thumbnail || null,
    site: info.extractor_key || info.extractor || "",
    resolutions,
    sizes,
    hasVideo: heights.length > 0 || (info.vcodec && info.vcodec !== "none") || /^(mp4|webm|mov|mkv)$/i.test(info.ext || ""),
  };
}

function startDownload(url, choice) {
  if (!validUrl(url)) throw new Error("That doesn't look like a valid link.");
  if (!/^(best|mp3|\d{3,4})$/.test(String(choice))) throw new Error("Unknown format.");
  if (choice === "mp3" && !FFMPEG) throw new Error("ffmpeg is missing, so mp3 isn't available.");

  const id = crypto.randomUUID();
  const saveDir = settings.saveDir;
  fs.mkdirSync(saveDir, { recursive: true });
  const cached = infoCache.get(url) || {};
  // For mp3 the download is the source audio; the final mp3 size is only shown in the picker.
  const expected = choice === "mp3" ? null : (cached.sizes && cached.sizes[choice]) || null;

  let fmt;
  if (choice === "mp3") fmt = ["-f", "ba/b", "-x", "--audio-format", "mp3", "--audio-quality", "0"];
  else if (choice === "best") fmt = ["-f", "bv*+ba/b", "--merge-output-format", "mp4"];
  else fmt = ["-f", "bv*[height<=" + choice + "]+ba/b[height<=" + choice + "]/b", "--merge-output-format", "mp4"];

  const args = [
    ...baseArgs(), ...fmt,
    "--newline", "--progress", "--progress-delta", "0.4", "--windows-filenames",
    "--progress-template",
    "download:PROG %(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s|%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s",
    "--print", "after_move:FILE %(filepath)s",
    "-P", saveDir, "-o", "%(title).150B [%(id)s].%(ext)s", url,
  ];
  // Windows fix: yt-dlp.exe is a bundled Python app, and Python buffers output when it's
  // piped, so progress arrived in big late chunks. Force unbuffered UTF-8 output.
  const env = { ...process.env, PYTHONUNBUFFERED: "1", PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" };
  const p = spawn(YTDLP, args, { windowsHide: true, env });
  const job = { id, proc: p, status: "downloading", progress: 0, speed: "", eta: "", downloaded: 0, total: expected,
    file: null, error: null, cancelled: false };
  jobs.set(id, job);

  let stderr = "", base = 0, lastTotal = 0, lastPct = 0, lastLineAt = 0, startedAt = Date.now();
  const push = () => win && !win.isDestroyed() && win.webContents.send("progress", pub(job));
  const num = (s) => { const n = parseFloat(s); return Number.isFinite(n) ? n : 0; };

  const handleLine = (line) => {
    let m;
    if ((m = line.match(/^PROG\s+([\d.]+)%\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|(.*)$/))) {
      const pct = parseFloat(m[1]);
      const done = num(m[4]);
      const tot = num(m[5]) || num(m[6]);
      if (pct < lastPct - 50) base += lastTotal; // a new stream (e.g. audio after video) started
      lastPct = pct; lastTotal = tot || lastTotal;
      job.downloaded = base + done;
      const total = expected || base + tot || 0;
      job.total = total || null;
      job.progress = total ? Math.min(99, (job.downloaded / total) * 100) : Math.min(99, pct);
      job.speed = m[2].trim();
      job.eta = m[3].trim();
      lastLineAt = Date.now();
      push();
    } else if ((m = line.match(/^FILE (.+)$/))) {
      job.file = m[1].trim();
    } else if (/\[(Merger|ExtractAudio|VideoConvertor|FixupM3u8)\]/.test(line)) {
      job.status = "processing";
      push();
    }
  };
  const lineReader = () => {
    let buf = "";
    return (chunk) => {
      buf += chunk.toString("utf8");
      const lines = buf.split(/\r\n|\r|\n/); // Windows may use \r for progress updates
      buf = lines.pop();
      for (const l of lines) if (l) handleLine(l);
    };
  };
  p.stdout.on("data", lineReader());
  const errReader = lineReader();
  p.stderr.on("data", (d) => { stderr += d; errReader(d); });

  // Safety net: if progress lines go quiet, measure the partial files on disk instead.
  const poll = setInterval(async () => {
    if (job.status !== "downloading" || Date.now() - lastLineAt < 1500 || !cached.id) return;
    try {
      const tag = "[" + cached.id + "]";
      let bytes = 0;
      for (const f of await fsp.readdir(saveDir)) {
        if (!f.includes(tag)) continue;
        const st = await fsp.stat(path.join(saveDir, f));
        if (st.mtimeMs >= startedAt - 1000) bytes += st.size;
      }
      if (bytes > job.downloaded) {
        const secs = (Date.now() - startedAt) / 1000;
        job.downloaded = bytes;
        if (expected) job.progress = Math.min(99, (bytes / expected) * 100);
        job.speed = secs > 0 ? fmtBytes(bytes / secs) + "/s" : "";
        job.eta = expected && bytes / secs > 0 ? fmtEta((expected - bytes) / (bytes / secs)) : "";
        push();
      }
    } catch {}
  }, 700);

  p.on("error", (e) => { clearInterval(poll); job.status = "error"; job.error = e.message; push(); });
  p.on("close", (code) => {
    clearInterval(poll);
    if (job.cancelled) job.status = "cancelled";
    else if (code === 0) { job.status = "done"; job.progress = 100; }
    else { job.status = "error"; job.error = cleanErr(stderr) || "Download failed"; }
    if (job.status === "done" && job.file) {
      try { job.downloaded = fs.statSync(job.file).size; job.total = job.downloaded; } catch {}
    }
    push();
    setTimeout(() => jobs.delete(id), 60_000);
  });
  return pub(job);
}

function fmtBytes(n) {
  if (!n) return "0 B";
  const u = ["B", "KiB", "MiB", "GiB"];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return n.toFixed(n >= 100 || i === 0 ? 0 : 1) + u[i];
}
function fmtEta(s) {
  s = Math.max(0, Math.round(s));
  return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
}

function pub(j) {
  return { id: j.id, status: j.status, progress: j.progress, speed: j.speed, eta: j.eta, error: j.error,
    downloaded: j.downloaded || 0, total: j.total || null,
    file: j.file, fileName: j.file ? path.basename(j.file) : null };
}

function killTree(p) {
  if (!p || p.exitCode !== null) return;
  if (IS_WIN) spawn("taskkill", ["/pid", String(p.pid), "/T", "/F"], { windowsHide: true });
  else p.kill("SIGTERM");
}

// ---------- IPC ----------
function wrap(fn) {
  return async (_e, ...args) => {
    try { return { ok: true, data: await fn(...args) }; }
    catch (e) { return { ok: false, error: e.message || String(e) }; }
  };
}

ipcMain.handle("ready", wrap(async () => {
  if (!YTDLP) YTDLP = await ensureYtDlp();
  return { ffmpeg: !!FFMPEG, version: app.getVersion() };
}));
ipcMain.handle("settings:get", wrap(() => settings));
ipcMain.handle("settings:set", wrap((patch) => {
  const allowed = ["theme", "watchClipboard"];
  for (const k of allowed) if (k in patch) settings[k] = patch[k];
  if ("theme" in patch) nativeTheme.themeSource = settings.theme === "auto" ? "system" : settings.theme;
  saveSettings();
  return settings;
}));
ipcMain.handle("folder:choose", wrap(async () => {
  const r = await dialog.showOpenDialog(win, { title: "Choose where to save videos", defaultPath: settings.saveDir, properties: ["openDirectory", "createDirectory"] });
  if (!r.canceled && r.filePaths[0]) { settings.saveDir = r.filePaths[0]; saveSettings(); }
  return settings.saveDir;
}));
ipcMain.handle("folder:open", wrap(() => shell.openPath(settings.saveDir)));
ipcMain.handle("file:show", wrap((p) => {
  if (p && fs.existsSync(p)) shell.showItemInFolder(p); else shell.openPath(settings.saveDir);
}));
ipcMain.handle("file:open", wrap((p) => p && fs.existsSync(p) && shell.openPath(p)));
ipcMain.handle("clipboard:read", wrap(() => clipboard.readText().trim()));
ipcMain.handle("video:info", wrap((url) => getInfo(url)));
ipcMain.handle("video:download", wrap((url, choice) => startDownload(url, choice)));
ipcMain.handle("video:cancel", wrap((id) => {
  const j = jobs.get(id);
  if (j) { j.cancelled = true; killTree(j.proc); }
}));

// ---------- window ----------
function createWindow() {
  win = new BrowserWindow({
    width: 760, height: 760, minWidth: 420, minHeight: 560,
    title: "yoinks", autoHideMenuBar: true, show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#191919" : "#FFFFFF",
    icon: path.join(__dirname, "build", "icon.png"),
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname, "renderer", "index.html"));
  win.once("ready-to-show", () => win.show());
  // open external links in the real browser, never inside the app
  win.webContents.setWindowOpenHandler(({ url }) => { if (validUrl(url)) shell.openExternal(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e) => e.preventDefault());
  win.on("focus", () => win.webContents.send("focus"));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(async () => {
    app.setAppUserModelId("com.yoinks.desktop");
    settings = loadSettings();
    nativeTheme.themeSource = settings.theme === "auto" ? "system" : settings.theme;
    FFMPEG = findFfmpeg();
    createWindow();
    try { YTDLP = await ensureYtDlp(); selfUpdate(); } catch (e) { sendStatus(e.message); }
  });
  app.on("window-all-closed", () => {
    for (const j of jobs.values()) killTree(j.proc);
    app.quit();
  });
}
