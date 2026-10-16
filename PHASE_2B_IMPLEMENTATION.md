# Phase 2B: Connection Settings UI - Implementation Guide

**Status:** Not Yet Implemented  
**Priority:** High  
**Estimated Effort:** 4-6 hours

---

## Overview

Phase 2B implements the dynamic connection settings UI that allows users to configure and switch between different server profiles without rebuilding or reinstalling the application. This is critical for handling dynamic IP addresses in the factory network.

---

## Requirements Recap

From the original specification, Phase 2B must provide:

### 1. Settings Screen

- Professional **Settings → Connection** page
- Accessible from application menu and login page
- Fields:
  - Server address (IP address OR hostname)
  - Port
  - Protocol (HTTP / HTTPS)
  - Optional base path
  - Connection timeout
  - Database credentials (if direct connection used)

### 2. Behavior

- **Test Connection** button with detailed results
- Input validation (IPv4, IPv6, hostname, port range)
- **Save and apply** without restart
- **Reset to defaults** button
- Live connection status indicator
- Automatic retry with exponential backoff
- Friendly offline screen (✅ already implemented)
- Multiple server profiles support

### 3. Storage and Security

- Store in `%APPDATA%\MSFAsset\config.json` (✅ already configured)
- Encrypt credentials with Windows DPAPI
- Allow IT to preconfigure via silent install
- First-run setup wizard

### 4. Compatibility

- No hardcoded URLs in Next.js
- BetterAuth, cookies, CORS work with dynamic addresses
- Log connection changes

---

## Current State

### ✅ Already Implemented (Backend)

The Electron main process already has:

- Configuration management (`electron/main.js`)
- Config file storage (`%APPDATA%\MSFAsset\config.json`)
- Server profiles structure
- IPC handlers for getting/saving config
- `test-connection` IPC handler
- Connection monitoring and offline detection

### ❌ Not Yet Implemented (Frontend)

Need to create:

- React/Next.js Settings page UI
- Connection settings form
- Profile management UI
- First-run wizard
- Windows DPAPI integration for credential encryption

---

## Implementation Plan

### Step 1: Create Settings Route

Create `src/app/settings/connection/page.tsx`:

```tsx
"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function ConnectionSettings() {
  // Component implementation here
}
```

### Step 2: Create Connection Form Component

`src/components/settings/ConnectionForm.tsx`:

```tsx
interface ConnectionFormProps {
  profile: ServerProfile;
  onSave: (profile: ServerProfile) => Promise<void>;
  onTest: (profile: ServerProfile) => Promise<TestResult>;
}

export function ConnectionForm({
  profile,
  onSave,
  onTest,
}: ConnectionFormProps) {
  // Form fields for:
  // - Protocol (HTTP/HTTPS)
  // - Host (IP or hostname)
  // - Port
  // - Base path (optional)
  // - Timeout
  // - Test button
  // - Save button
  // - Reset button
}
```

### Step 3: Profile Management

`src/components/settings/ProfileManager.tsx`:

```tsx
export function ProfileManager() {
  // List of profiles
  // Active profile indicator
  // Add profile button
  // Edit profile button
  // Delete profile button
  // Switch profile button
}
```

### Step 4: First-Run Wizard

`src/components/onboarding/FirstRunWizard.tsx`:

```tsx
export function FirstRunWizard() {
  // Multi-step wizard:
  // 1. Welcome screen
  // 2. Server configuration
  // 3. Test connection
  // 4. Complete
}
```

### Step 5: Electron IPC Integration

Add to `electron/preload.js` (if not already present):

```javascript
contextBridge.exposeInMainWorld("electronAPI", {
  // ... existing ...

  // Connection management (already added)
  getConfig: () => ipcRenderer.invoke("get-config"),
  saveConfig: (config) => ipcRenderer.invoke("save-config", config),
  testConnection: (connectionData) =>
    ipcRenderer.invoke("test-connection", connectionData),

  // Credential encryption (NEW)
  encryptCredential: (credential) =>
    ipcRenderer.invoke("encrypt-credential", credential),
  decryptCredential: (encrypted) =>
    ipcRenderer.invoke("decrypt-credential", encrypted),
});
```

