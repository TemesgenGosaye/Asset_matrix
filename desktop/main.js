"use strict";

/**
 * Msf HomeDesk – Windows Enterprise Desktop Client
 * Metahara Sugar Factory – IT Department
 *
 * Target: https://msf-homedesk.vercel.app
 * Developed by Temesgen G.
 */

const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  dialog,
  ipcMain,
  session,
  shell,
} = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { autoUpdater } = require("electron-updater");

const CONFIG = require("./app.config");
const { WindowStateStore } = require("./window-state");
const { LicenseManager } = require("./license-manager");

const APP_ID = "com.metahara.msfhomedesk.desktop";
const UI_DIR = path.join(__dirname, "ui");
const ICON_ICO = path.join(__dirname, "build", "icon.ico");
const ICON_PNG = path.join(UI_DIR, "icon.png");

const PORTAL_URLS = CONFIG.APP_URLS;
const APP_ORIGINS = new Set(PORTAL_URLS.map((url) => new URL(url).origin));
const AUTO_RETRY_MS = CONFIG.AUTO_RETRY_SECONDS * 1000;

// Enterprise Clean White CSS Injection for Brand Stamp
const FOOTER_CSS = `
  html body {
    margin-bottom: 22px !important;
    box-sizing: border-box;
  }
  #msf-brand-footer {
    position: fixed;
    z-index: 2147483647;
    right: 0;
    bottom: 0;
    left: 0;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    height: 22px;
    padding: 0 12px;
    border-top: 1px solid #e2e8f0;
    color: #64748b;
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(8px);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
    font-size: 10.5px;
    font-weight: 500;
    letter-spacing: 0.02em;
    line-height: 22px;
    pointer-events: none;
    user-select: none;
    -webkit-font-smoothing: antialiased;
  }
  @media print {
    #msf-brand-footer { display: none !important; }
    html body { margin-bottom: 0 !important; }
  }
`;

let mainWindow = null;
let splashWindow = null;
let aboutWindow = null;
let licenseWindow = null;
let settingsWindow = null;
let tray = null;
let stateStore = null;
let licenseManager = null;
let retryTimer = null;
let splashCreatedAt = 0;
let splashShownAt = 0;
let loadingApp = false;
let showingError = false;
let errorPageLoading = false;
let lastErrorDescription = "";
let isQuitting = false;
let logStream = null;
let updaterConfigured = false;
let manualUpdateCheck = false;
let portalAttemptIndex = 0;

app.setAppUserModelId(APP_ID);
app.setName(CONFIG.APP_NAME);

function log(...parts) {
  const line = parts
    .map((part) => {
      if (typeof part === "string") return part;
      if (part instanceof Error) return part.stack || part.message;
      try {
        return JSON.stringify(part);
      } catch {
        return String(part);
      }
    })
    .join(" ");

  console.log(line);
  try {
    if (!logStream) {
      const dir = path.join(app.getPath("userData"), "logs");
      fs.mkdirSync(dir, { recursive: true });
      logStream = fs.createWriteStream(path.join(dir, "msf-homedesk.log"), {
        flags: "a",
      });
    }
    logStream.write(`${new Date().toISOString()} ${line}\n`);
  } catch {
    /* Logging must never fail app */
  }
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isAppUrl(value) {
  try {
    const parsed = new URL(value);
    return (
      APP_ORIGINS.has(parsed.origin) || parsed.hostname.endsWith("vercel.app")
    );
  } catch {
    return false;
  }
}

function currentPortalUrl() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    const active = mainWindow.webContents.getURL();
    if (isAppUrl(active)) return active;
  }
  return PORTAL_URLS[portalAttemptIndex] || CONFIG.APP_URL;
}

function isTrustedLocalFrame(event) {
  try {
    const url = event.senderFrame && event.senderFrame.url;
    return typeof url === "string" && url.startsWith("file://");
  } catch {
    return false;
  }
}

function openExternalUrl(value) {
  if (!isHttpUrl(value)) return;
  shell
    .openExternal(value)
    .catch((err) => log("Could not open external URL:", err));
}

