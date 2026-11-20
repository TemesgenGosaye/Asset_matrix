# MSF HomeDesk Android APK

The APK is a hardened Capacitor WebView shell for the hosted MSF HomeDesk portal. The portal itself remains the source of truth for house administration and asset tracking; this project owns only the Android native wrapper, branded launcher, offline recovery, and release pipeline.

## Identity

| Field                | Value                             |
| -------------------- | --------------------------------- |
| App name             | HomeDesk                          |
| Package              | `com.metahara.homedesk`           |
| Minimum Android      | 24 (Android 7.0)                  |
| Compile / target SDK | 36                                |
| Java                 | 21                                |
| Default server       | `https://msf-homedesk.vercel.app` |

## Layout

| Path                                 | Purpose                                                               |
| ------------------------------------ | --------------------------------------------------------------------- |
| `capacitor.config.ts`                | Capacitor app id, name, navigation allow-list, WebView policy         |
| `android-shell/`                     | HomeDesk launcher, connection recovery page, app icon, runtime config |
| `android/`                           | Generated native Android Studio / Gradle project                      |
| `scripts/check-mobile-target.mjs`    | Validates target, identity, and forbidden legacy hosts                |
| `scripts/build-apk.mjs`              | End-to-end release build                                              |
| `scripts/generate-android-icons.mjs` | Regenerates launcher, adaptive, and splash artwork                    |

APK artwork is generated from `android-shell/app-icon.png`, copied from `desktop/build/icon.png`, with a green gradient tile and splash treatment.

## Build locally

Prerequisites: Node 24, Java 21, Android SDK with platform 36 and build-tools, `ANDROID_HOME` configured.

```powershell
npm install
npm run apk:build
```

The build writes:

- `HomeDesk.apk` in the repository root
- `build-artifacts/HomeDesk-v<version>.apk`

## Target / staging builds

Set `CAPACITOR_SERVER_URL` to an HTTPS deployment before building. The value is written into `android-shell/config.js` and used as the Capacitor navigation allow-list at build time. The APK opens the local launcher first, then redirects to that deployment.

```powershell
$env:CAPACITOR_SERVER_URL = "https://staging.example.com"
$env:ANDROID_VERSION_NAME = "1.1.0"
$env:ANDROID_VERSION_CODE = "2"
npm run apk:build
```

`apk:check` validates the generated target without building:

```powershell
npm run apk:check
```

## Production signing

Generate an upload keystore once, then keep it outside the repository:

```powershell
keytool -genkeypair -v -storetype PKCS12 -keystore msf-homedesk.jks -alias msf-homedesk -keyalg RSA -keysize 2048 -validity 10000
```

Set these before a production build:

```powershell
$env:ANDROID_KEYSTORE_FILE = "C:\secure\msf-homedesk.jks"
$env:ANDROID_KEYSTORE_PASSWORD = "..."
$env:ANDROID_KEY_ALIAS = "msf-homedesk"
$env:ANDROID_KEY_PASSWORD = "..."
```

If `ANDROID_KEYSTORE_FILE` is unset, the build falls back to the Android debug signing config for local testing. CI uploads that artifact for testing; use the signed artifact for Play Store distribution.

## CI secrets

The `APK` workflow uses these repository secrets:

| Secret                      | Value                                |
| --------------------------- | ------------------------------------ |
| `ANDROID_KEYSTORE_BASE64`   | Base64 of the production `.jks` file |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password                    |
| `ANDROID_KEY_ALIAS`         | Key alias                            |
| `ANDROID_KEY_PASSWORD`      | Key password                         |

Without them the workflow still builds a debug-signed APK for QA.

## Native bridge

`MainActivity` injects `HomeDeskNative` into the WebView with:

- `isConnected()`, `getType()`, and `getLabel()` for connectivity state
- `setAuthenticated(true)` and `clearAuthenticated()` for session state

The launcher shows the modern HomeDesk house mark briefly, then opens the portal. If the WebView is left on the connection page, `offline.html` probes network access, `/api/mobile/health`, and `/api/health/live`, then retries automatically while showing device, internet, and portal status.
