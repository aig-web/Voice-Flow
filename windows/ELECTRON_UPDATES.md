# Electron Auto-Update Configuration Guide

## Overview

This document provides comprehensive configuration for implementing smooth auto-updates in Voice-Flow using electron-updater with NSIS installers.

## Current Configuration Analysis

**Current NSIS Settings** (from `windows/app/package.json`):
```json
"nsis": {
  "oneClick": true,
  "perMachine": false,
  "allowToChangeInstallationDirectory": false,
  "deleteAppDataOnUninstall": true,
  "createDesktopShortcut": true,
  "createStartMenuShortcut": true,
  "shortcutName": "Stop Typing",
  "runAfterFinish": true
}
```

## Recommended Configuration for Smooth Updates

### 1. Enhanced NSIS Configuration

Replace the current NSIS configuration with this update-friendly version:

```json
"nsis": {
  "oneClick": true,
  "perMachine": false,
  "allowToChangeInstallationDirectory": false,
  "allowElevation": true,
  "deleteAppDataOnUninstall": false,
  "createDesktopShortcut": true,
  "createStartMenuShortcut": true,
  "shortcutName": "Stop Typing",
  "runAfterFinish": true,
  "installerIcon": "build/icon.ico",
  "uninstallerIcon": "build/icon.ico",
  "installerHeader": "build/installerHeader.bmp",
  "installerSidebar": "build/installerSidebar.bmp",
  "uninstallDisplayName": "${productName}",
  "createStartMenuShortcut": true,
  "menuCategory": true,
  "differentialPackage": true
}
```

**Key Changes Explained:**

- `allowElevation: true` - Allows requesting elevation for updates (default: true)
- `deleteAppDataOnUninstall: false` - IMPORTANT: Prevents data loss during auto-updates (set to true only for complete manual uninstalls via custom script)
- `differentialPackage: true` - Enables differential updates (smaller download sizes for updates)
- `perMachine: false` - Per-user installation works better with auto-updates (no admin rights needed)

### 2. Install electron-updater

Add electron-updater as a **production dependency** (not devDependency):

```bash
cd windows/app
npm install electron-updater --save
```

Update `windows/app/package.json`:
```json
"dependencies": {
  "@types/ws": "^8.18.1",
  "electron-updater": "^6.3.9",
  "uiohook-napi": "^1.5.4",
  "ws": "^8.18.3"
}
```

### 3. Configure Publishing

Add publish configuration to `windows/app/package.json` build section:

```json
"build": {
  "appId": "com.stoptyping.app",
  "productName": "Stop Typing",
  "publish": [
    {
      "provider": "github",
      "owner": "your-github-username",
      "repo": "Voice-flow",
      "releaseType": "release"
    }
  ],
  "win": {
    "target": [
      {
        "target": "nsis",
        "arch": ["x64"]
      }
    ],
    "artifactName": "${productName}-Setup-${version}.${ext}",
    "signAndEditExecutable": false,
    "publisherName": "Yash"
  }
}
```

### 4. Auto-Update Implementation

Create `windows/app/autoUpdater.ts`:

```typescript
/**
 * Auto-Update Module for Voice-Flow
 * Handles checking for updates, downloading, and installing new versions
 */

import { autoUpdater } from 'electron-updater'
import { app, BrowserWindow, dialog } from 'electron'
import log from 'electron-log'

// Configure logging
autoUpdater.logger = log
autoUpdater.logger.transports.file.level = 'info'
log.info('App starting...')

// Auto-updater configuration
autoUpdater.autoDownload = false // Ask user before downloading
autoUpdater.autoInstallOnAppQuit = true // Install on quit automatically

export class AutoUpdateManager {
  private mainWindow: BrowserWindow | null = null
  private updateCheckInterval: NodeJS.Timeout | null = null

  constructor(mainWindow: BrowserWindow | null) {
    this.mainWindow = mainWindow
    this.setupUpdateHandlers()
  }

  private setupUpdateHandlers(): void {
    // Only check for updates in production
    if (!app.isPackaged) {
      log.info('Running in development mode - updates disabled')
      return
    }

    // Event: Checking for updates
    autoUpdater.on('checking-for-update', () => {
      log.info('Checking for updates...')
      this.sendStatusToWindow('Checking for updates...')
    })

    // Event: Update available
    autoUpdater.on('update-available', (info) => {
      log.info('Update available:', info)
      this.sendStatusToWindow('Update available')

      // Ask user if they want to download
      dialog.showMessageBox({
        type: 'info',
        title: 'Update Available',
        message: `A new version ${info.version} is available. Download now?`,
        buttons: ['Download', 'Later'],
        defaultId: 0,
        cancelId: 1
      }).then((result) => {
        if (result.response === 0) {
          autoUpdater.downloadUpdate()
        }
      })
    })

    // Event: Update not available
    autoUpdater.on('update-not-available', (info) => {
      log.info('Update not available:', info)
      this.sendStatusToWindow('App is up to date')
    })

    // Event: Download progress
    autoUpdater.on('download-progress', (progressObj) => {
      const logMessage = `Download speed: ${progressObj.bytesPerSecond} - Downloaded ${progressObj.percent}% (${progressObj.transferred}/${progressObj.total})`
      log.info(logMessage)
      this.sendStatusToWindow(`Downloading update: ${Math.round(progressObj.percent)}%`)
    })

    // Event: Update downloaded
    autoUpdater.on('update-downloaded', (info) => {
      log.info('Update downloaded:', info)
      this.sendStatusToWindow('Update ready to install')

      // Ask user to restart and install
      dialog.showMessageBox({
        type: 'info',
        title: 'Update Ready',
        message: 'Update downloaded. Restart now to install?',
        buttons: ['Restart', 'Later'],
        defaultId: 0,
        cancelId: 1
      }).then((result) => {
        if (result.response === 0) {
          // setImmediate ensures all windows are closed before quitting
          setImmediate(() => {
            app.removeAllListeners('window-all-closed')
            autoUpdater.quitAndInstall(false, true)
          })
        }
      })
    })

    // Event: Update error
    autoUpdater.on('error', (error) => {
      log.error('Update error:', error)
      this.sendStatusToWindow('Update error: ' + error.message)
    })
  }

  /**
   * Check for updates manually
   */
  public checkForUpdates(): void {
    if (!app.isPackaged) {
      log.info('Cannot check for updates in development mode')
      return
    }

    autoUpdater.checkForUpdates()
  }

  /**
   * Check for updates silently (no user interaction)
   */
  public checkForUpdatesAndNotify(): void {
    if (!app.isPackaged) return
    autoUpdater.checkForUpdatesAndNotify()
  }

  /**
   * Start periodic update checks (every 4 hours)
   */
  public startPeriodicUpdateCheck(): void {
    if (!app.isPackaged) return

    // Check on startup
    setTimeout(() => {
      this.checkForUpdates()
    }, 10000) // Wait 10 seconds after startup

    // Check every 4 hours
    this.updateCheckInterval = setInterval(() => {
      this.checkForUpdates()
    }, 4 * 60 * 60 * 1000)
  }

  /**
   * Stop periodic update checks
   */
  public stopPeriodicUpdateCheck(): void {
    if (this.updateCheckInterval) {
      clearInterval(this.updateCheckInterval)
      this.updateCheckInterval = null
    }
  }

  /**
   * Send status to renderer window
   */
  private sendStatusToWindow(message: string): void {
    log.info(message)
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('vf:update-status', message)
    }
  }

  /**
   * Set the main window reference
   */
  public setMainWindow(window: BrowserWindow | null): void {
    this.mainWindow = window
  }
}
```

### 5. Integrate Auto-Updater in main.ts

Add to `windows/app/main.ts`:

```typescript
import { AutoUpdateManager } from './autoUpdater'

// After app.whenReady()
let updateManager: AutoUpdateManager | null = null

app.whenReady().then(async () => {
  // ... existing code ...

  createWindow(true)
  createToastWindow()
  createTray()

  await loadSavedHotkey()
  registerHotkeys()

  // Initialize auto-updater
  updateManager = new AutoUpdateManager(mainWindow)
  updateManager.startPeriodicUpdateCheck()

  log('Ready! Hold ${currentHotkey} to record.')
})

// Update the main window reference when it's recreated
function createWindow(showImmediately = false) {
  // ... existing code ...

  if (updateManager) {
    updateManager.setMainWindow(mainWindow)
  }
}

// Clean up on quit
app.on('will-quit', () => {
  // ... existing code ...

  if (updateManager) {
    updateManager.stopPeriodicUpdateCheck()
  }
})
```