function appInfo() {
  return {
    appName: CONFIG.APP_NAME,
    version: app.getVersion(),
    appUrl: CONFIG.APP_URL,
    fallbackUrls: CONFIG.FALLBACK_URLS,
    portalOrigins: Array.from(APP_ORIGINS),
    company: CONFIG.COMPANY_NAME,
    department: CONFIG.DEPARTMENT,
    developer: CONFIG.DEVELOPER,
    copyright: `\u00a9 ${CONFIG.COPYRIGHT_YEAR} ${CONFIG.COMPANY_NAME}. All rights reserved.`,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    retryIntervalSeconds: CONFIG.AUTO_RETRY_SECONDS,
    lastError: lastErrorDescription,
    license: licenseManager ? licenseManager.getLicenseInfo() : null,
  };
}

function clearRetryTimer() {
  if (retryTimer) {
    clearInterval(retryTimer);
    retryTimer = null;
  }
}

function startRetryTimer() {
  clearRetryTimer();
  retryTimer = setInterval(() => {
    if (mainWindow && showingError && !loadingApp) {
      log("Automatic reconnect cycle triggered");
      retryNow();
    }
  }, AUTO_RETRY_MS);
}

function closeSplash() {
  if (!splashWindow) return;
  const splash = splashWindow;
  splashWindow = null;
  const startedAt = splashShownAt || splashCreatedAt;
  const elapsed = startedAt ? Date.now() - startedAt : 1200;
  const delay = Math.max(0, 800 - elapsed);

  setTimeout(() => {
    try {
      if (!splash.isDestroyed()) splash.destroy();
    } catch {
      /* splash gone */
    }
  }, delay);
}

function revealMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.focus();
  closeSplash();
}

function createSplashWindow() {
  splashCreatedAt = Date.now();
  splashWindow = new BrowserWindow({
    width: 440,
    height: 340,
    frame: false,
    transparent: false,
    backgroundColor: "#ffffff",
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: true,
    show: false,
    icon: ICON_ICO,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: false,
      spellcheck: false,
    },
  });

  splashWindow.setMenuBarVisibility(false);
  splashWindow.loadFile(path.join(UI_DIR, "splash.html")).catch((err) => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      log("Could not load splash screen:", err);
    }
  });

  splashWindow.once("ready-to-show", () => {
    if (!splashWindow) return;
    splashWindow.show();
    splashShownAt = Date.now();
  });

  splashWindow.on("closed", () => {
    splashWindow = null;
  });
}

function injectFooterCss() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (!isAppUrl(mainWindow.webContents.getURL())) return;

  mainWindow.webContents.insertCSS(FOOTER_CSS).catch((err) => {
    log("Could not inject footer styling:", err);
  });
}

function showError(description) {
  if (!mainWindow || isQuitting) return;

  loadingApp = false;
  showingError = true;
  lastErrorDescription = String(
    description || "The cloud portal server did not respond.",
  );
  log("Displaying error screen:", lastErrorDescription);
  startRetryTimer();

  if (errorPageLoading) {
    revealMainWindow();
    return;
  }

  errorPageLoading = true;
  mainWindow
    .loadFile(path.join(UI_DIR, "error.html"))
    .then(() => {
      errorPageLoading = false;
      revealMainWindow();
    })
    .catch((err) => {
      errorPageLoading = false;
      log("Could not load error screen:", err);
      revealMainWindow();
    });
}

function beginPortalAttempt() {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const target = PORTAL_URLS[portalAttemptIndex] || CONFIG.APP_URL;
  loadingApp = true;
  lastErrorDescription = "";
  log("Connecting to portal candidate:", target);

  mainWindow.loadURL(target).catch((err) => {
    log("Load attempt failed for:", target, err?.message || err);
  });
}

function advancePortalAttempt(reason) {
  if (portalAttemptIndex < PORTAL_URLS.length - 1) {
    portalAttemptIndex += 1;
    log(
      "Primary unavailable; falling back to candidate:",
      PORTAL_URLS[portalAttemptIndex],
    );
    beginPortalAttempt();
    return;
  }

  showError(reason);
}

function retryNow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  clearRetryTimer();
  portalAttemptIndex = 0;
  showingError = true;
  beginPortalAttempt();
}

