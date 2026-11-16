"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { screen } = require("electron");

class WindowStateStore {
  constructor(filePath, defaults) {
    this.filePath = filePath;
    this.defaults = defaults;
    this.state = this.read();
    this.saveTimer = null;
    this.window = null;
  }

  read() {
    const fallback = {
      width: this.defaults.width,
      height: this.defaults.height,
      isMaximized: false,
    };

    try {
      if (!fs.existsSync(this.filePath)) return fallback;
      const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      return {
        x: Number.isFinite(parsed.x) ? parsed.x : undefined,
        y: Number.isFinite(parsed.y) ? parsed.y : undefined,
        width: Number.isFinite(parsed.width) && parsed.width >= 640
          ? parsed.width
          : fallback.width,
        height: Number.isFinite(parsed.height) && parsed.height >= 480
          ? parsed.height
          : fallback.height,
        isMaximized: parsed.isMaximized === true,
      };
    } catch {
      return fallback;
    }
  }

  isVisibleOnScreen(bounds) {
    return screen.getAllDisplays().some((display) => {
      const area = display.workArea;
      const visibleWidth =
        Math.min(bounds.x + bounds.width, area.x + area.width) -
        Math.max(bounds.x, area.x);
      const visibleHeight =
        Math.min(bounds.y + bounds.height, area.y + area.height) -
        Math.max(bounds.y, area.y);
      return visibleWidth >= 160 && visibleHeight >= 120;
    });
  }

  getBounds() {
    const { x, y, width, height } = this.state;
    if (
      Number.isFinite(x) &&
      Number.isFinite(y) &&
      this.isVisibleOnScreen({ x, y, width, height })
    ) {
      return { x, y, width, height };
    }
    return { width, height };
  }

  get isMaximized() {
    return this.state.isMaximized === true;
  }

  capture() {
    if (!this.window || this.window.isDestroyed()) return;

    if (this.window.isMaximized()) {
      const normal = this.window.getNormalBounds();
      this.state = {
        ...this.state,
        x: normal.x,
        y: normal.y,
        width: normal.width,
        height: normal.height,
        isMaximized: true,
      };
      return;
    }

    if (!this.window.isMinimized() && !this.window.isFullScreen()) {
      const bounds = this.window.getBounds();
      this.state = {
        ...this.state,
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        isMaximized: false,
      };
    }
  }

  scheduleSave() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flush(), 400);
  }

  flush() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    this.capture();

    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2));
    } catch {
      /* Window state persistence must never break the app. */
    }
  }

  track(window) {
    this.window = window;
    const save = () => {
      this.capture();
      this.scheduleSave();
    };

    window.on("resize", save);
    window.on("move", save);
    window.on("maximize", save);
    window.on("unmaximize", save);
    window.on("close", () => this.flush());
    window.on("closed", () => {
      this.window = null;
    });
  }
}

module.exports = { WindowStateStore };
