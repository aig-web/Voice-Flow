# Electron Auto-Update Troubleshooting Guide

## Common Issues and Solutions

### Issue 1: "Update Not Available" Despite New Release

**Symptoms:**
- New version released on GitHub
- App reports "Already up to date"
- `checkForUpdates()` doesn't detect the update

**Possible Causes & Solutions:**

#### Cause 1.1: Missing latest.yml

**Check:**
```bash
# Verify latest.yml exists in GitHub Release
curl -I https://github.com/username/Voice-flow/releases/download/v2.1.0/latest.yml
```

**Solution:**
- Ensure `latest.yml` is uploaded alongside `.exe`
- It's auto-generated during build: `npm run dist:win`
- Located at: `windows/app/release/latest.yml`

#### Cause 1.2: Version Not Following Semver

**Check version in package.json:**
```json
// WRONG - has 'v' prefix
"version": "v2.1.0"

// CORRECT
"version": "2.1.0"
```

**Solution:**
- Remove `v` prefix from version in `package.json`
- Use `v` prefix only in git tags

#### Cause 1.3: Cached Update Metadata

**Check logs:**
```
Location: %APPDATA%\Stop Typing\logs\main.log

Look for:
"Checking for update from https://github.com/..."
```

**Solution:**
```bash
# Clear electron-updater cache
del /s /q "%APPDATA%\Stop Typing\*-updater\*"
```

#### Cause 1.4: Incorrect Publish Configuration

**Check package.json:**
```json
"publish": [
  {
    "provider": "github",
    "owner": "your-actual-github-username",  // Must match exactly
    "repo": "Voice-flow"  // Must match repo name
  }
]
```

**Solution:**
- Verify owner/repo match your GitHub repository
- Test URL: `https://api.github.com/repos/owner/repo/releases`

### Issue 2: Update Downloads But Doesn't Install

**Symptoms:**
- Update downloads successfully
- Progress reaches 100%
- "Update ready" message appears
- Clicking "Restart" doesn't install update
- App restarts with old version

**Possible Causes & Solutions:**

#### Cause 2.1: autoInstallOnAppQuit Disabled

**Check autoUpdater.ts:**
```typescript
// WRONG
autoUpdater.autoInstallOnAppQuit = false

// CORRECT
autoUpdater.autoInstallOnAppQuit = true
```

**Solution:**
```typescript
import { autoUpdater } from 'electron-updater'

autoUpdater.autoInstallOnAppQuit = true
```

#### Cause 2.2: App Not Fully Quitting

**Check main.ts:**
```typescript
// WRONG - just hides window
app.quit()

// CORRECT - force quit all windows first
setImmediate(() => {
  app.removeAllListeners('window-all-closed')
  autoUpdater.quitAndInstall(false, true)
})
```

**Solution:**
- Use `quitAndInstall(false, true)` instead of `app.quit()`
- Parameters: (isSilent, isForceRunAfter)

#### Cause 2.3: Installer Blocked by Antivirus

**Check:**
- Windows Defender quarantine
- Third-party AV logs
- SmartScreen warnings

**Solution:**
```bash
# Check Windows Defender history
Get-MpThreat

# Whitelist app folder
Add-MpPreference -ExclusionPath "C:\Users\Username\AppData\Local\Programs\stop-typing"
```

Or for users:
- Add exception in antivirus settings
- Consider code signing installer (prevents false positives)

#### Cause 2.4: Downloaded Installer Corrupted

**Check logs for checksum errors:**
```
Error: sha512 checksum mismatch
Expected: abc123...
Actual: def456...
```

**Solution:**
```typescript
// electron-updater will auto-retry
// Or manually clear and re-download:
// 1. Delete: %APPDATA%\Stop Typing\*-updater\pending\*
// 2. Run checkForUpdates() again
```

### Issue 3: "Access Denied" or Permission Errors

**Symptoms:**
- Update fails with "Access Denied"
- "Installer failed to start"
- UAC prompts but fails anyway

**Possible Causes & Solutions:**

#### Cause 3.1: Per-Machine Installation with Per-User Update

**Check package.json:**
```json
// If you have:
"nsis": {
  "perMachine": true  // Problem: requires admin
}
```

**Solution:**
```json
"nsis": {
  "perMachine": false,  // Per-user: no admin needed
  "allowElevation": true  // But allow if necessary
}
```

#### Cause 3.2: App Installed in Program Files

**Check install location:**
```
Program Files: C:\Program Files\Stop Typing  // BAD for auto-update
AppData Local: C:\Users\...\AppData\Local\Programs\stop-typing  // GOOD
```