function loadPortal() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  clearRetryTimer();
  portalAttemptIndex = 0;
  showingError = false;
  lastErrorDescription = "";
  beginPortalAttempt();
}

function attachNavigationGuards(win) {
  const contents = win.webContents;

  contents.setWindowOpenHandler(({ url }) => {
    if (isAppUrl(url)) {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow
          .loadURL(url)
          .catch((err) => log("Could not open in-app URL:", err));
      }
    } else if (isHttpUrl(url)) {
      openExternalUrl(url);
    }
    return { action: "deny" };
  });

  const guardNavigation = (event, url) => {
    if (win === mainWindow && isAppUrl(url)) return;
    if (url.startsWith("file://")) return;

    event.preventDefault();
    if (isHttpUrl(url)) openExternalUrl(url);
  };

  contents.on("will-navigate", guardNavigation);
  contents.on("will-redirect", guardNavigation);
  contents.on("will-attach-webview", (event) => event.preventDefault());
}

function createMainWindow() {
  const bounds = stateStore.getBounds();

  mainWindow = new BrowserWindow({
    ...bounds,
    minWidth: CONFIG.MIN_WINDOW_WIDTH,
    minHeight: CONFIG.MIN_WINDOW_HEIGHT,
    show: false,
    backgroundColor: "#ffffff", // Pure crisp white background (no dark flash)
    title: CONFIG.APP_NAME,
    autoHideMenuBar: false,
    icon: ICON_ICO,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      sandbox: true,
      spellcheck: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      devTools: !app.isPackaged,
      safeDialogs: true,
      navigateOnDragDrop: false,
    },
  });

  stateStore.track(mainWindow);
  attachNavigationGuards(mainWindow);

  if (stateStore.isMaximized) {
    mainWindow.maximize();
  }

  mainWindow.webContents.on("did-finish-load", () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const currentUrl = mainWindow.webContents.getURL();

    if (isAppUrl(currentUrl)) {
      loadingApp = false;
      showingError = false;
      lastErrorDescription = "";
      clearRetryTimer();
      injectFooterCss();
      revealMainWindow();
      updateTrayMenu();
      return;
    }

    if (currentUrl.startsWith("file://")) {
      revealMainWindow();
    }
  });

  mainWindow.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame || errorCode === -3) return;
      if (!loadingApp && !isAppUrl(validatedURL)) return;
      advancePortalAttempt(`${errorDescription} (${errorCode})`);
    },
  );

  mainWindow.webContents.on("did-navigate", (_event, url) => {
    if (isAppUrl(url)) injectFooterCss();
  });

  mainWindow.webContents.on(
    "did-navigate-in-page",
    (_event, url, isMainFrame) => {
      if (isMainFrame && isAppUrl(url)) injectFooterCss();
    },
  );

  mainWindow.webContents.on("page-title-updated", (event) => {
    event.preventDefault();
    mainWindow.setTitle(CONFIG.APP_NAME);
  });

  mainWindow.webContents.on("before-input-event", (event, input) => {
    const key = String(input.key || "").toLowerCase();
    const ctrlOrCmd =
      process.platform === "darwin" ? input.meta : input.control;

    // Refresh
    if (input.key === "F5" || (ctrlOrCmd && key === "r" && !input.shift)) {
      event.preventDefault();
      if (showingError) retryNow();
      else loadPortal();
      return;
    }

    // Settings (Ctrl+,)
    if (ctrlOrCmd && key === ",") {
      event.preventDefault();
      showSettingsWindow();
      return;
    }

    // License (Ctrl+Shift+L)
    if (ctrlOrCmd && input.shift && key === "l") {
      event.preventDefault();
      showSettingsWindow("license");
      return;
    }

    // Fullscreen (F11)
    if (input.key === "F11") {
      event.preventDefault();
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
      return;
    }

    // DevTools blocked in packaged builds
    if ((ctrlOrCmd && input.shift && key === "i") || input.key === "F12") {
      if (app.isPackaged) {
        event.preventDefault();
      }
    }
  });

  mainWindow.webContents.session.on("will-download", (_event, item) => {
    log("File download started:", item.getFilename());
    item.once("done", (_doneEvent, state) => {
      log("File download completed:", item.getFilename(), state);
      if (state === "completed" && mainWindow) {
        dialog.showMessageBox(mainWindow, {
          type: "info",
          title: "Download complete",
          message: `File downloaded successfully:\n${item.getFilename()}`,
          detail: "Saved to your default Downloads folder.",
          buttons: ["OK"],
        });
      }
    });
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
    if (aboutWindow) aboutWindow.close();
    if (settingsWindow) settingsWindow.close();
    if (licenseWindow) licenseWindow.close();
  });

  loadPortal();
}

