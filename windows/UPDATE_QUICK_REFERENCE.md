# Electron Auto-Update Quick Reference

## One-Page Cheat Sheet

### Essential Configuration (package.json)

```json
{
  "version": "2.0.0",
  "dependencies": {
    "electron-updater": "^6.3.9",
    "electron-log": "^5.2.2"
  },
  "build": {
    "appId": "com.stoptyping.app",
    "productName": "Stop Typing",
    "publish": {
      "provider": "github",
      "owner": "your-username",
      "repo": "Voice-flow"
    },
    "nsis": {
      "oneClick": true,
      "perMachine": false,
      "allowElevation": true,
      "deleteAppDataOnUninstall": false,
      "differentialPackage": true
    }
  }
}
```

### Minimal Auto-Updater Code

```typescript
// autoUpdater.ts
import { autoUpdater } from 'electron-updater'
import { app, dialog } from 'electron'
import log from 'electron-log'

autoUpdater.logger = log
autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = true

export function initUpdater() {
  if (!app.isPackaged) return

  autoUpdater.on('update-available', (info) => {
    dialog.showMessageBox({
      message: `Update ${info.version} available. Download?`,
      buttons: ['Yes', 'No']
    }).then(r => r.response === 0 && autoUpdater.downloadUpdate())
  })

  autoUpdater.on('update-downloaded', () => {
    dialog.showMessageBox({
      message: 'Update ready. Restart now?',
      buttons: ['Restart', 'Later']
    }).then(r => r.response === 0 && autoUpdater.quitAndInstall(false, true))
  })

  // Check on startup (after 10s) and every 4 hours
  setTimeout(() => autoUpdater.checkForUpdates(), 10000)
  setInterval(() => autoUpdater.checkForUpdates(), 14400000)
}
```

### Release Workflow

```bash
# 1. Update version
npm version patch  # or minor/major

# 2. Build
cd windows
.\build.ps1

# 3. Create GitHub Release
git push origin v2.0.1

# 4. Upload to GitHub:
#    - windows/app/release/Stop Typing-Setup-2.0.1.exe
#    - windows/app/release/latest.yml
```

## Common Settings Explained

| Setting | Value | Why |
|---------|-------|-----|
| `oneClick` | `true` | Seamless updates, no installer UI |
| `perMachine` | `false` | Per-user install, no admin needed |
| `allowElevation` | `true` | Request admin if needed |
| `deleteAppDataOnUninstall` | `false` | **CRITICAL**: Preserve user data during updates |
| `differentialPackage` | `true` | Smaller updates (delta patches) |
| `autoDownload` | `false` | Ask user before downloading |
| `autoInstallOnAppQuit` | `true` | Install automatically when app closes |

## Critical Rules

### DO
- ✅ Set `deleteAppDataOnUninstall: false`
- ✅ Upload both `.exe` and `latest.yml`
- ✅ Use semantic versioning (2.0.0, not v2.0.0)
- ✅ Test updates before releasing
- ✅ Keep `appId` constant forever
- ✅ Check for updates only when `app.isPackaged`

### DON'T
- ❌ Change `appId` after first release
- ❌ Change `productName` after first release
- ❌ Put `v` prefix in package.json version
- ❌ Skip uploading `latest.yml`
- ❌ Use `deleteAppDataOnUninstall: true` (loses user data)
- ❌ Test updates in development mode

## File Locations

```
Install:     C:\Users\Username\AppData\Local\Programs\stop-typing\
User Data:   C:\Users\Username\AppData\Roaming\Stop Typing\
Logs:        C:\Users\Username\AppData\Roaming\Stop Typing\logs\main.log
Downloads:   C:\Users\Username\AppData\Roaming\Stop Typing\*-updater\pending\
Registry:    HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\{GUID}
```

## Version Bumping

```bash
# Patch: 2.0.0 → 2.0.1 (bug fixes)
npm version patch

# Minor: 2.0.0 → 2.1.0 (new features)
npm version minor

# Major: 2.0.0 → 3.0.0 (breaking changes)
npm version major

# Prerelease: 2.0.0 → 2.1.0-beta.1
npm version 2.1.0-beta.1
```

## Update Events (electron-updater)

| Event | When | What to Do |
|-------|------|-----------|
| `checking-for-update` | Check starts | Show loading indicator |
| `update-available` | New version found | Ask user to download |
| `update-not-available` | No updates | Log or notify "up to date" |
| `download-progress` | Downloading | Show progress bar |
| `update-downloaded` | Download complete | Ask to restart |
| `error` | Something failed | Log error, retry later |

## Quick Debugging

```bash
# View logs
type "%APPDATA%\Stop Typing\logs\main.log"

# Check version
Get-ItemProperty "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*" |
  Where-Object DisplayName -like "*Stop Typing*" |
  Select-Object DisplayName, DisplayVersion

# Clear update cache
rd /s /q "%APPDATA%\Stop Typing\*-updater"

# Check what's listening
netstat -ano | findstr ":5173"
netstat -ano | findstr ":8001"
```

## Troubleshooting Checklist