**Solution:**
- Uninstall current version
- Reinstall with `perMachine: false`
- New location will be in AppData (per-user)

#### Cause 3.3: Old Version Process Still Running

**Check:**
```bash
# PowerShell
Get-Process | Where-Object {$_.ProcessName -like "*typing*"}
```

**Solution:**
```typescript
// In main.ts before quit
app.on('before-quit', () => {
  // Ensure all windows closed
  BrowserWindow.getAllWindows().forEach(win => {
    win.destroy()
  })
})
```

#### Cause 3.4: Files Locked by Other Process

**Check:**
```bash
# PowerShell - find what's locking the file
handle.exe "C:\Users\...\Stop Typing.exe"
```

**Solution:**
- Close all instances of the app
- Wait a few seconds before installing
- NSIS will retry up to 3 times

### Issue 4: App Data Lost After Update

**Symptoms:**
- Update completes successfully
- App starts but settings are reset
- Transcription history is gone
- Personal dictionary cleared

**Cause:**
`deleteAppDataOnUninstall: true` in old installer

**Solution:**

**Prevention (for new installs):**
```json
"nsis": {
  "deleteAppDataOnUninstall": false
}
```

**Recovery (if data already lost):**
1. Check if database backup exists:
   ```
   %APPDATA%\Stop Typing\voiceflow.db-backup
   %APPDATA%\Stop Typing\voiceflow.db-journal
   ```

2. If no backup, data is unrecoverable

**Future Prevention:**
- Add database backup before updates:
  ```typescript
  // In autoUpdater.ts before quitAndInstall
  const dbPath = path.join(app.getPath('userData'), 'voiceflow.db')
  const backupPath = dbPath + '-backup'
  fs.copyFileSync(dbPath, backupPath)
  ```

### Issue 5: Update Uninstalls Old Version But Doesn't Install New

**Symptoms:**
- App disappears after update
- Shortcuts broken
- No app in Programs folder
- Registry entry removed

**Possible Causes & Solutions:**

#### Cause 5.1: artifactName Same as productName (Case-Insensitive)

**Check package.json:**
```json
// WRONG - conflicts cause installer to fail
"productName": "Stop Typing",
"win": {
  "artifactName": "stop-typing-Setup-${version}.${ext}"  // Matches!
}

// CORRECT - different names
"productName": "Stop Typing",
"win": {
  "artifactName": "${productName}-Setup-${version}.${ext}"  // Uses template
}
```

**Solution:**
- Use template variables: `${productName}-Setup-${version}.${ext}`
- Or use clearly different name: `StopTypingInstaller-${version}.exe`

#### Cause 5.2: Custom Install Location Changed

**Check:**
```
First install: C:\Users\...\AppData\Local\Programs\stop-typing
Update tries: C:\Users\...\AppData\Local\Programs\StopTyping  // Different!
```

**Cause:**
- `productName` changed between versions
- Install directory is based on `productName`

**Solution:**
- Never change `productName` after first release
- If you must, document migration path for users

#### Cause 5.3: NSIS oneClick vs Assisted Mismatch

**Scenario:**
- First install: `oneClick: false` (assisted)
- Update: `oneClick: true` (one-click)
- Result: Registry keys don't match

**Solution:**
- Keep `oneClick` consistent across versions
- Recommended: `oneClick: true` for auto-updates

### Issue 6: Slow Update Downloads

**Symptoms:**
- Update download takes very long
- Progress bar stuck at certain percentage
- Timeout errors

**Possible Causes & Solutions:**

#### Cause 6.1: Large Installer Size

**Check installer size:**
```bash
# Should be ~145 MB for Voice-Flow
ls -lh windows/app/release/*.exe
```

**Solution:**
Enable differential updates:
```json
"nsis": {
  "differentialPackage": true
}
```

Reduces update size by ~80%.

#### Cause 6.2: GitHub API Rate Limiting

**Check logs for:**
```
Error: GitHub API rate limit exceeded
X-RateLimit-Remaining: 0
```

**Solution (for private repos):**
```typescript
// Use direct releases endpoint instead of API
autoUpdater.setFeedURL({
  provider: 'github',
  owner: 'username',
  repo: 'Voice-flow',
  private: false  // Use releases URL, not API
})
```

#### Cause 6.3: Network Interruption

**Logs show:**
```
Download failed: ECONNRESET
Retrying... (attempt 2/3)
```

**Solution:**
electron-updater auto-retries up to 3 times with exponential backoff.

