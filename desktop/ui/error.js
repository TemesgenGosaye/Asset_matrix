"use strict";

const retryButton = document.getElementById("retryButton");
const retryNote = document.getElementById("retryNote");
const countdown = document.getElementById("countdown");
const targetHost = document.getElementById("targetHost");
const errorDetail = document.getElementById("errorDetail");
const version = document.getElementById("version");

let secondsRemaining = 15;
let countdownTimer = null;

function startCountdown(seconds) {
  secondsRemaining = Number.isFinite(seconds) && seconds > 0 ? seconds : 15;
  if (countdown) countdown.textContent = String(secondsRemaining);

  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = setInterval(() => {
    secondsRemaining -= 1;
    if (secondsRemaining <= 0) {
      clearInterval(countdownTimer);
      countdownTimer = null;
      if (countdown) countdown.textContent = "0";
      if (retryNote) retryNote.textContent = "Retrying now\u2026";
      return;
    }
    if (countdown) countdown.textContent = String(secondsRemaining);
  }, 1000);
}

async function initialise() {
  try {
    const info = await window.desktop.getAppInfo();

    const targets = [info && info.appUrl, ...((info && info.fallbackUrls) || [])].filter(
      Boolean,
    );

    if (targets.length) {
      targetHost.textContent = targets
        .map((value) => {
          try {
            return new URL(value).host;
          } catch {
            return value;
          }
        })
        .join(" or ");
    }

    if (info && info.lastError) {
      errorDetail.textContent = info.lastError;
      errorDetail.hidden = false;
    }

    if (info && info.version && version) {
      version.textContent = `Version ${info.version}`;
    }

    startCountdown(info && info.retryIntervalSeconds);
  } catch {
    startCountdown(15);
  }
}

retryButton.addEventListener("click", () => {
  retryButton.disabled = true;
  retryButton.textContent = "Retrying\u2026";
  if (retryNote) retryNote.textContent = "Attempting to reconnect to the portal\u2026";
  if (countdownTimer) clearInterval(countdownTimer);

  Promise.resolve(window.desktop.retry()).catch(() => {
    retryButton.disabled = false;
    retryButton.textContent = "Retry Connection";
    if (retryNote) retryNote.textContent = "Could not start a retry. Please try again.";
  });
});

initialise();
