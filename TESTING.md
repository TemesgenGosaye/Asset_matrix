# MSF Asset Desktop - Testing Documentation

**Version:** 0.7.0  
**Last Updated:** December 2024

---

## Testing Status

This document tracks testing progress for the MSF Asset desktop application.

### Legend

- ✅ **VERIFIED** - Tested and working
- ⚠️ **PARTIAL** - Partially tested, needs full validation
- ❌ **UNTESTED** - Not yet tested
- 🔄 **REQUIRES BUILD** - Needs actual installer to test

---

## 1. Build Process Testing

### Icon Generation

- ✅ **Icon generation script runs successfully**
  - Generated PNG icons at all required sizes (16-512px)
  - Created installer header and sidebar graphics
  - MSF logo properly centered and scaled
  - Verified: `npm run generate:icons` completes without errors

### License Key System

- ✅ **RSA key pair generation**
  - 2048-bit keys generated successfully
  - Private key stored in `desktop-keys/`
  - Public key embedded in `electron/license-validator.js`
  - Verified: `npm run generate:keys` works

- ✅ **License creation**
  - Interactive mode functional
  - Command-line mode functional
  - License keys saved to files
  - Verified: Created test license for "Metahara Sugar Factory"

- ✅ **License validation**
  - Signature verification working
  - Valid licenses accepted
  - Payload correctly parsed
  - Verified: `npm run verify:license` confirms valid license

- ❌ **Machine ID binding** (requires desktop build)
  - Need to test on actual Windows machine
  - Need to verify machine ID generation
  - Need to test rejection of mismatched machine IDs

- ❌ **License expiration** (requires desktop build)
  - Need to test expired license rejection
  - Need to verify expiration date checking
  - Need to test expiration warnings

### Desktop Build

- 🔄 **Full desktop build** (requires `npm run build:desktop`)
  - Next.js standalone build
  - Electron packaging
  - NSIS installer creation
  - File size and integrity check

---

## 2. Installation Testing

### Fresh Installation (Clean System)

🔄 **Test on Windows 10**

- [ ] Download and run `MSFAsset-Setup-0.7.0.exe`
- [ ] Verify welcome screen shows MSF branding
- [ ] EULA displayed and must be accepted
- [ ] Custom installation directory option works
- [ ] Desktop shortcut created (if selected)
- [ ] Start Menu shortcuts created
- [ ] Application launches after install
- [ ] Registry keys created correctly
- [ ] Application data folder created in `%APPDATA%\MSFAsset`

🔄 **Test on Windows 11**

- [ ] Same checklist as Windows 10
- [ ] Verify Windows 11 UI compatibility
- [ ] Test with both light and dark Windows themes

### Silent Installation

🔄 **Basic silent install**

```powershell
MSFAsset-Setup-0.7.0.exe /S
```

- [ ] Installs without user interaction
- [ ] Creates shortcuts
- [ ] Creates registry keys
- [ ] Application launches successfully

🔄 **Silent install with custom path**

```powershell
MSFAsset-Setup-0.7.0.exe /S /D=C:\CustomPath\MSFAsset
```

- [ ] Installs to specified directory
- [ ] All features work from custom location

### Upgrade Installation

🔄 **Upgrade from 0.6.0 to 0.7.0**