To customize:
```typescript
autoUpdater.on('error', (error) => {
  if (error.message.includes('ECONNRESET')) {
    // Retry manually after 30 seconds
    setTimeout(() => autoUpdater.checkForUpdates(), 30000)
  }
})
```

### Issue 7: Update Breaks App Functionality

**Symptoms:**
- Update installs successfully
- App starts but features don't work
- Database errors
- Missing files

**Possible Causes & Solutions:**

#### Cause 7.1: Database Schema Changed

**Scenario:**
- v2.0.0 has 3 tables
- v2.1.0 adds 4th table
- Old database doesn't have new table

**Solution:**
Implement database migrations in main.ts:

```typescript
import Database from 'better-sqlite3'

function migrateDatabase(db: Database.Database) {
  const version = db.pragma('user_version', { simple: true })

  if (version < 1) {
    // Migration 1: Add new column
    db.exec('ALTER TABLE transcriptions ADD COLUMN tags TEXT')
    db.pragma('user_version = 1')
  }

  if (version < 2) {
    // Migration 2: Add new table
    db.exec(`
      CREATE TABLE IF NOT EXISTS tags (
        id INTEGER PRIMARY KEY,
        name TEXT UNIQUE
      )
    `)
    db.pragma('user_version = 2')
  }
}
```

#### Cause 7.2: Backend Executable Not Updated

**Check:**
```bash
# Compare file dates
ls -l resources/voice-engine.exe
```

**Solution:**
Ensure build.ps1 rebuilds backend:
```powershell
# In build.ps1, don't skip backend
.\build.ps1  # Builds all components
```

#### Cause 7.3: Cached Frontend Assets

**Symptoms:**
- UI looks old despite update
- JavaScript errors in console

**Solution:**
```typescript
// In main.ts when loading window
mainWindow.loadFile(indexPath, {
  query: {
    "cache-bust": app.getVersion()
  }
})

// Or force refresh
mainWindow.webContents.reloadIgnoringCache()
```

### Issue 8: Multiple Update Notifications

**Symptoms:**
- "Update available" appears multiple times
- Download progress duplicated
- Multiple installers downloaded

**Cause:**
Multiple instances of AutoUpdateManager created

**Solution:**
```typescript
// In main.ts - use singleton pattern
let updateManager: AutoUpdateManager | null = null

app.whenReady().then(() => {
  // Only create once
  if (!updateManager) {
    updateManager = new AutoUpdateManager(mainWindow)
  }
})

// Don't recreate on window recreate
function createWindow() {
  mainWindow = new BrowserWindow({...})

  // Just update reference, don't create new manager
  if (updateManager) {
    updateManager.setMainWindow(mainWindow)
  }
}
```

### Issue 9: Silent Update Doesn't Work

**Symptoms:**
- Want silent updates (no user interaction)
- But dialogs still appear
- Update doesn't install automatically

**Current Configuration:**
```typescript
autoUpdater.autoDownload = false  // Asks user
```

**For Silent Updates:**
```typescript
import { autoUpdater } from 'electron-updater'

autoUpdater.autoDownload = true  // Download automatically
autoUpdater.autoInstallOnAppQuit = true  // Install on quit

// Don't show dialogs
autoUpdater.on('update-available', (info) => {
  // Just log, don't show dialog
  log.info('Update available:', info.version)
})

autoUpdater.on('update-downloaded', () => {
  // Install on next quit automatically
  log.info('Update ready, will install on next quit')
})
```

**For Completely Silent (no notifications):**
```typescript
autoUpdater.checkForUpdatesAndNotify()  // Built-in silent mode
```

### Issue 10: Development Mode Update Testing

**Problem:**
Can't test updates in development mode

**Solution 1: Test Builds**

```bash
# Build production version
npm run dist:win

# Install it
.\release\Stop-Typing-Setup-2.0.0.exe

# Create new version
# Update package.json to 2.0.1
npm run dist:win

# Upload both to GitHub
# Test auto-update in installed app
```

**Solution 2: Local Update Server**

```typescript
// In autoUpdater.ts for testing
if (!app.isPackaged && process.env.TEST_UPDATES) {
  autoUpdater.setFeedURL({
    provider: 'generic',
    url: 'http://localhost:8080'
  })
}
```

```bash
# Serve updates locally
cd windows/app/release
npx http-server -p 8080 --cors

# Run app with test flag
$env:TEST_UPDATES="true"
npm start
```

**Solution 3: Force Update Check in Dev**

```typescript
// Remove app.isPackaged check for testing
// WARNING: Only for testing, remove for production
autoUpdater.forceDevUpdateConfig = true
autoUpdater.checkForUpdates()
```