### Step 6: Windows DPAPI Integration

Add to `electron/credential-manager.js` (NEW FILE):

```javascript
const crypto = require("crypto");
const { safeStorage } = require("electron");

/**
 * Encrypt credentials using Windows DPAPI
 * Only works on Windows
 */
function encryptCredential(plaintext) {
  if (process.platform === "win32" && safeStorage.isEncryptionAvailable()) {
    const buffer = safeStorage.encryptString(plaintext);
    return buffer.toString("base64");
  } else {
    // Fallback for development/other platforms
    return Buffer.from(plaintext).toString("base64");
  }
}

/**
 * Decrypt credentials using Windows DPAPI
 */
function decryptCredential(encrypted) {
  if (process.platform === "win32" && safeStorage.isEncryptionAvailable()) {
    const buffer = Buffer.from(encrypted, "base64");
    return safeStorage.decryptString(buffer);
  } else {
    // Fallback
    return Buffer.from(encrypted, "base64").toString("utf8");
  }
}

module.exports = {
  encryptCredential,
  decryptCredential,
};
```

Then add IPC handlers in `electron/main.js`:

```javascript
const {
  encryptCredential,
  decryptCredential,
} = require("./credential-manager");

ipcMain.handle("encrypt-credential", (event, credential) => {
  return encryptCredential(credential);
});

ipcMain.handle("decrypt-credential", (event, encrypted) => {
  return decryptCredential(encrypted);
});
```

### Step 7: Input Validation

Create `src/lib/validation.ts`:

```typescript
export function validateIPv4(ip: string): boolean {
  const ipv4Regex =
    /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  return ipv4Regex.test(ip);
}

export function validateIPv6(ip: string): boolean {
  const ipv6Regex = /^(?:[A-F0-9]{1,4}:){7}[A-F0-9]{1,4}$/i;
  return ipv6Regex.test(ip);
}

export function validateHostname(hostname: string): boolean {
  const hostnameRegex =
    /^(?=.{1,253}$)(?:(?!-)[A-Za-z0-9-]{1,63}(?<!-)\.)*(?!-)[A-Za-z0-9-]{1,63}(?<!-)$/;
  return hostnameRegex.test(hostname);
}

export function validatePort(port: number): boolean {
  return port >= 1 && port <= 65535;
}

export function validateConnection(data: ConnectionData): ValidationResult {
  const errors: string[] = [];

  // Validate host
  const isIPv4 = validateIPv4(data.host);
  const isIPv6 = validateIPv6(data.host);
  const isHostname = validateHostname(data.host);

  if (!isIPv4 && !isIPv6 && !isHostname) {
    errors.push("Invalid server address. Must be IPv4, IPv6, or hostname.");
  }

  // Validate port
  if (!validatePort(data.port)) {
    errors.push("Port must be between 1 and 65535.");
  }

  // Validate protocol
  if (!["http", "https"].includes(data.protocol)) {
    errors.push("Protocol must be http or https.");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
```

### Step 8: Connection Status Indicator

Add to navigation (`src/components/Navigation.tsx`):

```tsx
function ConnectionStatusIndicator() {
  const [status, setStatus] = useState<"connected" | "connecting" | "offline">(
    "connecting",
  );

  useEffect(() => {
    if (window.electronAPI?.getConnectionStatus) {
      const checkStatus = async () => {
        const currentStatus = await window.electronAPI.getConnectionStatus();
        setStatus(currentStatus);
      };

      checkStatus();
      const interval = setInterval(checkStatus, 5000);

      return () => clearInterval(interval);
    }
  }, []);

  return (
    <div className="flex items-center gap-2">
      <div
        className={cn(
          "h-2 w-2 rounded-full",
          status === "connected" && "bg-green-500",
          status === "connecting" && "animate-pulse bg-yellow-500",
          status === "offline" && "bg-red-500",
        )}
      />
      <span className="text-muted-foreground text-xs">
        {status === "connected" && "Connected"}
        {status === "connecting" && "Connecting..."}
        {status === "offline" && "Offline"}
      </span>
    </div>
  );
}
```

---

## File Structure

