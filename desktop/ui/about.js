"use strict";

(function () {
  const versionEl = document.getElementById("version");
  const appUrlEl = document.getElementById("appUrl");
  const closeBtn = document.getElementById("close");
  const licenseBtn = document.getElementById("licenseBtn");
  const noticesBtn = document.getElementById("noticesBtn");

  closeBtn.addEventListener("click", () => {
    window.desktop?.closeAbout();
  });

  licenseBtn.addEventListener("click", () => {
    window.desktop?.openSettings("license");
  });

  noticesBtn.addEventListener("click", () => {
    window.desktop?.openSettings("notices");
  });

  if (window.desktop) {
    window.desktop
      .getAppInfo()
      .then((info) => {
        if (!info) return;
        if (versionEl && info.version) versionEl.textContent = info.version;
        if (appUrlEl && info.appUrl) appUrlEl.textContent = info.appUrl;
      })
      .catch(() => {});
  }
})();
