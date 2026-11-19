"use strict";

(function () {
  const retryBtn = document.getElementById("retry");
  const settingsBtn = document.getElementById("settingsBtn");
  const aboutBtn = document.getElementById("about");
  const targetHostEl = document.getElementById("targetHost");
  const errorDetailEl = document.getElementById("errorDetail");
  const countdownEl = document.getElementById("countdown");

  let countdownSeconds = 12;
  let countdownTimer = null;

  function updateCountdown() {
    if (countdownEl) {
      countdownEl.textContent = `Auto-retrying in ${countdownSeconds}s…`;
    }
    if (countdownSeconds <= 0) {
      clearInterval(countdownTimer);
      if (retryBtn) retryBtn.click();
    } else {
      countdownSeconds--;
    }
  }

  countdownTimer = setInterval(updateCountdown, 1000);

  retryBtn.addEventListener("click", () => {
    retryBtn.disabled = true;
    retryBtn.textContent = "Connecting…";
    if (countdownTimer) clearInterval(countdownTimer);
    if (countdownEl) countdownEl.textContent = "Attempting connection…";
    window.desktop?.retry();
  });

  settingsBtn.addEventListener("click", () => {
    window.desktop?.openSettings("general");
  });

  aboutBtn.addEventListener("click", () => {
    window.desktop?.openAbout();
  });

  if (window.desktop) {
    window.desktop
      .getAppInfo()
      .then((info) => {
        if (!info) return;
        if (targetHostEl && info.appUrl) {
          try {
            targetHostEl.textContent = new URL(info.appUrl).hostname;
          } catch {
            targetHostEl.textContent = info.appUrl;
          }
        }
        if (errorDetailEl && info.lastError) {
          errorDetailEl.textContent = info.lastError;
          errorDetailEl.hidden = false;
        }
        if (info.retryIntervalSeconds) {
          countdownSeconds = info.retryIntervalSeconds;
        }
      })
      .catch(() => {});
  }
})();