After Phase 2B implementation:

```
src/
├── app/
│   ├── settings/
│   │   └── connection/
│   │       └── page.tsx           # Main settings page
│   └── onboarding/
│       └── page.tsx                # First-run wizard
├── components/
│   ├── settings/
│   │   ├── ConnectionForm.tsx      # Connection form
│   │   ├── ProfileManager.tsx      # Profile management
│   │   └── ConnectionTest.tsx      # Test connection component
│   └── onboarding/
│       └── FirstRunWizard.tsx      # Setup wizard
└── lib/
    ├── validation.ts               # Input validation
    └── connection-utils.ts         # Connection helpers

electron/
├── credential-manager.js           # DPAPI credential encryption
└── main.js                         # (add new IPC handlers)
```

---

## Testing Checklist

After implementing Phase 2B:

### Connection Settings UI

- [ ] Settings page accessible from menu
- [ ] Settings page accessible from login page
- [ ] All input fields present and functional
- [ ] IPv4 validation works
- [ ] IPv6 validation works
- [ ] Hostname validation works
- [ ] Port validation works
- [ ] Test connection button works
- [ ] Shows success message on successful connection
- [ ] Shows error message on failed connection
- [ ] Reports server version on success
- [ ] Save button persists settings
- [ ] Reset button restores defaults
- [ ] Settings apply without restart

### Profile Management

- [ ] Can create new profile
- [ ] Can edit existing profile
- [ ] Can delete profile
- [ ] Can switch between profiles
- [ ] Active profile highlighted
- [ ] Profile names unique
- [ ] At least one profile always exists

### First-Run Wizard

- [ ] Wizard appears on first launch
- [ ] Can navigate through steps
- [ ] Cannot skip server configuration
- [ ] Test connection required before completing
- [ ] Wizard doesn't appear on subsequent launches

### Credential Storage

- [ ] Database credentials encrypted with DPAPI
- [ ] Encrypted credentials stored in config
- [ ] Decryption works correctly
- [ ] Plain text never written to disk

### Connection Status

- [ ] Status indicator visible in UI
- [ ] Status updates in real-time
- [ ] Offline detection works
- [ ] Reconnection detection works

---

## Known Challenges

### 1. Desktop vs Web Mode Detection

The connection settings should only be available in desktop mode. Add to `src/lib/utils.ts`:

```typescript
export function isDesktopMode(): boolean {
  return (
    typeof window !== "undefined" &&
    window.electronAPI !== undefined &&
    window.electronAPI.isDesktop === true
  );
}
```

### 2. BetterAuth with Dynamic URLs

BetterAuth needs to know the current origin. Ensure `BETTER_AUTH_URL` is set correctly at runtime:

```javascript
// In electron/main.js, set environment variable before starting Next.js
env.BETTER_AUTH_URL = `http://localhost:3000`;
env.NEXT_PUBLIC_APP_URL = `http://localhost:3000`;
```

### 3. CORS and Trusted Origins

Update `.env` to support dynamic origins:

```env
BETTER_AUTH_TRUSTED_ORIGINS=http://localhost:3000
```

For database connections, the connection string comes from the server configuration, not from local environment variables.

---

## Integration Points

### With Existing Code

1. **Offline Screen** (`electron/offline.html`)
   - Already has "Open Settings" button
   - Needs to trigger IPC call to open settings

2. **License Validation** (`electron/license-validator.js`)
   - Should run before first-run wizard
   - Wizard should not proceed without valid license

3. **Error Handler** (`electron/error-handler.js`)
   - Database connection errors should suggest opening settings
   - Network errors should offer settings link

### New IPC Channels Needed

```javascript
// electron/main.js

// Open settings window
ipcMain.handle("open-settings-window", () => {
  mainWindow.webContents.send("navigate-to-settings");
});

