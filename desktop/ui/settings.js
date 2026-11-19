"use strict";

(function () {
  const tabs = document.querySelectorAll(".tab-btn");
  const panes = document.querySelectorAll(".tab-pane");
  const closeBtn = document.getElementById("closeBtn");
  const doneBtn = document.getElementById("doneBtn");
  const startupToggle = document.getElementById("startupToggle");
  const portalUrlDisplay = document.getElementById("portalUrlDisplay");
  const versionDisplay = document.getElementById("versionDisplay");
  const clearCacheBtn = document.getElementById("clearCacheBtn");
  const checkUpdateBtn = document.getElementById("checkUpdateBtn");

  // License elements
  const licenseStatusTag = document.getElementById("licenseStatusTag");
  const licenseTierDisplay = document.getElementById("licenseTierDisplay");
  const licenseeDisplay = document.getElementById("licenseeDisplay");
  const machineIdDisplay = document.getElementById("machineIdDisplay");
  const licenseKeyDisplay = document.getElementById("licenseKeyDisplay");
  const licenseExpiryDisplay = document.getElementById("licenseExpiryDisplay");
  const copyMachineIdBtn = document.getElementById("copyMachineIdBtn");
  const licenseKeyInput = document.getElementById("licenseKeyInput");
  const activateKeyBtn = document.getElementById("activateKeyBtn");
  const activationMsg = document.getElementById("activationMsg");
  const noticesTableBody = document.getElementById("noticesTableBody");

  function switchTab(targetTab) {
    tabs.forEach((btn) => {
      const active = btn.dataset.tab === targetTab;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
    });

    panes.forEach((pane) => {
      pane.classList.toggle("active", pane.id === `tab-${targetTab}`);
    });
  }

  tabs.forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  closeBtn.addEventListener("click", () => window.desktop?.closeSettings());
  doneBtn.addEventListener("click", () => window.desktop?.closeSettings());

  // Startup toggle
  startupToggle.addEventListener("change", (e) => {
    window.desktop?.setStartupLaunch(e.target.checked);
  });

  // Clear cache
  clearCacheBtn.addEventListener("click", async () => {
    clearCacheBtn.disabled = true;
    clearCacheBtn.textContent = "Clearing...";
    await window.desktop?.clearCache();
    clearCacheBtn.textContent = "Cache Cleared!";
    setTimeout(() => {
      clearCacheBtn.disabled = false;
      clearCacheBtn.textContent = "Clear Cache";
    }, 1800);
  });

  // Check updates
  checkUpdateBtn.addEventListener("click", () => {
    window.desktop?.checkForUpdates();
  });

  // Copy Machine ID
  copyMachineIdBtn.addEventListener("click", () => {
    navigator.clipboard.writeText(machineIdDisplay.textContent).then(() => {
      copyMachineIdBtn.textContent = "Copied!";
      setTimeout(() => (copyMachineIdBtn.textContent = "Copy"), 1500);
    });
  });

  // Activate license key
  activateKeyBtn.addEventListener("click", async () => {
    const key = licenseKeyInput.value.trim();
    if (!key) return;

    activateKeyBtn.disabled = true;
    activateKeyBtn.textContent = "Verifying...";
    activationMsg.textContent = "";
    activationMsg.className = "activation-msg";

    const res = await window.desktop?.activateKey(key);
    activateKeyBtn.disabled = false;
    activateKeyBtn.textContent = "Activate";

    if (res && res.success) {
      activationMsg.textContent = res.message;
      activationMsg.className = "activation-msg success";
      loadLicenseData();
    } else {
      activationMsg.textContent = (res && res.message) || "Activation failed.";
      activationMsg.className = "activation-msg error";
    }
  });

  async function loadLicenseData() {
    if (!window.desktop) return;
    const info = await window.desktop.getLicenseInfo();
    if (!info) return;

    licenseStatusTag.textContent = info.status
      ? info.status.toUpperCase()
      : "ACTIVATED";
    licenseTierDisplay.textContent =
      info.tier || "Enterprise Workstation Edition";
    licenseeDisplay.textContent = `Licensed to: ${info.licensee || "Metahara Sugar Factory"}`;
    machineIdDisplay.textContent =
      info.currentMachineId || info.machineId || "MSF-AUTO-ID";
    licenseKeyDisplay.textContent =
      info.key || "MSF-PROD-2026-ENTERPRISE-VALID";
    licenseExpiryDisplay.textContent =
      info.expiresAt || "Perpetual Enterprise Authorization";
  }

  async function loadNotices() {
    if (!window.desktop || !noticesTableBody) return;
    const notices = await window.desktop.getThirdPartyNotices();
    noticesTableBody.innerHTML = "";

    (notices || []).forEach((item) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td style="font-weight: 600;">${item.package}</td>
        <td><span class="status-tag" style="background: #f1f5f9; color: #475569;">${item.license}</span></td>
        <td style="color: #64748b; font-size: 11px;">${item.copyright}</td>
      `;
      noticesTableBody.appendChild(tr);
    });
  }

  // Initial load
  async function init() {
    if (!window.desktop) return;

    const settings = await window.desktop.getSettings();
    if (settings) {
      startupToggle.checked = Boolean(settings.launchAtStartup);
      portalUrlDisplay.textContent =
        settings.appUrl || "https://msf-homedesk.vercel.app";
      versionDisplay.textContent = `Version ${settings.version || "1.0.0"} (Production 64-bit)`;
    }

    await loadLicenseData();
    await loadNotices();
  }

  // Handle IPC switch tab message
  window.addEventListener("message", (e) => {
    if (e.data && e.data.tab) {
      switchTab(e.data.tab);
    }
  });

  init();
})();
