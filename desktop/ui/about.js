"use strict";

const version = document.getElementById("version");
const appUrl = document.getElementById("appUrl");
const electronVersion = document.getElementById("electronVersion");
const copyright = document.getElementById("copyright");
const closeButton = document.getElementById("closeButton");
const licenseButton = document.getElementById("licenseButton");

async function initialise() {
  try {
    const info = await window.desktop.getAppInfo();
    if (!info) return;

    if (info.version) version.textContent = info.version;
    if (info.appUrl) appUrl.textContent = info.appUrl;
    if (info.electron) electronVersion.textContent = info.electron;
    if (info.copyright) copyright.textContent = info.copyright;
  } catch {
    /* Defaults in the markup remain usable. */
  }
}

closeButton.addEventListener("click", () => {
  window.desktop.closeAbout();
});

licenseButton.addEventListener("click", () => {
  window.desktop.openLicense();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") window.desktop.closeAbout();
});

initialise();
