# MSF House Administration Portal - Windows Desktop Client

A secure, single-purpose Windows desktop shell for the Metahara Sugar Factory
House Administration Portal. It permanently opens
`https://house.taild2df63.ts.net` inside a branded application window.

**Publisher:** Temesgen G. | IT Department, Metahara Sugar Factory  
**Copyright:** © 2026 Metahara Sugar Factory

## Features

- Branded splash, offline error screen, and About dialog
- Automatic and manual reconnect when the portal is unavailable
- Single-instance application: a second launch focuses the existing window
- Remembers window position, size, and maximized state
- External links open in the default browser; unknown origins are blocked
- Context isolation, sandboxed renderer, no Node.js in the renderer,
  restricted preload bridge, and strict CSP on all local UI pages
- Professional NSIS installer with per-user/all-users install modes,
  install-location selection, shortcut options, and a complete uninstaller
- Multi-size Windows icon generated from one source PNG

## Requirements

- Windows 10 or Windows 11 (x64)
- Node.js 20+ (Node.js 24 recommended)
- npm 10+

## Configure the portal URL

The portal address is defined **once** in [`app.config.js`](app.config.js):

```js
const APP_URL = "https://house.taild2df63.ts.net/";
```

Change that value and rebuild to point the client at another server. Do not
add a second URL constant elsewhere.

## Development

```powershell
cd desktop
npm install
npm run dev
```

`npm run dev` regenerates the icons and starts Electron. Use `npm start` to
launch Electron without regenerating icons.

## Build and package

```powershell
cd desktop

# Unpacked build for local testing
npm run pack

# Windows NSIS installer
npm run build
```

`npm run dist` is an alias for `npm run build`.

Build output is written to `desktop/dist/`:

```text
MSF-House-Administration-Portal-Setup-<version>.exe
```

The version comes from `desktop/package.json`.

## Icon source

All Windows icons are generated from:

```text
public/images/house_exe-admin_icon_house.png
```

`npm run icons` generates a true multi-size ICO containing 16, 24, 32, 48,
64, 128, and 256 px images, plus the PNG used by the local UI. The ICO is used
for the executable, window/taskbar, installer, uninstaller, and shortcuts.

## Installer

The NSIS installer uses an assisted wizard:

1. Welcome / publisher information
2. License
3. Install for all users or current user
4. Install location
5. Desktop and Start Menu shortcut options
6. Install
7. Finish, with a launch checkbox

The uninstaller is registered in **Apps & features** with the application icon,
publisher (`Temesgen G.`), version, and product name. Installing a newer
version over an existing installation performs a clean upgrade.

## Code signing

The build is signing-ready. Put the certificate outside the repository and set:

```powershell
$env:CSC_LINK = "C:\secure\house-admin-code-signing.pfx"
$env:CSC_KEY_PASSWORD = "your-password"
npm run build
```

See [build/signing/README.md](build/signing/README.md) for details. Never commit
certificate files or passwords.

## Security notes

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`
- Preload bridge is exposed only to trusted local `file://` UI pages
- All local UI pages use a strict Content Security Policy
- Only the configured portal origin may navigate inside the app
- Same-origin popups stay in the app; external HTTP(S) links open in the
  default browser; all other schemes are denied
- DevTools are disabled in packaged builds
- Permission requests are denied except clipboard sanitized writes
- Certificate errors are rejected
- The remote portal's own CSP remains controlled by the portal server

## Release checklist

1. Update `version` in `desktop/package.json`.
2. Update the changelog/release notes.
3. Run `npm run icons`.
4. Run `npm run pack` and smoke-test the unpacked build.
5. Test the offline error screen with the portal server stopped.
6. Run `npm run build`.
7. Install, verify **Apps & features**, launch, upgrade over the previous
   version, and uninstall.
8. Sign the installer if a certificate is available, then publish the
   installer and `latest.yml` to the configured GitHub release.

## Credits

Developed by **Temesgen G.**, IT Department, Metahara Sugar Factory.

Thank you for using the House Administration Portal. Wishing you a productive
and smooth experience.