- [ ] Installer detects previous version
- [ ] Prompts user about upgrade
- [ ] User data preserved (`%APPDATA%\MSFAsset\`)
- [ ] License key preserved
- [ ] Configuration preserved
- [ ] New version number shown in About
- [ ] Old version uninstalled automatically

### Uninstallation

🔄 **Interactive uninstall**

- [ ] Run uninstaller from Start Menu
- [ ] Prompted to keep or remove user data
- [ ] Desktop shortcut removed
- [ ] Start Menu entries removed
- [ ] Registry keys cleaned up
- [ ] Application directory removed
- [ ] User data preserved if requested

🔄 **Silent uninstall**

```powershell
"C:\Program Files\MSF Asset\Uninstall MSF Asset.exe" /S
```

- [ ] Uninstalls without prompts
- [ ] User data preserved by default
- [ ] Clean uninstall (no leftover files in Program Files)

---

## 3. License Validation Testing

### Valid License - Wildcard

❌ **Test perpetual wildcard license**

- [ ] Launch app without license
- [ ] Prompted for license key
- [ ] Enter valid wildcard license
- [ ] License accepted
- [ ] Application continues to login screen
- [ ] License persisted to `%APPDATA%\MSFAsset\license.key`
- [ ] Subsequent launches don't prompt for license

### Valid License - Machine Bound

❌ **Test machine-bound license**

- [ ] Get machine ID from app (Help → About)
- [ ] Generate license for that machine ID
- [ ] Enter license
- [ ] License accepted on correct machine
- [ ] Copy license to different machine
- [ ] License rejected on different machine

### Invalid Licenses

❌ **Test invalid licenses**

- [ ] **Corrupted signature**: License rejected with clear error
- [ ] **Wrong format**: License rejected with format error
- [ ] **Expired license**: License rejected with expiration message
- [ ] **Wrong machine ID**: License rejected with machine mismatch error
- [ ] **Empty/malformed**: Appropriate error message shown

---

## 4. Startup and Error Handling

### Normal Startup

⚠️ **Verified in development**

- ✅ Splash screen displays with MSF logo
- ✅ "Powered by TemesgenG" branding visible
- ❌ Next.js server starts successfully (needs build test)
- ❌ Main window opens after server ready (needs build test)
- ❌ No console errors in production mode

### Single Instance Lock

❌ **Test multiple launches**

- [ ] Launch application
- [ ] Try launching second instance
- [ ] Second instance brings first window to front
- [ ] Only one instance running in Task Manager

### Port Conflicts

❌ **Test port 3000 conflict**

- [ ] Start another app on port 3000
- [ ] Launch MSF Asset
- [ ] Clear error dialog displayed
- [ ] Option to retry or exit
- [ ] Retry after killing conflicting app works

### Error Recovery

❌ **Test various error scenarios**

- [ ] **Next.js crash**: App shows offline screen
- [ ] **Corrupted config**: Config reset dialog shown
- [ ] **Missing config**: Default config created
- [ ] **Startup timeout**: Graceful timeout handling
- [ ] **Database unreachable**: Clear error message

---

## 5. Connection Management

### Configuration

❌ **Test connection settings** (requires Phase 2B)

- [ ] Open Settings → Connection
- [ ] Enter server IP/hostname
- [ ] Enter port
- [ ] Test connection button works
- [ ] Shows clear success/failure message
- [ ] Save settings
- [ ] Settings persisted to config file

### Server Profiles

❌ **Test multiple profiles** (requires Phase 2B)

- [ ] Create "Office LAN" profile
- [ ] Create "Remote VPN" profile
- [ ] Switch between profiles
- [ ] Active profile persisted
- [ ] Each profile has correct server settings

### Connection Monitoring

❌ **Test connection loss**

- [ ] App running and connected
- [ ] Disconnect network or stop PostgreSQL server
- [ ] Offline screen appears after ~30 seconds
- [ ] Countdown timer shows
- [ ] "Retry Connection" button works
- [ ] "Open Settings" button works
- [ ] Auto-reconnect when server available

### Offline Mode

❌ **Test extended offline operation**

- [ ] Start app offline (no server connection)
- [ ] Offline screen displays immediately
- [ ] Troubleshooting tips visible
- [ ] Settings accessible from offline screen
- [ ] Connect network
- [ ] App automatically reconnects
- [ ] Returns to normal operation

---

## 6. Logging and Diagnostics

### Log Files

❌ **Test logging system**

- [ ] Logs created in `%APPDATA%\MSFAsset\logs\main.log`
- [ ] Timestamp format correct
- [ ] Log levels (INFO, WARN, ERROR) working
- [ ] Sensitive data redacted (passwords, tokens)
- [ ] Log rotation at 5MB
- [ ] Old logs preserved with timestamp

### Error Logging

❌ **Test error capture**

- [ ] Uncaught exceptions logged
- [ ] Unhandled promise rejections logged
- [ ] Stack traces included
- [ ] User actions logged (sanitized)
- [ ] "View Logs" menu option opens folder

---

## 7. Security Testing

### Production Security

❌ **Verify security features**

- [ ] **Dev tools disabled**: Cannot open DevTools (F12 blocked)
- [ ] **Context isolation**: Renderer cannot access Node APIs
- [ ] **Sandbox**: Renderer process sandboxed
- [ ] **Navigation restriction**: Cannot navigate to external sites
- [ ] **External links**: Open in system browser, not in app
- [ ] **Node integration**: Disabled in renderer

### License Security

✅ **Cryptographic validation**

- ✅ RSA-2048 signature verification working
- ✅ Tampered payload rejected
- ✅ Wrong public key rejected
- ❌ Key rotation procedure (needs test with rebuilt app)

### Data Security

❌ **Test credential handling**

- [ ] Passwords never logged in plaintext
- [ ] Config file readable only by user
- [ ] License key file protected
- [ ] No credentials in error messages
- [ ] Database connection strings sanitized in logs

---

## 8. Performance Testing

### Startup Performance

❌ **Measure startup times**

- [ ] Time from launch to splash screen: ____ seconds
- [ ] Time from splash to main window: ____ seconds
- [ ] Total cold start time: ____ seconds
- [ ] Warm start time (already running server): ____ seconds

### Resource Usage

❌ **Monitor resource consumption**

- [ ] Memory usage at idle: ____ MB
- [ ] Memory usage with 100 assets: ____ MB
- [ ] CPU usage at idle: ____ %
- [ ] CPU usage during search: ____ %
- [ ] Disk usage (installation): ____ MB

### Network Performance

❌ **Test with various network conditions**

- [ ] Fast LAN (1 Gbps): Response time ____ ms
- [ ] Typical LAN (100 Mbps): Response time ____ ms
- [ ] Slow connection (10 Mbps): Response time ____ ms
- [ ] High latency (100ms): Usability rating ____

---

## 9. Compatibility Testing

### Windows Versions

🔄 **Operating Systems**

- [ ] Windows 10 Home (20H2 or later)
- [ ] Windows 10 Pro (20H2 or later)
- [ ] Windows 10 Enterprise
- [ ] Windows 11 Home
- [ ] Windows 11 Pro
- [ ] Windows 11 Enterprise

### Hardware

🔄 **Minimum Specifications**

- [ ] Intel Core i3 / AMD equivalent
- [ ] 4GB RAM
- [ ] 500MB free disk space
- [ ] 1366x768 display resolution

🔄 **Recommended Specifications**

- [ ] Intel Core i5 / AMD equivalent or better
- [ ] 8GB RAM
- [ ] 1GB free disk space
- [ ] 1920x1080 display resolution

### Network

❌ **Network Configurations**

- [ ] Direct LAN connection
- [ ] WiFi connection
- [ ] VPN connection
- [ ] Proxy configuration
- [ ] Firewall with PostgreSQL port allowed
- [ ] Firewall with PostgreSQL port blocked (error handling)

---

## 10. User Interface Testing

### Branding

⚠️ **Visual identity**

- ✅ Splash screen shows MSF logo
- ✅ "Powered by TemesgenG" displayed
- ❌ Application icon in taskbar
- ❌ Application icon in window title bar
- ❌ About dialog shows correct branding
- ❌ Installer graphics (header and sidebar)

### Accessibility

❌ **Test accessibility features**

- [ ] Keyboard navigation works throughout
- [ ] Tab order logical
- [ ] Focus visible
- [ ] High contrast mode supported
- [ ] Screen reader compatibility (basic)
- [ ] Font scaling respected

### Themes

❌ **Test theme support**

- [ ] Light mode works correctly
- [ ] Dark mode works correctly
- [ ] Respects Windows theme preference
- [ ] Theme toggle works (if implemented)

---

## 11. Integration Testing

### Database Integration

❌ **PostgreSQL Connection**

- [ ] Connect to PostgreSQL server
- [ ] Execute queries successfully
- [ ] Handle connection loss gracefully
- [ ] Reconnect automatically
- [ ] Connection pooling working
- [ ] Transaction handling correct

### Authentication

❌ **BetterAuth Integration**

- [ ] Login with username/password
- [ ] Session persistence
- [ ] Logout functionality
- [ ] Session timeout
- [ ] Remember me functionality
- [ ] 2FA (if enabled)
- [ ] LDAP/SAML (if configured)

### API Endpoints

❌ **Backend Communication**

- [ ] All API routes accessible
- [ ] GET requests working
- [ ] POST requests working
- [ ] PUT/PATCH requests working
- [ ] DELETE requests working
- [ ] File uploads working
- [ ] Error responses handled

---

## 12. Regression Testing

### After Each Update

- [ ] All previous functionality still works
- [ ] No new console errors
- [ ] Performance not degraded
- [ ] User data migrated correctly
- [ ] License validation still works
- [ ] Installer still creates all shortcuts
- [ ] Uninstaller still works

---

## Test Execution Summary

### Completed Tests

| Test Category      | Tests Run | Passed | Failed | Skipped                |
| ------------------ | --------- | ------ | ------ | ---------------------- |
| Build Process      | 4         | 4      | 0      | 0                      |
| Installation       | 0         | 0      | 0      | 8 (requires build)     |
| License Validation | 0         | 0      | 0      | 7 (requires build)     |
| Startup & Errors   | 2         | 2      | 0      | 8 (requires build)     |
| Connection Mgmt    | 0         | 0      | 0      | 10 (requires Phase 2B) |
| Logging            | 0         | 0      | 0      | 6 (requires build)     |
| Security           | 3         | 3      | 0      | 9 (requires build)     |
| Performance        | 0         | 0      | 0      | 12 (requires build)    |
| Compatibility      | 0         | 0      | 0      | 15 (requires build)    |
| UI/UX              | 2         | 2      | 0      | 9 (requires build)     |
| Integration        | 0         | 0      | 0      | 13 (requires build)    |
| **TOTAL**          | **11**    | **11** | **0**  | **97**                 |

### Test Coverage

- **Core Build Tools**: ✅ 100% (icon generation, license keys)
- **Desktop Build**: 🔄 0% (requires Next.js build + Electron packaging)
- **Installation**: 🔄 0% (requires compiled installer)
- **Runtime Features**: 🔄 0% (requires installed application)
- **Phase 2B**: ❌ 0% (connection settings UI not yet implemented)

---

## Testing Recommendations

### Immediate (Before First Deployment)

1. **Build the installer**

   ```bash
   npm run build:desktop
   ```

2. **Test on clean Windows VM**
   - Fresh install
   - License validation
   - Basic functionality
   - Uninstall

3. **Test upgrade path**
   - Install version 0.6.0 (if available)
   - Upgrade to 0.7.0
   - Verify data preservation

4. **Test license scenarios**
   - Valid perpetual license
   - Expired license
   - Invalid signature
   - Machine-bound license

### Before Production Deployment

1. **Complete integration testing**
   - All database operations
   - All authentication flows
   - All API endpoints

2. **Performance testing**
   - Load testing with realistic data
   - Memory leak detection
   - Network latency simulation

3. **Security audit**
   - Penetration testing
   - Code review
   - Dependency vulnerability scan

4. **User acceptance testing**
   - Test with actual users
   - Gather feedback
   - Document issues

### Ongoing

1. **Regression testing** after every update
2. **Performance monitoring** in production
3. **Error tracking** via logs
4. **User feedback** collection

---

## Known Limitations

1. **Offline license validation** can be bypassed by determined attackers (design limitation)
2. **Phase 2B not implemented**: Connection settings UI pending
3. **No automated tests**: Manual testing required currently
4. **No update mechanism**: Manual reinstall required for updates
5. **Windows-only**: No macOS or Linux support

---

## Test Environment Setup

### For Full Testing

1. **Clean Windows VMs** (VirtualBox or Hyper-V):
   - Windows 10 VM
   - Windows 11 VM

2. **PostgreSQL Test Server**:
   - Running on accessible IP
   - Test database with sample data
   - User account with appropriate permissions

3. **Network Simulation**:
   - Tool for latency simulation (e.g., clumsy)
   - Ability to disconnect network

4. **Testing Tools**:
   - Process Explorer (resource monitoring)
   - Wireshark (network traffic analysis)
   - Windows Performance Monitor

---

## Bug Reporting Template

When reporting issues found during testing:

```markdown
**Title**: Brief description

**Environment**:

- OS: Windows 10/11
- Version: 0.7.0
- Install Type: Fresh/Upgrade

**Steps to Reproduce**:

1. Step 1
2. Step 2
3. Step 3

**Expected Behavior**:
What should happen

**Actual Behavior**:
What actually happened

**Logs**:
Attach contents of %APPDATA%\MSFAsset\logs\main.log

**Screenshots**:
If applicable

**Severity**: Critical/High/Medium/Low
```

---

**Document Status**: Draft - Testing in progress  
**Next Review**: After first production deployment  
**Maintained By**: TemesgenG
