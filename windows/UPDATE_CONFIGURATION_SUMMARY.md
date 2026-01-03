# Auto-Update Configuration Summary

## Quick Implementation Checklist

### 1. Install Dependencies

```bash
cd windows/app
npm install electron-updater electron-log --save
```

### 2. Update package.json Configuration

**File**: `windows/app/package.json`

#### Change NSIS Configuration

```json
"nsis": {
  "oneClick": true,
  "perMachine": false,
  "allowToChangeInstallationDirectory": false,
  "allowElevation": true,
  "deleteAppDataOnUninstall": false,  // Changed from true
  "createDesktopShortcut": true,
  "createStartMenuShortcut": true,
  "shortcutName": "Stop Typing",
  "runAfterFinish": true,
  "differentialPackage": true,  // Added for smaller updates
  "installerIcon": "build/icon.ico",
  "uninstallerIcon": "build/icon.ico"
}
```

#### Add Publish Configuration

```json
"build": {
  "appId": "com.stoptyping.app",
  "productName": "Stop Typing",
  "copyright": "Copyright © 2025 Yash",
  "publish": [
    {
      "provider": "github",
      "owner": "your-github-username",
      "repo": "Voice-flow",
      "releaseType": "release"
    }
  ],
  "generateUpdatesFilesForAllChannels": true,
  "directories": {
    "output": "release",
    "buildResources": "build"
  }
}
```

#### Add to Dependencies

```json
"dependencies": {
  "@types/ws": "^8.18.1",
  "electron-log": "^5.2.2",
  "electron-updater": "^6.3.9",
  "uiohook-napi": "^1.5.4",
  "ws": "^8.18.3"
}
```

### 3. Create Auto-Updater Module

**File**: `windows/app/autoUpdater.ts`

See full implementation in `ELECTRON_UPDATES.md` or use this minimal version:

```typescript
import { autoUpdater } from 'electron-updater'
import { app, BrowserWindow, dialog } from 'electron'
import log from 'electron-log'

autoUpdater.logger = log
autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = true

export class AutoUpdateManager {
  constructor(private mainWindow: BrowserWindow | null) {
    if (!app.isPackaged) return
    this.setupHandlers()
  }

  private setupHandlers() {
    autoUpdater.on('update-available', (info) => {
      dialog.showMessageBox({
        type: 'info',
        title: 'Update Available',
        message: `Version ${info.version} is available. Download?`,
        buttons: ['Download', 'Later']
      }).then((result) => {
        if (result.response === 0) autoUpdater.downloadUpdate()
      })
    })

    autoUpdater.on('update-downloaded', () => {
      dialog.showMessageBox({
        type: 'info',
        title: 'Update Ready',
        message: 'Restart now to install?',
        buttons: ['Restart', 'Later']
      }).then((result) => {
        if (result.response === 0) {
          setImmediate(() => autoUpdater.quitAndInstall(false, true))
        }
      })
    })
  }

  checkForUpdates() {
    if (app.isPackaged) autoUpdater.checkForUpdates()
  }

  startPeriodicCheck() {
    if (!app.isPackaged) return
    setTimeout(() => this.checkForUpdates(), 10000)
    setInterval(() => this.checkForUpdates(), 4 * 60 * 60 * 1000)
  }
}
```

### 4. Integrate in main.ts

**File**: `windows/app/main.ts`

Add at the top:
```typescript
import { AutoUpdateManager } from './autoUpdater'
```

Add after `app.whenReady()`:
```typescript
let updateManager: AutoUpdateManager | null = null

app.whenReady().then(async () => {
  // ... existing code ...

  createWindow(true)
  createToastWindow()
  createTray()

  // Initialize auto-updater
  updateManager = new AutoUpdateManager(mainWindow)
  updateManager.startPeriodicCheck()

  // ... rest of code ...
})
```

Add to tray menu:
```typescript
const contextMenu = Menu.buildFromTemplate([
  { label: 'Settings', click: () => showWindow() },
  { label: 'Check for Updates', click: () => updateManager?.checkForUpdates() },
  { type: 'separator' },
  { label: 'Quit', click: () => { isQuitting = true; app.quit() } }
])
```

### 5. Publishing Updates