// Get machine ID for display
ipcMain.handle("get-machine-id", () => {
  const { getCurrentMachineId } = require("./license-validator");
  return getCurrentMachineId();
});
```

---

## Silent Install Pre-configuration

Allow IT to pass server config during silent install:

```powershell
MSFAsset-Setup-0.7.0.exe /S /SERVER=192.168.1.10 /PORT=5432 /PROTOCOL=http
```

Add to `electron/installer.nsh`:

```nsis
; Parse command line arguments
Function .onInit
  ${GetParameters} $R0
  ${GetOptions} $R0 "/SERVER=" $1
  ${GetOptions} $R0 "/PORT=" $2
  ${GetOptions} $R0 "/PROTOCOL=" $3

  ; Write to default config if provided
  ${If} $1 != ""
    FileOpen $0 "$APPDATA\MSFAsset\config.default.json" w
    FileWrite $0 '{"server":{"host":"$1","port":$2,"protocol":"$3"}}'
    FileClose $0
  ${EndIf}
FunctionEnd
```

Then in `electron/main.js`, check for default config on first run:

```javascript
const defaultConfigPath = path.join(USER_DATA_PATH, "config.default.json");
if (config.app.firstRun && fs.existsSync(defaultConfigPath)) {
  const defaultConfig = JSON.parse(fs.readFileSync(defaultConfigPath, "utf8"));
  config = { ...config, ...defaultConfig };
  config.app.firstRun = false;
  saveConfig(config);
  fs.unlinkSync(defaultConfigPath); // Remove after applying
}
```

---

## User Experience Flow

### First Launch (With License)

1. User installs application
2. Application starts, shows splash screen
3. License validation runs
4. ✅ License valid → First-run wizard appears
5. Wizard prompts for server configuration
6. User enters server details
7. Test connection runs
8. ✅ Connection successful → Configuration saved
9. Application proceeds to login screen

### First Launch (Without License)

1. Same as above through step 3
2. ❌ License invalid → License entry dialog appears
3. User enters license key
4. License validated
5. Continue with first-run wizard (steps 5-9 above)

### Changing Server Later

1. User clicks Settings → Connection
2. Either:
   - Edit existing profile
   - Create new profile and switch to it
3. Test connection (optional but recommended)
4. Save
5. Application applies new settings immediately

### Server Down

1. Application detects connection loss
2. Offline screen appears
3. User clicks "Open Settings"
4. Settings page opens
5. User updates server address
6. Saves and tests
7. Application reconnects

---

## Recommended Libraries

### For Form Validation

- `zod` (already in package.json)
- `react-hook-form` (optional, for complex forms)

### For Network Testing

- Built-in `fetch` API (already available)
- `node:dns` for hostname resolution

### For UI Components

- Already have Radix UI components
- Use existing `<Button>`, `<Input>`, `<Select>`, `<Card>` components

---

## Estimated Time Breakdown

| Task                           | Estimated Time |
| ------------------------------ | -------------- |
| Create Settings page route     | 30 minutes     |
| Build ConnectionForm component | 1 hour         |
| Implement validation           | 30 minutes     |
| Profile management UI          | 1 hour         |
| DPAPI credential encryption    | 45 minutes     |
| First-run wizard               | 1.5 hours      |
| Connection status indicator    | 30 minutes     |
| Testing and debugging          | 2 hours        |
| **TOTAL**                      | **6-7 hours**  |

---

## Success Criteria

Phase 2B is complete when:

- ✅ User can configure server settings from UI
- ✅ Settings persist across application restarts
- ✅ Multiple server profiles can be created and switched
- ✅ Connection can be tested before saving
- ✅ Invalid inputs are rejected with clear error messages
- ✅ Database credentials are encrypted with DPAPI
- ✅ First-run wizard guides new users through setup
- ✅ Settings apply without requiring application restart
- ✅ IT can pre-configure settings via silent install
- ✅ Connection status is visible in the UI
- ✅ All tests in TESTING.md pass

---

## Next Steps

1. **Create the Settings UI** following the plan above
2. **Implement DPAPI encryption** for credential security
3. **Build the first-run wizard** for smooth onboarding
4. **Test thoroughly** with various network scenarios
5. **Update TESTING.md** with Phase 2B test results
6. **Document any issues** encountered during implementation

---

**Note:** This is a detailed implementation guide. The actual development should follow your existing code style and project conventions. Adjust as needed based on your specific requirements.

**Maintained By:** TemesgenG  
**Last Updated:** December 2024
