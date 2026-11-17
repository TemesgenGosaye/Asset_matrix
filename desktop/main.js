"use strict";

/**
 * Msf HomeDesk – Windows desktop client.
 *
 * A thin, hardened Electron shell for the Msf HomeDesk portal.
 * Developed by Temesgen G. | IT Department, Metahara Sugar Factory
 */

const {
  app,
  BrowserWindow,
  Menu,
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

const APP_ID = "com.metahara.msfhomedesk.desktop";
const UI_DIR = path.join(__dirname, "ui");
const ICON_ICO = path.join(__dirname, "build", "icon.ico");
const ICON_PNG = path.join(UI_DIR, "icon.png");
/** Ordered connection candidates: the friendly host name first, then fallbacks. */
const PORTAL_URLS = CONFIG.APP_URLS;
/** Every candidate origin counts as "the app", so guards work on either one. */
const APP_ORIGINS = new Set(PORTAL_URLS.map((value) => new URL(value).origin));
const AUTO_RETRY_MS = CONFIG.AUTO_RETRY_SECONDS * 1000;

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
    padding: 0 11px;
    border-top: 1px solid rgba(148, 163, 184, 0.16);
    color: #94a3b8;
    background: rgba(6, 13, 27, 0.9);
    font-family: "Segoe UI", Roboto, Arial, sans-serif;
    font-size: 10.5px;
    letter-spacing: 0.01em;
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
let stateStore = null;
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
/** Index into PORTAL_URLS of the address currently being attempted. */
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
      logStream = fs.createWriteStream(
        path.join(dir, "house-admin-desktop.log"),
        {
          flags: "a",
        },
      );
    }
    logStream.write(`${new Date().toISOString()} ${line}\n`);
  } catch {
    /* Logging must never break the app. */
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
    return APP_ORIGINS.has(new URL(value).origin);
  } catch {
    return false;
  }
}