## Diagnostic Commands

### Check Current Version

```typescript
// In renderer console
console.log(await window.electron.invoke('vf:get-app-version'))
```

### Check Update Status

```typescript
// In main process
log.info('App version:', app.getVersion())
log.info('Is packaged:', app.isPackaged)
log.info('User data:', app.getPath('userData'))
log.info('App path:', app.getAppPath())
```

### View Update Logs

```bash
# Windows
type "%APPDATA%\Stop Typing\logs\main.log"

# PowerShell
Get-Content "$env:APPDATA\Stop Typing\logs\main.log" -Tail 50
```

### Check Registry

```bash
# PowerShell
Get-ItemProperty "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*" |
  Where-Object DisplayName -like "*Stop Typing*"
```

### Check Installed Files

```bash
# PowerShell
Get-ChildItem "$env:LOCALAPPDATA\Programs\stop-typing" -Recurse |
  Select-Object FullName, Length, LastWriteTime
```

### Check Download Cache

```bash
dir "%APPDATA%\Stop Typing\*-updater\pending"
```

## Prevention Checklist

Before releasing updates:

- [ ] Version follows semver (no `v` prefix)
- [ ] `latest.yml` generated and will be uploaded
- [ ] `deleteAppDataOnUninstall: false` set
- [ ] `productName` and `appId` unchanged
- [ ] Database migrations implemented (if schema changed)
- [ ] Backend rebuilt with latest changes
- [ ] Frontend built with cache busting
- [ ] Tested on clean Windows install
- [ ] Tested update from previous version
- [ ] Release notes prepared
- [ ] GitHub release created with both `.exe` and `.yml`

## Recovery Procedures

### If Update Completely Breaks App

1. **Immediate:**
   - Download previous version from GitHub Releases
   - Install over broken version
   - Database should be preserved

2. **Rollback Release:**
   ```bash
   # Mark current release as pre-release (hides from auto-update)
   # On GitHub: Edit release → Check "This is a pre-release"
   ```

3. **Emergency Fix:**
   ```bash
   # Build patch version
   npm version patch
   # Fix issue
   npm run dist:win
   # Upload to GitHub immediately
   ```

### If Database Corrupted

```typescript
// Add to main.ts startup
const db = new Database(dbPath)

try {
  db.pragma('integrity_check')
} catch (error) {
  // Restore from backup
  const backupPath = dbPath + '-backup'
  if (fs.existsSync(backupPath)) {
    fs.copyFileSync(backupPath, dbPath)
    dialog.showMessageBox({
      type: 'warning',
      message: 'Database restored from backup'
    })
  }
}
```

### If Registry Broken

```bash
# PowerShell - Re-run installer to fix registry
.\Stop-Typing-Setup-2.1.0.exe /S  # Silent reinstall
```

## Getting Help

1. **Check Logs First:**
   - `%APPDATA%\Stop Typing\logs\main.log`
   - NSIS log: `%TEMP%\nsis_installer_log.txt`

2. **Enable Verbose Logging:**
   ```typescript
   autoUpdater.logger.transports.file.level = 'debug'
   ```

3. **Search electron-builder Issues:**
   - https://github.com/electron-userland/electron-builder/issues
   - Filter by "nsis" or "updater" labels

4. **Test with electron-updater Example:**
   - https://github.com/iffy/electron-updater-example
   - Minimal working example for comparison

5. **Check electron-updater Changelog:**
   - https://github.com/electron-userland/electron-builder/releases
   - Breaking changes are documented

## Reference: Minimal Working Configuration

If all else fails, use this proven configuration:

```json
{
  "name": "stop-typing",
  "version": "2.0.0",
  "main": "dist/main.js",
  "dependencies": {
    "electron-updater": "^6.3.9"
  },
  "build": {
    "appId": "com.stoptyping.app",
    "productName": "Stop Typing",
    "publish": {
      "provider": "github",
      "owner": "username",
      "repo": "Voice-flow"
    },
    "win": {
      "target": "nsis"
    },
    "nsis": {
      "oneClick": true,
      "perMachine": false,
      "deleteAppDataOnUninstall": false
    }
  }
}
```

```typescript
// Minimal autoUpdater.ts
import { autoUpdater } from 'electron-updater'
import { app } from 'electron'

if (app.isPackaged) {
  autoUpdater.checkForUpdatesAndNotify()
}
```

This minimal setup handles:
- Update detection
- Download
- Installation
- Data preservation

Add complexity only as needed.
