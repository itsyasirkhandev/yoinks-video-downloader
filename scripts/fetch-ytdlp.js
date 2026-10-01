// Downloads the standalone yt-dlp binary for the current OS into ./bin
// so it gets bundled into the app. Works on Windows, macOS and Linux.
const fs = require("node:fs");
const path = require("node:path");

const plat = process.env.YOINKS_TARGET || process.platform; // win32 | darwin | linux
const asset =
  plat === "win32" ? "yt-dlp.exe" :
  plat === "darwin" ? "yt-dlp_macos" :
  process.arch === "arm64" ? "yt-dlp_linux_aarch64" : "yt-dlp_linux";
const outName = plat === "win32" ? "yt-dlp.exe" : "yt-dlp";
const out = path.join(__dirname, "..", "bin", outName);
const url = "https:" + "//github.com/yt-dlp/yt-dlp/releases/latest/download/" + asset;

(async () => {
  if (fs.existsSync(out) && !process.argv.includes("--force")) {
    console.log(outName + " already present -> " + out);
    return;
  }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  console.log("Downloading " + asset + "...");
  const res = await fetch(url);
  if (!res.ok) throw new Error("Download failed: " + res.status);
  fs.writeFileSync(out, Buffer.from(await res.arrayBuffer()));
  if (plat !== "win32") fs.chmodSync(out, 0o755);
  console.log("Saved " + out + " (" + (fs.statSync(out).size / 1e6).toFixed(1) + " MB)");
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