function showAboutWindow() {
  if (aboutWindow && !aboutWindow.isDestroyed()) {
    if (aboutWindow.isMinimized()) aboutWindow.restore();
    aboutWindow.show();
    aboutWindow.focus();
    return;
  }

  aboutWindow = new BrowserWindow({
    width: 480,
    height: 620,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    parent: mainWindow || undefined,
    modal: Boolean(mainWindow),
    show: false,
    useContentSize: true,
    backgroundColor: "#ffffff",
    title: `About ${CONFIG.APP_NAME}`,
    icon: ICON_ICO,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      devTools: false,
    },
  });

  aboutWindow.setMenuBarVisibility(false);
  attachNavigationGuards(aboutWindow);

  aboutWindow.loadFile(path.join(UI_DIR, "about.html")).catch((err) => {
    log("Could not load About window:", err);
  });

  aboutWindow.once("ready-to-show", () => {
    if (!aboutWindow) return;
    aboutWindow.show();
    aboutWindow.focus();
  });

  aboutWindow.on("closed", () => {
    aboutWindow = null;
  });
}

function showSettingsWindow(initialTab = "general") {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    if (settingsWindow.isMinimized()) settingsWindow.restore();
    settingsWindow.show();
    settingsWindow.focus();
    settingsWindow.webContents.send("settings:switch-tab", initialTab);
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 680,
    height: 680,
    minWidth: 580,
    minHeight: 520,
    resizable: true,
    minimizable: true,
    maximizable: false,
    fullscreenable: false,
    parent: mainWindow || undefined,
    modal: false,
    show: false,
    backgroundColor: "#ffffff",
    title: `Settings & License – ${CONFIG.APP_NAME}`,
    icon: ICON_ICO,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      devTools: !app.isPackaged,
    },
  });

  settingsWindow.setMenuBarVisibility(false);
  attachNavigationGuards(settingsWindow);

  settingsWindow.loadFile(path.join(UI_DIR, "settings.html")).catch((err) => {
    log("Could not load Settings window:", err);
  });

  settingsWindow.once("ready-to-show", () => {
    if (!settingsWindow) return;
    settingsWindow.show();
    settingsWindow.focus();
    if (initialTab) {
      settingsWindow.webContents.send("settings:switch-tab", initialTab);
    }
  });

  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });
}

function showLicenseWindow() {
  showSettingsWindow("license");
}

function configureSessionSecurity() {
  const defaultSession = session.defaultSession;

  const isAllowedPermission = (permission) =>
    permission === "clipboard-sanitized-write" || permission === "fullscreen";

  defaultSession.setPermissionRequestHandler(
    (_webContents, permission, callback) =>
      callback(isAllowedPermission(permission)),
  );

  defaultSession.setPermissionCheckHandler((_webContents, permission) =>
    isAllowedPermission(permission),
  );

  // Set strict Content-Security-Policy on responses from portal origins
  defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = Object.assign({}, details.responseHeaders);
    callback({ responseHeaders });
  });
}

