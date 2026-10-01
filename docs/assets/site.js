(function () {
  var REPO = "itsyasirkhandev/yoinks-video-downloader";
  var API = "https:" + "//api.github.com/repos/" + REPO;
  var root = document.documentElement;
  var $ = function (id) { return document.getElementById(id); };

  // ---------- theme toggle ----------
  var mq = window.matchMedia("(prefers-color-scheme: dark)");
  var btn = $("themeToggle");
  function current() { return root.getAttribute("data-theme") || (mq.matches ? "dark" : "light"); }
  function syncLabel() { btn.setAttribute("aria-label", current() === "dark" ? "Switch to light theme" : "Switch to dark theme"); }
  btn.addEventListener("click", function () {
    var next = current() === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try { localStorage.setItem("yoinks-theme", next); } catch (e) {}
    syncLabel();
  });
  if (mq.addEventListener) mq.addEventListener("change", syncLabel);
  syncLabel();

  // ---------- scroll reveal, once ----------
  var items = document.querySelectorAll(".reveal, .reveal-group");
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
      });
    }, { rootMargin: "0px 0px -10% 0px", threshold: 0.15 });
    items.forEach(function (el) { io.observe(el); });
  } else {
    items.forEach(function (el) { el.classList.add("in"); });
  }

  // ---------- OS detection ----------
  var ua = navigator.userAgent || "";
  var plat = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || "";
  var mobile = /Android|iPhone|iPad|iPod/i.test(ua) || (navigator.userAgentData && navigator.userAgentData.mobile);
  var os = mobile ? "mobile" : /Win/i.test(plat + ua) ? "windows" : /Mac/i.test(plat + ua) ? "mac" : /Linux|X11/i.test(plat + ua) ? "linux" : "other";
  var primary = { windows: "setup", mac: "dmg", linux: "appimage" }[os];
  var names = { windows: "Download for Windows", mac: "Download for Mac", linux: "Download for Linux" };

  if (os === "mobile") {
    $("dlLabel").textContent = "See downloads for your computer";
    $("dlPrimary").href = "#download";
    $("dlMeta").textContent = "yoinks runs on Windows, macOS and Linux desktops";
  } else if (primary) {
    $("dlLabel").textContent = names[os];
  }

  function mb(n) { return "~" + Math.round(n / 1e6) + " MB"; }
  var match = {
    setup: /Setup.*\.exe$/i,
    portable: /Portable.*\.exe$/i,
    dmg: /\.dmg$/i,
    appimage: /\.AppImage$/i,
    deb: /\.deb$/i
  };

  fetch(API + "/releases/latest").then(function (r) {
    if (!r.ok) throw new Error("release");
    return r.json();
  }).then(function (rel) {
    var ver = String(rel.tag_name || "").replace(/^v/, "");
    if (ver) $("ver").textContent = ver;
    var found = {};
    (rel.assets || []).forEach(function (a) {
      Object.keys(match).forEach(function (k) { if (!found[k] && match[k].test(a.name)) found[k] = a; });
    });
    Object.keys(found).forEach(function (k) {
      document.querySelectorAll('[data-asset="' + k + '"]').forEach(function (el) { el.href = found[k].browser_download_url; });
      document.querySelectorAll('[data-size="' + k + '"]').forEach(function (el) { el.textContent = mb(found[k].size); });
    });
    if (primary && found[primary]) {
      $("dlPrimary").href = found[primary].browser_download_url;
      var extra = os === "mac" ? " \u00b7 Apple Silicon" : "";
      $("dlMeta").textContent = "v" + ver + " \u00b7 " + mb(found[primary].size) + extra + " \u00b7 Free";
    }
  }).catch(function () {
    if (os !== "mobile") $("dlMeta").textContent = "Opens the GitHub releases page";
  });

  fetch(API).then(function (r) { return r.ok ? r.json() : null; }).then(function (repo) {
    if (repo && repo.stargazers_count >= 10) {
      var s = $("stars");
      s.textContent = " \u00b7 " + repo.stargazers_count.toLocaleString() + " stars";
      s.hidden = false;
    }
  }).catch(function () {});
})();