#### Option A: Manual (One-Time Setup)

1. Update version in `package.json`:
   ```json
   "version": "2.1.0"
   ```

2. Build:
   ```bash
   cd windows
   .\build.ps1
   ```

3. Create GitHub Release:
   - Go to your repo → Releases → New Release
   - Tag: `v2.1.0`
   - Upload both files from `windows/app/release/`:
     - `Stop Typing-Setup-2.1.0.exe`
     - `latest.yml`

#### Option B: Automated (Recommended)

Create `.github/workflows/release.yml`:

```yaml
name: Build and Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: windows-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Setup Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.11'

      - name: Build
        run: |
          cd windows
          .\build.ps1

      - name: Release
        uses: softprops/action-gh-release@v1
        with:
          files: |
            windows/app/release/*.exe
            windows/app/release/*.yml
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

Usage:
```bash
git tag v2.1.0
git push origin v2.1.0
```

### 6. Testing Updates

#### Local Test

1. Install v2.0.0
2. Build v2.0.1
3. Create GitHub release with v2.0.1
4. Launch v2.0.0 app
5. Wait 10 seconds or click "Check for Updates"
6. Should prompt to download v2.0.1

## Key Configuration Changes Explained

### Why `deleteAppDataOnUninstall: false`?

- **Auto-updates** trigger uninstall → reinstall cycle
- Setting to `true` would delete user's transcription history and settings during update
- Only manual uninstalls should delete data (use custom NSIS script for this)

### Why `perMachine: false`?

- Per-user installation doesn't require admin rights
- Updates can install without UAC prompt
- Better for auto-updates (seamless experience)

### Why `differentialPackage: true`?

- Only downloads changed files
- Reduces update size by 60-80%
- Faster updates for users

### Why `allowElevation: true`?

- Allows requesting elevation if needed
- Default is true anyway
- Good for edge cases where elevation is required

## Version Workflow

### Patch Release (Bug Fix)
```bash
npm version patch  # 2.0.0 → 2.0.1
git push origin v2.0.1
```

### Minor Release (New Feature)
```bash
npm version minor  # 2.0.0 → 2.1.0
git push origin v2.1.0
```

### Major Release (Breaking Changes)
```bash
npm version major  # 2.0.0 → 3.0.0
git push origin v3.0.0
```

### Beta Release
```bash
npm version 2.1.0-beta.1
git push origin v2.1.0-beta.1
```

## Troubleshooting

### Update Not Detected

1. Check `latest.yml` is uploaded to GitHub Release
2. Verify version follows semver (no `v` prefix in package.json)
3. Check logs: `%APPDATA%\Stop Typing\logs\main.log`

### Update Downloads But Doesn't Install

1. Ensure `autoInstallOnAppQuit: true`
2. Close app completely (not just minimize)
3. Check antivirus isn't blocking installer

### "Access Denied" During Update

1. Don't install to Program Files (use per-user install)
2. Close all instances of the app
3. Try running as admin (once)

## Migration from Current Setup

Current users already have the app installed with `deleteAppDataOnUninstall: true`. Here's how to handle the transition:

1. **First update after implementing auto-updater**:
   - Users will need to manually install v2.1.0
   - Their data will be preserved (because current version has data, new installer has `deleteAppDataOnUninstall: false`)

2. **Subsequent updates**:
   - Fully automatic via electron-updater
   - No data loss

## Files Checklist

- [ ] `windows/app/package.json` - Updated with new NSIS config and publish settings
- [ ] `windows/app/autoUpdater.ts` - New file created
- [ ] `windows/app/main.ts` - Integrated auto-updater
- [ ] `.github/workflows/release.yml` - Optional, for automated releases
- [ ] `windows/app/build/icon.ico` - App icon for installer
- [ ] GitHub repo settings - Enable releases

## Next Steps

1. Implement configuration changes above
2. Test locally by creating a test release
3. Document update process for users
4. Set up CI/CD for automated releases (optional)
5. Monitor first few updates for issues

## Support

For detailed information, see `ELECTRON_UPDATES.md`.

For issues:
- Check electron-log output
- Review NSIS installer log at `%TEMP%\`
- Search [electron-builder issues](https://github.com/electron-userland/electron-builder/issues)