### 6. Add Update Menu Item (Optional)

In the tray menu creation:

```typescript
const contextMenu = Menu.buildFromTemplate([
  { label: 'Settings', click: () => showWindow() },
  { label: 'Check for Updates', click: () => updateManager?.checkForUpdates() },
  { type: 'separator' },
  { label: 'Quit', click: () => { isQuitting = true; app.quit() } }
])
```

## Publishing Releases

### Manual Publishing (GitHub Releases)

1. **Set GitHub Token** (for private repos, optional for public):
   ```bash
   # Windows PowerShell
   $env:GH_TOKEN="your-github-personal-access-token"
   ```

2. **Build and Publish**:
   ```bash
   cd windows/app
   npm version patch  # or minor/major
   npm run dist:win
   ```

3. **Upload to GitHub Releases**:
   - Use electron-builder's built-in publish:
     ```bash
     npm run dist:win -- --publish always
     ```
   - Or manually upload the `.exe` from `app/release/` to GitHub Releases

4. **Important Files**:
   - `Stop Typing-Setup-2.0.0.exe` - Main installer
   - `latest.yml` - Metadata file (auto-generated, must be uploaded too!)

### Automated Publishing (CI/CD)

Example GitHub Actions workflow (`.github/workflows/build.yml`):

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

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Setup Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.11'

      - name: Build Application
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

## Version Management

### Semantic Versioning

