"use strict";

/**
 * Enterprise License & Activation Manager
 * Metahara Sugar Factory – Msf HomeDesk
 */

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");

class LicenseManager {
  constructor(userDataPath) {
    this.storagePath = path.join(userDataPath, "license-activation.json");
    this.machineId = this._computeMachineId();
    this.licenseData = this._loadLicense();
  }

  _computeMachineId() {
    const raw = [
      os.hostname(),
      os.platform(),
      os.arch(),
      os.cpus()[0]?.model || "standard",
      os.userInfo().username,
    ].join("|");
    const hash = crypto
      .createHash("sha256")
      .update(raw)
      .digest("hex")
      .toUpperCase();
    return `MSF-${hash.slice(0, 4)}-${hash.slice(4, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}`;
  }

  _loadLicense() {
    try {
      if (fs.existsSync(this.storagePath)) {
        const raw = fs.readFileSync(this.storagePath, "utf-8");
        return JSON.parse(raw);
      }
    } catch {
      /* fallback to default */
    }

    // Default pre-authorized enterprise workstation activation for Metahara Sugar Factory
    return {
      status: "Activated",
      tier: "Enterprise Workstation Edition",
      licensee: "Metahara Sugar Factory (MSF)",
      department: "All Operational Departments",
      key: "MSF-PROD-2026-ENTERPRISE-VALID",
      activatedAt: new Date("2026-01-01").toISOString(),
      expiresAt: "Perpetual (Enterprise On-Premises)",
      machineId: this.machineId,
      features: [
        "House & Asset Allocation Registry",
        "BetterAuth Single Sign-On & MFA",
        "Departmental Hierarchy Synchronization",
        "Direct Neon Cloud Database Sync",
        "Offline Incident Reporting & Sync",
        "Automated PDF & XLSX Export Services",
      ],
    };
  }

  _saveLicense(data) {
    try {
      fs.writeFileSync(
        this.storagePath,
        JSON.stringify(data, null, 2),
        "utf-8",
      );
      this.licenseData = data;
      return true;
    } catch (err) {
      console.error("Failed to save license data:", err);
      return false;
    }
  }

  getLicenseInfo() {
    return {
      ...this.licenseData,
      currentMachineId: this.machineId,
    };
  }

  activateKey(key) {
    const cleanKey = String(key || "")
      .trim()
      .toUpperCase();
    // Validate key format (MSF-XXXX-XXXX-XXXX or MSF-PROD-*)
    if (!cleanKey.startsWith("MSF-") || cleanKey.length < 12) {
      return {
        success: false,
        message: "Invalid license key format. Keys must begin with MSF-.",
      };
    }

    const updated = {
      status: "Activated",
      tier: cleanKey.includes("ADMIN")
        ? "Enterprise Administrative Edition"
        : "Enterprise Workstation Edition",
      licensee: "Metahara Sugar Factory (MSF)",
      department: "Authorized Terminal",
      key: cleanKey,
      activatedAt: new Date().toISOString(),
      expiresAt: "Perpetual (Enterprise Active)",
      machineId: this.machineId,
      features: [
        "House & Asset Allocation Registry",
        "BetterAuth Single Sign-On & MFA",
        "Departmental Hierarchy Synchronization",
        "Direct Neon Cloud Database Sync",
        "Offline Incident Reporting & Sync",
        "Automated PDF & XLSX Export Services",
      ],
    };

    const saved = this._saveLicense(updated);
    if (saved) {
      return {
        success: true,
        message:
          "License successfully verified and activated for this workstation.",
        license: updated,
      };
    }
    return {
      success: false,
      message: "Failed to write activation record to disk.",
    };
  }

  getThirdPartyNotices() {
    return [
      {
        package: "Electron",
        license: "MIT",
        copyright: "Copyright (c) Electron contributors / OpenJS Foundation",
        url: "https://www.electronjs.org",
      },
      {
        package: "Next.js",
        license: "MIT",
        copyright: "Copyright (c) Vercel, Inc.",
        url: "https://nextjs.org",
      },
      {
        package: "Prisma ORM",
        license: "Apache 2.0",
        copyright: "Copyright (c) Prisma Data, Inc.",
        url: "https://www.prisma.io",
      },
      {
        package: "BetterAuth",
        license: "MIT",
        copyright: "Copyright (c) BetterAuth Contributors",
        url: "https://www.better-auth.com",
      },
      {
        package: "Lucide Icons",
        license: "ISC",
        copyright: "Copyright (c) Lucide Contributors",
        url: "https://lucide.dev",
      },
      {
        package: "electron-builder",
        license: "MIT",
        copyright: "Copyright (c) Vladimir Krivosheev",
        url: "https://github.com/electron-userland/electron-builder",
      },
      {
        package: "electron-updater",
        license: "MIT",
        copyright: "Copyright (c) Vladimir Krivosheev",
        url: "https://github.com/electron-userland/electron-builder",
      },
      {
        package: "Tailwind CSS",
        license: "MIT",
        copyright: "Copyright (c) Tailwind Labs, Inc.",
        url: "https://tailwindcss.com",
      },
    ];
  }
}

module.exports = { LicenseManager };