Update not detected?
- [ ] `latest.yml` uploaded to GitHub Release?
- [ ] Version in package.json has no `v` prefix?
- [ ] Publish config matches GitHub username/repo?
- [ ] Clear cache: Delete `%APPDATA%\Stop Typing\*-updater\`

Update downloads but doesn't install?
- [ ] `autoInstallOnAppQuit: true`?
- [ ] Using `quitAndInstall(false, true)` not `app.quit()`?
- [ ] Antivirus not blocking installer?
- [ ] App fully closed (not just minimized)?

Lost user data?
- [ ] `deleteAppDataOnUninstall: false`?
- [ ] Check for backup: `voiceflow.db-backup`

Permission errors?
- [ ] `perMachine: false`?
- [ ] Not installed in Program Files?
- [ ] No other instances running?

## Testing Updates Locally

```bash
# 1. Build v2.0.0
npm version 2.0.0
npm run dist:win
.\release\Stop-Typing-Setup-2.0.0.exe  # Install

# 2. Build v2.0.1
npm version 2.0.1
npm run dist:win

# 3. Create GitHub Release with v2.0.1
# Upload: Stop Typing-Setup-2.0.1.exe + latest.yml

# 4. Open installed app
# Wait 10 seconds or click "Check for Updates"
# Should detect v2.0.1
```

## GitHub Actions CI/CD

```yaml
# .github/workflows/release.yml
name: Release
on:
  push:
    tags: ['v*']
jobs:
  release:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - uses: actions/setup-python@v4
      - run: cd windows && .\build.ps1
      - uses: softprops/action-gh-release@v1
        with:
          files: |
            windows/app/release/*.exe
            windows/app/release/*.yml
```

Usage: `git push origin v2.0.1`

## API Reference

### autoUpdater Methods

```typescript
autoUpdater.checkForUpdates()           // Manual check
autoUpdater.checkForUpdatesAndNotify()  // Silent check + download
autoUpdater.downloadUpdate()            // Start download
autoUpdater.quitAndInstall(silent, forceRun)  // Install now
```

### autoUpdater Properties

```typescript
autoUpdater.autoDownload = false        // Manual download
autoUpdater.autoInstallOnAppQuit = true // Auto-install on quit
autoUpdater.allowPrerelease = false     // Accept beta versions
autoUpdater.channel = 'latest'          // Release channel
autoUpdater.logger = electronLog        // Logger instance
```

### App Methods

```typescript
app.getVersion()        // Get current version
app.isPackaged          // Check if production build
app.getPath('userData') // Get app data directory
```

## Security Best Practices

```json
// Code signing (optional, recommended)
"win": {
  "certificateFile": "cert.pfx",
  "certificatePassword": "password",
  "signAndEditExecutable": true,
  "signingHashAlgorithms": ["sha256"]
}
```

## Performance Optimization

| Feature | Savings | Trade-off |
|---------|---------|-----------|
| Differential updates | 60-80% smaller | Requires more CPU to apply patch |
| ASAR packaging | Faster startup | Slightly harder to debug |
| Lazy loading | Faster initial load | Complexity in code |

## Data Preservation Strategy

### What Updates (replaced)
- Application binaries
- Resources (asar, exe)
- Shortcuts
- Registry entries

### What Survives (preserved)
- User database
- Settings
- Personal dictionary
- Transcription history
- Logs

## Emergency Rollback

```bash
# Option 1: Re-upload old version as latest
# 1. Download Stop-Typing-Setup-2.0.0.exe from old release
# 2. Update latest.yml to point to 2.0.0
# 3. Upload to new release v2.0.2

# Option 2: Mark release as pre-release
# On GitHub: Edit release → Check "Pre-release"
# This hides it from auto-update

# Option 3: Users manually install old version
# Download from releases, install over broken version
```

## Update Size Estimates

```
Full installer:         ~145 MB
Differential update:    ~25 MB (80% smaller)
Download time (10 Mbps): 2 minutes (full), 20 seconds (diff)
Install time:           ~10 seconds
Total downtime:         ~15 seconds (user barely notices)
```

## Release Checklist

Pre-release:
- [ ] Version updated in package.json
- [ ] Changelog/release notes prepared
- [ ] Tested on clean install
- [ ] Tested update from previous version
- [ ] Database migrations (if needed)
- [ ] Backend rebuilt
- [ ] Frontend rebuilt

Release:
- [ ] Tag created: `git tag v2.0.1`
- [ ] Tag pushed: `git push origin v2.0.1`
- [ ] GitHub Release created
- [ ] `.exe` uploaded
- [ ] `latest.yml` uploaded
- [ ] Release notes published

Post-release:
- [ ] Monitor update success rate
- [ ] Check error logs
- [ ] Respond to user feedback
- [ ] Plan next release

## Common Error Messages

| Error | Cause | Fix |
|-------|-------|-----|
| "Cannot find latest.yml" | File not uploaded | Upload latest.yml to release |
| "Update signature verification failed" | Corrupted download | Will auto-retry |
| "Access denied" | Permissions | Use perMachine: false |
| "Already up to date" | Version not higher | Check semver comparison |
| "Network request failed" | GitHub down/rate limit | Retry later |

## Resources

- [electron-updater Docs](https://www.electron.build/auto-update.html)
- [NSIS Config](https://www.electron.build/nsis.html)
- [Publishing Guide](https://www.electronjs.org/docs/latest/tutorial/tutorial-publishing-updating)
- [GitHub Issues](https://github.com/electron-userland/electron-builder/issues)

## Support

For issues:
1. Check `%APPDATA%\Stop Typing\logs\main.log`
2. Enable debug: `autoUpdater.logger.transports.file.level = 'debug'`
3. Search GitHub issues
4. Test with minimal config

---

**Last Updated:** January 2025 (for electron-updater v6.3.9)
