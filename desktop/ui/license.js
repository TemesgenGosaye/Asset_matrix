"use strict";

const version = document.getElementById("version");
const appUrl = document.getElementById("appUrl");
const closeButton = document.getElementById("closeButton");

async function initialise() {
  try {
    const info = await window.desktop.getAppInfo();
    if (!info) return;

    if (info.version && version) version.textContent = info.version;
    if (info.appUrl && appUrl) appUrl.textContent = info.appUrl;
  } catch {
    /* Defaults in the markup remain usable. */
  }
}

closeButton.addEventListener("click", () => {
  window.desktop.closeLicense();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") window.desktop.closeLicense();
});

initialise();
