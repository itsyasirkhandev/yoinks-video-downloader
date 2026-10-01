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

async function getInfo(url) {
  if (!validUrl(url)) throw new Error("That doesn't look like a valid link.");
  const info = JSON.parse(await run([...baseArgs(), "-J", url]));
  const heights = new Set();
  for (const f of info.formats || []) if (f.vcodec && f.vcodec !== "none" && f.height) heights.add(f.height);
  const available = [...heights].sort((a, b) => b - a);
  const standard = [2160, 1440, 1080, 720, 480, 360, 240, 144];
  const resolutions = standard.filter((h) => available.some((a) => a <= h && a > h * 0.8));
  if (!resolutions.length && available[0]) resolutions.push(available[0]);
  return {
    title: info.title || "Untitled",
    uploader: info.uploader || info.channel || info.uploader_id || "",
    duration: info.duration || null,
    thumbnail: info.thumbnail || null,
    site: info.extractor_key || info.extractor || "",
    resolutions,
    hasVideo: available.length > 0 || (info.vcodec && info.vcodec !== "none") || /\.(mp4|webm|mov|mkv)$/i.test(info.ext ? "." + info.ext : ""),
  };
}

function startDownload(url, choice) {
  if (!validUrl(url)) throw new Error("That doesn't look like a valid link.");
  if (!/^(best|mp3|\d{3,4})$/.test(String(choice))) throw new Error("Unknown format.");
  if (choice === "mp3" && !FFMPEG) throw new Error("ffmpeg is missing, so mp3 isn't available.");

  const id = crypto.randomUUID();
  const saveDir = settings.saveDir;
  fs.mkdirSync(saveDir, { recursive: true });

  let fmt;
  if (choice === "mp3") fmt = ["-x", "--audio-format", "mp3", "--audio-quality", "0"];
  else if (choice === "best") fmt = ["-f", "bv*+ba/b", "--merge-output-format", "mp4"];
  else fmt = ["-f", "bv*[height<=" + choice + "]+ba/b[height<=" + choice + "]/b", "--merge-output-format", "mp4"];

  const args = [
    ...baseArgs(), ...fmt, "--newline", "--windows-filenames",
    "--progress-template", "download:PROG %(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s",
    "--print", "after_move:FILE %(filepath)s",
    "-P", saveDir, "-o", "%(title).150B [%(id)s].%(ext)s", url,
  ];
  const p = spawn(YTDLP, args, { windowsHide: true });
  const job = { id, proc: p, status: "downloading", progress: 0, speed: "", eta: "", file: null, error: null, cancelled: false };
  jobs.set(id, job);

  let stderr = "", stage = 0, last = 0, buf = "";
  const push = () => win && !win.isDestroyed() && win.webContents.send("progress", pub(job));
  p.stdout.on("data", (chunk) => {
    buf += chunk.toString();
    const lines = buf.split(/\r?\n/);
    buf = lines.pop();
    for (const line of lines) {
      let m;
      if ((m = line.match(/^PROG\s+([\d.]+)%\|([^|]*)\|(.*)$/))) {
        const pct = parseFloat(m[1]);
        if (pct < last - 50) stage++; // second stream (audio) started
        last = pct;
        job.progress = Math.min(99, stage > 0 ? 50 + pct / 2 : pct);
        job.speed = m[2].trim();
        job.eta = m[3].trim();
        push();
      } else if ((m = line.match(/^FILE (.+)$/))) {
        job.file = m[1].trim();
      } else if (/\[(Merger|ExtractAudio|VideoConvertor|FixupM3u8)\]/.test(line)) {
        job.status = "processing";
        push();
      }
    }
  });
  p.stderr.on("data", (d) => (stderr += d));
  p.on("error", (e) => { job.status = "error"; job.error = e.message; push(); });
  p.on("close", (code) => {
    if (job.cancelled) { job.status = "cancelled"; }
    else if (code === 0 && job.file) { job.status = "done"; job.progress = 100; }
    else if (code === 0) { job.status = "done"; job.progress = 100; job.file = null; }
    else { job.status = "error"; job.error = cleanErr(stderr) || "Download failed"; }
    push();
    setTimeout(() => jobs.delete(id), 60_000);
  });
  return pub(job);
}

function pub(j) {
  return { id: j.id, status: j.status, progress: j.progress, speed: j.speed, eta: j.eta, error: j.error,
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