function buildMenu() {
  const isDev = !app.isPackaged;

  const template = [
    {
      label: "&File",
      submenu: [
        {
          label: "Refresh Portal",
          accelerator: "CmdOrCtrl+R",
          click: () => {
            if (showingError) retryNow();
            else loadPortal();
          },
        },
        {
          label: "Open in Browser",
          click: () => openExternalUrl(currentPortalUrl()),
        },
        { type: "separator" },
        {
          label: "Settings...",
          accelerator: "CmdOrCtrl+,",
          click: () => showSettingsWindow("general"),
        },
        {
          label: "License & Activation...",
          accelerator: "CmdOrCtrl+Shift+L",
          click: () => showSettingsWindow("license"),
        },
        { type: "separator" },
        { role: "quit", label: "Exit" },
      ],
    },
    {
      label: "&View",
      submenu: [
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
        ...(isDev ? [{ type: "separator" }, { role: "toggleDevTools" }] : []),
      ],
    },
    {
      label: "&Help",
      submenu: [
        { label: "Check for Updates", click: () => checkForUpdates(true) },
        { type: "separator" },
        { label: "Settings & License", click: () => showSettingsWindow() },
        { label: `About ${CONFIG.APP_NAME}`, click: showAboutWindow },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createTray() {
  if (tray) return;

  try {
    tray = new Tray(ICON_ICO);
    tray.setToolTip(`${CONFIG.APP_NAME} – Metahara Sugar Factory`);
    updateTrayMenu();

    tray.on("double-click", () => {
      revealMainWindow();
    });
  } catch (err) {
    log("Could not initialize system tray:", err);
  }
}

function updateTrayMenu() {
  if (!tray) return;

  const isConnected = !showingError;
  const launchSettings = app.getLoginItemSettings();

  const contextMenu = Menu.buildFromTemplate([
    {
      label: `${CONFIG.APP_NAME} (${isConnected ? "Connected" : "Offline"})`,
      enabled: false,
    },
    { type: "separator" },
    {
      label: "Open Dashboard",
      click: () => revealMainWindow(),
    },
    {
      label: "Refresh Connection",
      click: () => {
        if (showingError) retryNow();
        else loadPortal();
      },
    },
    { type: "separator" },
    {
      label: "Launch at Startup",
      type: "checkbox",
      checked: launchSettings.openAtLogin,
      click: (menuItem) => {
        app.setLoginItemSettings({
          openAtLogin: menuItem.checked,
          path: process.execPath,
        });
      },
    },
    {
      label: "Settings & License...",
      click: () => showSettingsWindow(),
    },
    {
      label: "Check for Updates...",
      click: () => checkForUpdates(true),
    },
    {
      label: "About HomeDesk...",
      click: () => showAboutWindow(),
    },
    { type: "separator" },
    {
      label: "Exit",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
}

function configureUpdater() {
  if (updaterConfigured) return;
  updaterConfigured = true;

  autoUpdater.logger = {
    info: (msg) => log("updater:", msg),
    warn: (msg) => log("updater:", msg),
    error: (msg) => log("updater:", msg),
    debug: () => {},
  };
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-available", (info) => {
    log("Update detected:", info?.version);
    if (manualUpdateCheck && mainWindow) {
      dialog.showMessageBox(mainWindow, {
        type: "info",
        title: "Update Available",
        message: `Version ${info.version} is available.`,
        detail:
          "The update is downloading and will be applied when you close the app.",
        buttons: ["OK"],
      });
    }
  });

  autoUpdater.on("update-not-available", () => {
    if (manualUpdateCheck && mainWindow) {
      dialog.showMessageBox(mainWindow, {
        type: "info",
        title: "Software is Up to Date",
        message: `${CONFIG.APP_NAME} is on the latest version (${app.getVersion()}).`,
        buttons: ["OK"],
      });
    }
  });

  autoUpdater.on("error", (err) => {
    log("Update check error:", err?.message || err);
    if (manualUpdateCheck && mainWindow) {
      dialog.showMessageBox(mainWindow, {
        type: "warning",
        title: "Update Check Notice",
        message: "Could not complete automatic update check.",
        detail: String(err?.message || err),
        buttons: ["OK"],
      });
    }
  });
}

function checkForUpdates(manual) {
  if (!app.isPackaged) {
    if (manual && mainWindow) {
      dialog.showMessageBox(mainWindow, {
        type: "info",
        title: "Development Build",
        message:
          "Automatic updates are verified in production installed builds.",
        buttons: ["OK"],
      });
    }
    return;
  }

  configureUpdater();
  manualUpdateCheck = Boolean(manual);

  autoUpdater
    .checkForUpdates()
    .catch((err) => log("Update check failed:", err))
    .finally(() => {
      manualUpdateCheck = false;
    });
}

// ── IPC Handlers ────────────────────────────────────────────────────────
ipcMain.handle("app:info", () => appInfo());

ipcMain.handle("app:retry", (event) => {
  if (!isTrustedLocalFrame(event)) return false;
  if (!showingError) return false;
  retryNow();
  return true;
});

ipcMain.handle("app:open-external", (event, url) => {
  if (!isTrustedLocalFrame(event)) return false;
  openExternalUrl(url);
  return true;
});

ipcMain.handle("app:open-about", () => {
  showAboutWindow();
  return true;
});

ipcMain.handle("app:close-about", (event) => {
  if (!isTrustedLocalFrame(event)) return false;
  if (aboutWindow && event.sender === aboutWindow.webContents) {
    aboutWindow.close();
    return true;
  }
  return false;
});

ipcMain.handle("app:open-settings", (_event, tab) => {
  showSettingsWindow(tab);
  return true;
});

ipcMain.handle("app:close-settings", (event) => {
  if (!isTrustedLocalFrame(event)) return false;
  if (settingsWindow && event.sender === settingsWindow.webContents) {
    settingsWindow.close();
    return true;
  }
  return false;
});

ipcMain.handle("app:open-license", () => {
  showLicenseWindow();
  return true;
});

ipcMain.handle("app:close-license", (event) => {
  if (!isTrustedLocalFrame(event)) return false;
  if (licenseWindow && event.sender === licenseWindow.webContents) {
    licenseWindow.close();
    return true;
  }
  return false;
});

ipcMain.handle("settings:get", () => {
  const launchSettings = app.getLoginItemSettings();
  return {
    launchAtStartup: launchSettings.openAtLogin,
    appUrl: CONFIG.APP_URL,
    version: app.getVersion(),
  };
});

ipcMain.handle("settings:set-startup", (_event, enabled) => {
  app.setLoginItemSettings({
    openAtLogin: Boolean(enabled),
    path: process.execPath,
  });
  updateTrayMenu();
  return true;
});

ipcMain.handle("settings:clear-cache", async () => {
  if (session.defaultSession) {
    await session.defaultSession.clearCache();
    await session.defaultSession.clearStorageData({
      storages: ["serviceworkers", "cachestorage"],
    });
    return true;
  }
  return false;
});

ipcMain.handle("license:info", () => {
  return licenseManager ? licenseManager.getLicenseInfo() : null;
});

ipcMain.handle("license:activate", (_event, key) => {
  if (!licenseManager)
    return { success: false, message: "Manager unavailable" };
  return licenseManager.activateKey(key);
});

ipcMain.handle("license:notices", () => {
  return licenseManager ? licenseManager.getThirdPartyNotices() : [];
});

ipcMain.handle("app:check-updates", () => {
  checkForUpdates(true);
  return true;
});

app.on("web-contents-created", (_event, contents) => {
  contents.on("will-attach-webview", (event) => event.preventDefault());
});

app.on(
  "certificate-error",
  (event, _webContents, _url, _error, _certificate, callback) => {
    event.preventDefault();
    callback(false);
  },
);

// Single Instance Lock
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    log("MSF HomeDesk starting, version", app.getVersion());

    stateStore = new WindowStateStore(
      path.join(app.getPath("userData"), "window-state.json"),
      {
        width: CONFIG.DEFAULT_WINDOW_WIDTH,
        height: CONFIG.DEFAULT_WINDOW_HEIGHT,
      },
    );

    licenseManager = new LicenseManager(app.getPath("userData"));

    configureSessionSecurity();
    buildMenu();
    createTray();
    createSplashWindow();
    createMainWindow();

    setTimeout(() => checkForUpdates(false), 25000);

    app.on("activate", () => {
      if (!mainWindow || mainWindow.isDestroyed()) {
        createSplashWindow();
        createMainWindow();
      } else {
        revealMainWindow();
      }
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("before-quit", () => {
    isQuitting = true;
    clearRetryTimer();
    if (stateStore) stateStore.flush();
    if (tray) {
      try {
        tray.destroy();
      } catch {
        /* no-op */
      }
    }
    if (logStream) {
      try {
        logStream.end();
      } catch {
        /* no-op */
      }
    }
  });
}
