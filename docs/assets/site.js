(function () {
  var REPO = "itsyasirkhandev/yoinks-video-downloader";
  var API = "https:" + "//api.github.com/repos/" + REPO;
  var root = document.documentElement;
  var $ = function (id) { return document.getElementById(id); };
  var all = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };

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

  // ---------- scroll reveal ----------
  // Only blocks that start fully below the fold get hidden, so nothing on screen is ever blank.
  // A safety timer reveals everything if the observer never fires.
  var items = all(".reveal");
  if ("IntersectionObserver" in window) {
    var vh = window.innerHeight || 800;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.remove("pre"); io.unobserve(e.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0 });
    items.forEach(function (el) {
      if (el.getBoundingClientRect().top > vh) { el.classList.add("pre"); io.observe(el); }
    });
    window.addEventListener("beforeprint", function () { items.forEach(function (el) { el.classList.remove("pre"); }); });
  }

  // ---------- OS detection ----------
  var ua = navigator.userAgent || "";
  var plat = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || "";
  var mobile = /Android|iPhone|iPad|iPod/i.test(ua) || (navigator.userAgentData && navigator.userAgentData.mobile);
  var os = mobile ? "mobile" : /Win/i.test(plat + ua) ? "windows" : /Mac/i.test(plat + ua) ? "mac" : /Linux|X11/i.test(plat + ua) ? "linux" : "other";
  var primary = { windows: "setup", mac: "dmg", linux: "appimage" }[os];
  var names = { windows: "Download for Windows", mac: "Download for Mac", linux: "Download for Linux" };
  var labels = all("[data-primary-label]"), metas = all("[data-primary-meta]"), buttons = all("[data-primary]");
  function setText(list, t) { list.forEach(function (el) { el.textContent = t; }); }

  if (os === "mobile") {
    setText(labels, "See downloads for your computer");
    buttons.forEach(function (b) { b.href = "#download"; });
    setText(metas, "yoinks runs on Windows, macOS and Linux computers");
  } else if (primary) {
    setText(labels, names[os]);
    var card = document.querySelector('.platform[data-os="' + os + '"]');
    if (card) {
      card.classList.add("is-yours");
      var tag = document.createElement("span");
      tag.className = "yours";
      tag.textContent = "Your system";
      card.querySelector("h3").appendChild(tag);
    }
  }

  function mb(n) { return "~" + Math.round(n / 1e6) + " MB"; }
  var match = { setup: /Setup.*\.exe$/i, portable: /Portable.*\.exe$/i, dmg: /\.dmg$/i, appimage: /\.AppImage$/i, deb: /\.deb$/i };

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
      all('[data-asset="' + k + '"]').forEach(function (el) { el.href = found[k].browser_download_url; });
      all('[data-size="' + k + '"]').forEach(function (el) { el.textContent = mb(found[k].size); });
    });
    if (primary && found[primary]) {
      buttons.forEach(function (b) { b.href = found[primary].browser_download_url; });
      var extra = os === "mac" ? " \u00b7 Apple Silicon" : "";
      setText(metas, "v" + ver + " \u00b7 " + mb(found[primary].size) + extra + " \u00b7 Free");
    }
  }).catch(function () {
    if (os !== "mobile") setText(metas, "Opens the GitHub releases page");
  });
})();
