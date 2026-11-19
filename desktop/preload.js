"use strict";

/**
 * Restricted Preload Bridge for Msf HomeDesk
 * Only exposed to trusted local UI views (file://).
 */

const { contextBridge, ipcRenderer } = require("electron");

if (window.location.protocol === "file:") {
  contextBridge.exposeInMainWorld("desktop", {
    // App Lifecycle & Info
    getAppInfo: () => ipcRenderer.invoke("app:info"),
    retry: () => ipcRenderer.invoke("app:retry"),
    openExternal: (url) => ipcRenderer.invoke("app:open-external", url),

    // Modal Windows
    openAbout: () => ipcRenderer.invoke("app:open-about"),
    closeAbout: () => ipcRenderer.invoke("app:close-about"),
    openSettings: (tab) => ipcRenderer.invoke("app:open-settings", tab),
    closeSettings: () => ipcRenderer.invoke("app:close-settings"),
    openLicense: () => ipcRenderer.invoke("app:open-license"),
    closeLicense: () => ipcRenderer.invoke("app:close-license"),

    // Settings
    getSettings: () => ipcRenderer.invoke("settings:get"),
    setStartupLaunch: (enabled) =>
      ipcRenderer.invoke("settings:set-startup", enabled),
    clearCache: () => ipcRenderer.invoke("settings:clear-cache"),

    // Licensing & Activation
    getLicenseInfo: () => ipcRenderer.invoke("license:info"),
    activateKey: (key) => ipcRenderer.invoke("license:activate", key),
    getThirdPartyNotices: () => ipcRenderer.invoke("license:notices"),

    // Updates
    checkForUpdates: () => ipcRenderer.invoke("app:check-updates"),
  });
}

function installBrandFooter(info) {
  if (document.getElementById("msf-brand-footer")) return;

  const footer = document.createElement("div");
  footer.id = "msf-brand-footer";
  footer.setAttribute("aria-hidden", "true");
  footer.textContent = `MSF HomeDesk Workstation \u00b7 ${info.department} \u00b7 v${info.version}`;
  document.body.appendChild(footer);
}

document.addEventListener("DOMContentLoaded", () => {
  try {
    ipcRenderer
      .invoke("app:info")
      .then((info) => {
        if (!info || !info.appUrl) return;
        const origins = Array.isArray(info.portalOrigins)
          ? info.portalOrigins
          : [new URL(info.appUrl).origin];
        if (origins.includes(window.location.origin)) {
          installBrandFooter(info);
        }
      })
      .catch(() => {});
  } catch {
    /* no-op */
  }
});