/** The portal address to open in a plain browser: the live one if possible. */
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
    .catch((error) => log("Could not open external URL:", error));
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
    retryIntervalSeconds: CONFIG.AUTO_RETRY_SECONDS,
    lastError: lastErrorDescription,
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
      log("Automatic reconnect attempt");
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
  const delay = Math.max(0, 900 - elapsed);

  setTimeout(() => {
    try {
      if (!splash.isDestroyed()) splash.destroy();
    } catch {
      /* The splash window may already be gone. */
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
    width: 420,
    height: 320,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
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
  splashWindow.loadFile(path.join(UI_DIR, "splash.html")).catch((error) => {
    // The splash is frequently closed before load completes when the portal
    // is cached and responds immediately. That is not a real failure.
    if (splashWindow && !splashWindow.isDestroyed()) {
      log("Could not load splash screen:", error);
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

  mainWindow.webContents.insertCSS(FOOTER_CSS).catch((error) => {
    log("Could not inject footer styling:", error);
  });
}

function showError(description) {
  if (!mainWindow || isQuitting) return;

  loadingApp = false;
  showingError = true;
  lastErrorDescription = String(
    description || "The portal server did not respond.",
  );
  log("Showing connection error:", lastErrorDescription);
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
    .catch((error) => {
      errorPageLoading = false;
      log("Could not load error screen:", error);
      revealMainWindow();
    });
}

/**
 * Loads the portal candidate at `portalAttemptIndex`. A rejection here is
 * logged only: the authoritative failure signal is `did-fail-load`, which
 * drives `advancePortalAttempt` so a candidate is never skipped twice.
 */
function beginPortalAttempt() {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const target = PORTAL_URLS[portalAttemptIndex] || CONFIG.APP_URL;
  loadingApp = true;
  lastErrorDescription = "";
  log("Connecting to", target);

  mainWindow.loadURL(target).catch((error) => {
    log(
      "Load rejected:",
      target,
      error && error.message ? error.message : error,
    );
  });
}

/**
 * Moves to the next fallback address, or reports the error once every
 * candidate has been exhausted. The friendly host name is always tried first.
 */
function advancePortalAttempt(reason) {
  if (portalAttemptIndex < PORTAL_URLS.length - 1) {
    portalAttemptIndex += 1;
    log(
      "Address unavailable, falling back to",
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

function attachNavigationGuards(window) {
  const contents = window.webContents;

  contents.setWindowOpenHandler(({ url }) => {
    if (isAppUrl(url)) {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow
          .loadURL(url)
          .catch((error) => log("Could not open internal URL:", error));
      }
    } else if (isHttpUrl(url)) {
      openExternalUrl(url);
    }
    return { action: "deny" };
  });

  const guardNavigation = (event, url) => {
    if (window === mainWindow && isAppUrl(url)) return;
    if (window === aboutWindow && url.startsWith("file://")) return;
    if (window === licenseWindow && url.startsWith("file://")) return;
    if (window === splashWindow && url.startsWith("file://")) return;

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
    backgroundColor: "#0b1120",
    title: CONFIG.APP_NAME,
    autoHideMenuBar: true,
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

  mainWindow.setMenuBarVisibility(false);
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

    if (input.key === "F5" || (ctrlOrCmd && key === "r" && !input.shift)) {
      event.preventDefault();
      if (showingError) retryNow();
      else loadPortal();
      return;
    }

    if (
      !app.isPackaged &&
      ((ctrlOrCmd && input.shift && key === "i") || input.key === "F12")
    ) {
      return;
    }

    if ((ctrlOrCmd && input.shift && key === "i") || input.key === "F12") {
      event.preventDefault();
    }
  });

  mainWindow.webContents.session.on("will-download", (_event, item) => {
    log("Download started:", item.getFilename());
    item.once("done", (_doneEvent, state) => {
      log("Download finished:", item.getFilename(), state);
      if (state === "completed" && mainWindow) {
        dialog.showMessageBox(mainWindow, {
          type: "info",
          title: "Download complete",
          message: `File downloaded successfully:\n${item.getFilename()}`,
          detail: "The file was saved to your Downloads folder.",
          buttons: ["OK"],
        });
      }
    });
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
    if (aboutWindow) aboutWindow.close();
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
    width: 466,
    height: 650,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    parent: mainWindow || undefined,
    modal: Boolean(mainWindow),
    show: false,
    useContentSize: true,
    backgroundColor: "#0b1120",
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

  aboutWindow.loadFile(path.join(UI_DIR, "about.html")).catch((error) => {
    log("Could not load About window:", error);
  });

  aboutWindow.once("ready-to-show", () => {
    if (!aboutWindow) return;
    aboutWindow.show();
    aboutWindow.focus();
  });

  aboutWindow.on("closed", () => {
    aboutWindow = null;
    if (licenseWindow && !licenseWindow.isDestroyed()) licenseWindow.close();
  });
}

function showLicenseWindow() {
  if (licenseWindow && !licenseWindow.isDestroyed()) {
    if (licenseWindow.isMinimized()) licenseWindow.restore();
    licenseWindow.show();
    licenseWindow.focus();
    return;
  }

  licenseWindow = new BrowserWindow({
    width: 780,
    height: 720,
    minWidth: 560,
    minHeight: 480,
    resizable: true,
    minimizable: true,
    maximizable: true,
    fullscreenable: false,
    parent: aboutWindow || mainWindow || undefined,
    modal: false,
    show: false,
    backgroundColor: "#050b18",
    title: `End User License Agreement - ${CONFIG.APP_NAME}`,
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

  licenseWindow.setMenuBarVisibility(false);
  attachNavigationGuards(licenseWindow);

  licenseWindow.loadFile(path.join(UI_DIR, "license.html")).catch((error) => {
    log("Could not load License window:", error);
  });

  licenseWindow.once("ready-to-show", () => {
    if (!licenseWindow) return;
    licenseWindow.show();
    licenseWindow.focus();
  });

  licenseWindow.on("closed", () => {
    licenseWindow = null;
  });
}

function configureSessionSecurity() {
  const defaultSession = session.defaultSession;

  const isAllowedPermission = (permission) =>
    permission === "clipboard-sanitized-write";

  defaultSession.setPermissionRequestHandler(
    (_webContents, permission, callback) =>
      callback(isAllowedPermission(permission)),
  );

  defaultSession.setPermissionCheckHandler((_webContents, permission) =>
    isAllowedPermission(permission),
  );
}

function buildMenu() {
  const isDev = !app.isPackaged;

  const template = [
    {
      label: "&File",
      submenu: [
        {
          label: "Refresh",
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
        { label: `About ${CONFIG.APP_NAME}`, click: showAboutWindow },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function configureUpdater() {
  if (updaterConfigured) return;
  updaterConfigured = true;

  autoUpdater.logger = {
    info: (message) => log("updater:", message),
    warn: (message) => log("updater:", message),
    error: (message) => log("updater:", message),
    debug: () => {},
  };
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-available", (info) => {
    log("Update available:", info && info.version);
    if (manualUpdateCheck && mainWindow) {
      dialog.showMessageBox(mainWindow, {
        type: "info",
        title: "Update available",
        message: `Version ${info.version} is available.`,
        detail:
          "The update will be downloaded and installed the next time you close the app.",
        buttons: ["OK"],
      });
    }
  });

  autoUpdater.on("update-not-available", () => {
    if (manualUpdateCheck && mainWindow) {
      dialog.showMessageBox(mainWindow, {
        type: "info",
        title: "No updates",
        message: "You are running the latest version.",
        buttons: ["OK"],
      });
    }
  });

  autoUpdater.on("error", (error) => {
    log("Update error:", error && error.message ? error.message : error);
    if (manualUpdateCheck && mainWindow) {
      dialog.showMessageBox(mainWindow, {
        type: "warning",
        title: "Update check failed",
        message: "Could not check for updates.",
        detail: String((error && error.message) || error),
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
        title: "Updates",
        message: "Updates are only checked in installed builds.",
        buttons: ["OK"],
      });
    }
    return;
  }

  configureUpdater();
  manualUpdateCheck = Boolean(manual);

  autoUpdater
    .checkForUpdates()
    .catch((error) => log("Update check failed:", error))
    .finally(() => {
      manualUpdateCheck = false;
    });
}

ipcMain.handle("app:info", () => appInfo());

ipcMain.handle("app:retry", (event) => {
  if (!isTrustedLocalFrame(event)) return false;
  if (!showingError) return false;
  retryNow();
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

ipcMain.handle("app:open-license", (event) => {
  if (!isTrustedLocalFrame(event)) return false;
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
    log("MSF House Administration Portal starting, version", app.getVersion());

    stateStore = new WindowStateStore(
      path.join(app.getPath("userData"), "window-state.json"),
      {
        width: CONFIG.DEFAULT_WINDOW_WIDTH,
        height: CONFIG.DEFAULT_WINDOW_HEIGHT,
      },
    );

    configureSessionSecurity();
    buildMenu();
    createSplashWindow();
    createMainWindow();

    setTimeout(() => checkForUpdates(false), 20000);

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
    if (logStream) {
      try {
        logStream.end();
      } catch {
        /* no-op */
      }
    }
  });
}
