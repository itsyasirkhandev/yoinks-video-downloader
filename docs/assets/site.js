// Point download buttons at the real files from the latest GitHub release,
// and pick the right one for the visitor's OS.
(function () {
  var REPO = "itsyasirkhandev/yoinks-video-downloader";
  var API = "https:" + "//api.github.com/repos/" + REPO;

  var ua = navigator.userAgent;
  var os = /Windows/i.test(ua) ? "win" : /Mac/i.test(ua) && !/iPhone|iPad/i.test(ua) ? "mac" : /Linux|X11/i.test(ua) && !/Android/i.test(ua) ? "linux" : null;
  var labels = { win: "Download for Windows", mac: "Download for macOS", linux: "Download for Linux" };
  var primaryKey = { win: "setup", mac: "dmg", linux: "appimage" };
  if (os) document.getElementById("dlLabel").textContent = labels[os];

  function match(name) {
    var n = name.toLowerCase();
    if (n.endsWith(".exe") && n.indexOf("setup") > -1) return "setup";
    if (n.endsWith(".exe") && n.indexOf("portable") > -1) return "portable";
    if (n.endsWith(".dmg")) return "dmg";
    if (n.endsWith(".appimage")) return "appimage";
    if (n.endsWith(".deb")) return "deb";
    return null;
  }
  function mb(b) { return Math.round(b / 1e6) + " MB"; }

  fetch(API + "/releases/latest").then(function (r) { return r.ok ? r.json() : null; }).then(function (rel) {
    if (!rel || !rel.assets) return;
    var found = {};
    rel.assets.forEach(function (a) { var k = match(a.name); if (k) found[k] = a; });
    document.querySelectorAll("[data-asset]").forEach(function (el) {
      var a = found[el.getAttribute("data-asset")];
      if (a) { el.href = a.browser_download_url; el.title = a.name + " (" + mb(a.size) + ")"; }
    });
    document.getElementById("ver").textContent = "Latest version: " + rel.tag_name;
    if (os && found[primaryKey[os]]) {
      var p = found[primaryKey[os]];
      document.getElementById("dlPrimary").href = p.browser_download_url;
      document.getElementById("dlMeta").textContent = rel.tag_name + " · " + mb(p.size) + " · also on " +
        ["Windows", "macOS", "Linux"].filter(function (x) { return x.toLowerCase().indexOf(os === "win" ? "windows" : os === "mac" ? "macos" : "linux") !== 0; }).join(" & ");
    }
  }).catch(function () {});

  fetch(API).then(function (r) { return r.ok ? r.json() : null; }).then(function (repo) {
    if (repo && repo.stargazers_count) document.getElementById("stars").textContent = "★ " + repo.stargazers_count;
  }).catch(function () {});
})();
