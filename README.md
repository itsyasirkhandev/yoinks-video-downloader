<p align="center">
  <img src="build/icon.png" width="112" alt="yoinks video downloader logo" />
</p>

<h1 align="center">yoinks: Free Video Downloader for YouTube, TikTok, Instagram & X</h1>

<p align="center">
  <b>Download videos from YouTube, TikTok, Instagram Reels, X (Twitter), Facebook, Reddit, Threads and 1,800+ sites.</b><br />
  A free, open-source desktop app for <b>Windows, macOS and Linux</b>. Save as MP4 in 4K, 1080p or 720p, or as MP3 audio.<br />
  No ads, no popups, no fake download buttons, no account.
</p>

<p align="center">
  <a href="https://github.com/itsyasirkhandev/yoinks-video-downloader/releases/latest"><img alt="Download" src="https://img.shields.io/github/v/release/itsyasirkhandev/yoinks-video-downloader?label=download&style=for-the-badge&color=2783DE" /></a>
  <img alt="Platforms" src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-2C2C2B?style=for-the-badge" />
  <img alt="License MIT" src="https://img.shields.io/badge/license-MIT-46A171?style=for-the-badge" />
  <a href="https://github.com/itsyasirkhandev/yoinks-video-downloader/stargazers"><img alt="GitHub stars" src="https://img.shields.io/github/stars/itsyasirkhandev/yoinks-video-downloader?style=for-the-badge&color=D5803B" /></a>
</p>

---

## ⬇️ Download

Go to the **[latest release](https://github.com/itsyasirkhandev/yoinks-video-downloader/releases/latest)** and download the file for your computer:

| Your computer | File to download |
| --- | --- |
| **Windows 10 / 11** | `yoinks-Setup-x.x.x.exe` (installer) or `yoinks-Portable-x.x.x.exe` (no install) |
| **macOS** (Apple Silicon, M1–M4) | `yoinks-x.x.x-mac-arm64.dmg` |
| **Linux** | `yoinks-x.x.x-linux-x86_64.AppImage` or `.deb` (Ubuntu / Debian) |

## ✨ Features

- **One-paste video downloads.** Paste a link, pick a quality, done.
- **Works with 1,800+ websites:** YouTube, YouTube Shorts, TikTok, Instagram (Reels, posts, stories), X / Twitter, Facebook, Reddit, Threads, Vimeo, Twitch clips, Dailymotion, SoundCloud and more.
- **Choose your quality:** 4K (2160p), 1440p, 1080p Full HD, 720p HD, 480p, 360p, or "Best quality".
- **Audio only (MP3).** Convert videos to high-quality MP3.
- **Clipboard detection.** Copy a video link anywhere and yoinks offers to download it.
- **Live progress.** See the download speed, ETA, and a cancel button.
- **Save anywhere.** Saves to your Downloads folder or any folder you pick, with "Open" and "Show in folder" buttons.
- **Auto-updating engine.** The bundled yt-dlp updates itself, so downloads keep working when sites change.
- **Light and dark themes**, plus keyboard shortcuts (↑/↓, 1–9, Enter, Esc).
- **Private.** Everything runs on your computer. No servers, no tracking, no sign-up.

## 🚀 How to download a video

1. Copy the video link from YouTube, TikTok, Instagram, X or any supported site.
2. Open **yoinks** and paste the link (or click the copied-link suggestion).
3. Pick a resolution (for example 1080p MP4) or **Audio only** for MP3.
4. Click **Download**. Your file is saved to your Downloads folder.

## 🛠️ First launch notes

- **Windows:** if SmartScreen says "Windows protected your PC", click **More info** and then **Run anyway**. This appears because the app isn't code-signed.
- **macOS:** drag yoinks to Applications. If macOS says the app is "damaged", run this once in Terminal:
  `xattr -cr /Applications/yoinks.app`
- **Linux (AppImage):** right-click the file, choose **Properties**, then **Permissions**, enable **Allow executing**, and double-click it.

## 🧑‍💻 Build from source

Requires Node.js 18+.

```sh
git clone https://github.com/itsyasirkhandev/yoinks-video-downloader.git
cd yoinks-video-downloader
npm install
npm start            # run the app
npm run dist         # build an installer for your current OS
```

The GitHub Actions workflow builds Windows, macOS and Linux installers automatically for every version tag (`v*`).

## ❓ FAQ

**Is yoinks free?** Yes. It's free and open source under the MIT license.

**Can I download YouTube videos in 4K or 1080p?** Yes. yoinks lists every resolution a video has, up to 4K/2160p.

**Can I convert YouTube to MP3?** Yes. Choose **Audio only** to save an MP3.

**Does it download TikTok and Instagram Reels?** Yes, along with X/Twitter videos, Facebook videos, Reddit videos and 1,800+ other sites.

**Do I need Python, yt-dlp or ffmpeg?** No. They're bundled or fetched automatically.

**A site stopped working?** Restart the app. yt-dlp auto-updates on launch.

## 🙏 Credits

- Inspired by [yoinks](https://github.com/pablostanley/yoinks) by Pablo Stanley, the terminal video downloader. This project is a desktop GUI take on the same idea.
- Powered by [yt-dlp](https://github.com/yt-dlp/yt-dlp) and [FFmpeg](https://ffmpeg.org), and built with [Electron](https://www.electronjs.org).

## ⚖️ Fair use

yoinks is a personal-archiving tool. Downloading content may violate a platform's terms of service. Only download videos you have the right to keep, and respect creators.

## License

[MIT](LICENSE)

<sub>Keywords: video downloader, YouTube downloader, YouTube to MP3, TikTok downloader, Instagram Reels downloader, Twitter video downloader, X video downloader, Facebook video downloader, Reddit video downloader, 4K video downloader, yt-dlp GUI, desktop app for Windows, macOS, Linux.</sub>