Voice-Flow follows [semantic versioning](https://semver.org/):

- **MAJOR** (2.x.x): Breaking changes
- **MINOR** (x.1.x): New features (backward compatible)
- **PATCH** (x.x.1): Bug fixes

**Update version in `windows/app/package.json`**:
```json
{
  "version": "2.0.0"
}
```

### Release Channels

For beta/alpha releases:

1. **Update version with prerelease tag**:
   ```json
   {
     "version": "2.1.0-beta.1"
   }
   ```

2. **Enable multi-channel updates** in `package.json`:
   ```json
   "build": {
     "generateUpdatesFilesForAllChannels": true
   }
   ```

3. **Configure auto-updater for channel**:
   ```typescript
   autoUpdater.allowPrerelease = true // In beta builds
   autoUpdater.channel = 'beta' // Or 'alpha'
   ```

## Registry and App Data Management

### Registry Keys

NSIS installer automatically manages Windows registry:
- **Location**: `HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Uninstall\{GUID}`
- **GUID Generation**: Auto-generated from `appId` (do NOT change appId after release!)

### App Data Handling

**User Data Locations**:
- Database: `%APPDATA%\Stop Typing\voiceflow.db`
- Settings: Stored in database
- Logs: `%APPDATA%\Stop Typing\logs\`

**Update Behavior**:
- `deleteAppDataOnUninstall: false` preserves user data during auto-updates
- Only manual uninstall should delete app data (requires custom NSIS script)

### Custom Uninstall Script (Selective Data Deletion)

Create `windows/app/build/installer.nsh`:

```nsis
!macro customUnInstall
  # Ask user if they want to delete app data
  MessageBox MB_YESNO|MB_ICONQUESTION \
    "Do you want to delete all application data? This includes your transcription history, settings, and personal dictionary." \
    /SD IDNO IDYES deleteData IDNO keepData

  deleteData:
    RMDir /r "$APPDATA\${PRODUCT_NAME}"
    Goto done

  keepData:
    # Keep data for potential reinstall
    Goto done

  done:
!macroend
```

Update `package.json` to use custom script:
```json
"nsis": {
  "include": "build/installer.nsh",
  "deleteAppDataOnUninstall": false
}
```

## Differential Updates

Enable differential updates to reduce download sizes:

```json
"build": {
  "nsis": {
    "differentialPackage": true
  }
}
```

**How it works**:
- Only changed files are downloaded
- Typically reduces update size by 60-80%
- Requires `latest.yml` to be published alongside installer

## Testing Updates

### Local Testing

1. **Install version 2.0.0**:
   ```bash
   cd windows/app/release
   .\Stop-Typing-Setup-2.0.0.exe
   ```

2. **Build version 2.0.1**:
   - Update version in `package.json` to `2.0.1`
   - Build: `npm run dist:win`

3. **Set up local update server**:
   ```bash
   npm install -g http-server
   cd windows/app/release
   http-server -p 8080 --cors
   ```

4. **Point app to local server** (in dev mode):
   ```typescript
   autoUpdater.setFeedURL({
     provider: 'generic',
     url: 'http://localhost:8080'
   })
   ```

### Production Testing

1. Create a draft release on GitHub
2. Upload `.exe` and `latest.yml`
3. Test with production build
4. Publish release when confirmed working

## Common Issues and Solutions

### Issue 1: Update Downloaded But Not Installing

**Symptom**: Update downloads but app doesn't install on quit

**Solution**:
- Ensure `autoInstallOnAppQuit: true`
- Use `quitAndInstall(false, true)` instead of `app.quit()`
- Check that installer is not blocked by antivirus

### Issue 2: "Update Not Available" Despite New Version

**Symptom**: App says "up to date" when update exists

**Solutions**:
- Verify `latest.yml` is uploaded to release
- Check version in `package.json` follows semver (no `v` prefix)
- Ensure publish configuration matches actual release location
- Clear app cache: Delete `%APPDATA%\Stop Typing\*-updater\`

### Issue 3: Permission Errors During Update

**Symptom**: "Access denied" or "Installer failed to start"

**Solution**:
- Use `perMachine: false` (per-user installation)
- Set `allowElevation: true`
- Don't run installer from Program Files

### Issue 4: Old Version Uninstalls But New Version Doesn't Install

**Symptom**: App uninstalls but update fails

**Solutions**:
- Ensure `artifactName` and `productName` are different (case-insensitive)
- Set `oneClick: true` for seamless updates
- Check NSIS log at `%TEMP%\nsis_installer_log.txt`

### Issue 5: App Data Lost After Update

**Symptom**: Settings/history cleared after update

**Solution**:
- Set `deleteAppDataOnUninstall: false`
- Use custom uninstall script for manual uninstalls only

## Best Practices Summary

1. Use `oneClick: true` + `perMachine: false` for seamless per-user updates
2. Set `deleteAppDataOnUninstall: false` to preserve data during updates
3. Enable `differentialPackage: true` for smaller updates
4. Check for updates on startup (after 10s delay) and every 4 hours
5. Always publish both `.exe` and `latest.yml` to GitHub Releases
6. Follow semantic versioning strictly
7. Test updates on fresh install before publishing
8. Use `autoInstallOnAppQuit: true` for silent background updates
9. Never change `appId` after first release
10. Use electron-log for debugging update issues

## Security Considerations

1. **Code Signing** (Recommended for production):
   ```json
   "win": {
     "certificateFile": "cert.pfx",
     "certificatePassword": "password",
     "signAndEditExecutable": true,
     "signingHashAlgorithms": ["sha256"],
     "rfc3161TimeStampServer": "http://timestamp.digicert.com"
   }
   ```

2. **Update Server Security**:
   - Use HTTPS for update server
   - Validate checksums (automatic with electron-updater)
   - Use GitHub Releases (built-in security)

3. **Private Repositories**:
   - Set `GH_TOKEN` environment variable
   - Add `private: true` to publish config
   - Note: GitHub API rate limits apply (5000/hour)

## Resources

- [electron-updater Documentation](https://www.electron.build/auto-update.html)
- [NSIS Configuration](https://www.electron.build/nsis.html)
- [Publishing and Updating](https://www.electronjs.org/docs/latest/tutorial/tutorial-publishing-updating)
- [Semantic Versioning](https://semver.org/)
- [electron-builder GitHub](https://github.com/electron-userland/electron-builder)

## Support

For issues with updates:
1. Check logs at `%APPDATA%\Stop Typing\logs\main.log`
2. Review NSIS installer log at `%TEMP%\nsis_installer_log.txt`
3. Enable verbose logging: `autoUpdater.logger.transports.file.level = 'debug'`
4. Search [electron-builder issues](https://github.com/electron-userland/electron-builder/issues)
