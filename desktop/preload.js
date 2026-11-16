"use strict";

/**
 * Restricted preload bridge.
 *
 * The bridge is only exposed to the trusted local UI pages (splash, error,
 * About). The remote portal never receives Node.js or Electron APIs.
 */

const { contextBridge, ipcRenderer } = require("electron");

if (window.location.protocol === "file:") {
  contextBridge.exposeInMainWorld("desktop", {
    getAppInfo: () => ipcRenderer.invoke("app:info"),
    retry: () => ipcRenderer.invoke("app:retry"),
    closeAbout: () => ipcRenderer.invoke("app:close-about"),
  });
}

function installBrandFooter(info) {
  if (document.getElementById("msf-brand-footer")) return;

  const footer = document.createElement("div");
  footer.id = "msf-brand-footer";
  footer.setAttribute("aria-hidden", "true");
  footer.textContent = `Powered by ${info.developer} \u00b7 ${info.department} \u00b7 v${info.version}`;
  document.body.appendChild(footer);
}

document.addEventListener("DOMContentLoaded", () => {
  try {
    ipcRenderer
      .invoke("app:info")
      .then((info) => {
        if (!info || !info.appUrl || !info.developer) return;
        // The portal may be served from the friendly host name or from a
        // fallback address, so every configured origin counts as the app.
        const origins = Array.isArray(info.portalOrigins)
          ? info.portalOrigins
          : [new URL(info.appUrl).origin];
        if (origins.includes(window.location.origin)) {
          installBrandFooter(info);
        }
      })
      .catch(() => {
        /* Footer is cosmetic; never disturb the portal if IPC is unavailable. */
      });
  } catch {
    /* no-op */
  }
});
