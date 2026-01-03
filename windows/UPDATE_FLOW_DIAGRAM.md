# Electron Auto-Update Flow Diagram

## Update Detection and Installation Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                        APP STARTUP (v2.0.0)                         │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 │ Wait 10 seconds
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│              AutoUpdater.checkForUpdates()                          │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ Fetch: https://api.github.com/repos/user/repo/releases      │   │
│  │ Expected file: latest.yml                                   │   │
│  └─────────────────────────────────────────────────────────────┘   │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 │ Compare versions
                                 ▼
                    ┌────────────────────────┐
                    │ Is update available?   │
                    └───────┬────────────────┘
                           / \
                          /   \
                    YES  /     \  NO
                        /       \
                       ▼         ▼
        ┌──────────────────┐   ┌──────────────────┐
        │ Update Available │   │ Up to date       │
        │ (v2.1.0 found)   │   │ No action needed │
        └────────┬─────────┘   └──────────────────┘
                 │
                 │ Show dialog
                 ▼
        ┌──────────────────────────────────┐
        │ "New version 2.1.0 available.    │
        │  Download now?"                  │
        │  [Download]  [Later]             │
        └───────┬──────────────┬───────────┘
               /                \
         YES  /                  \  NO
             /                    \
            ▼                      ▼
┌──────────────────────┐    ┌────────────────┐
│ Download Update      │    │ Dismiss        │
│ autoUpdater.download │    │ (check again   │
│ Update()             │    │  in 4 hours)   │
└──────┬───────────────┘    └────────────────┘
       │
       │ Download installer
       │ (differential if enabled)
       ▼
┌────────────────────────────────────────────┐
│          Download Progress                 │
│  ▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░ 45%             │
│  15.2 MB / 34.5 MB                        │
└──────────┬─────────────────────────────────┘
           │
           │ Download complete
           ▼
┌────────────────────────────────────────────┐
│  Update Downloaded & Verified              │
│  (checksum validation automatic)           │
└──────────┬─────────────────────────────────┘
           │
           │ Show dialog
           ▼
┌──────────────────────────────────────────┐
│ "Update ready to install.                │
│  Restart now?"                           │
│  [Restart]  [Later]                      │
└─────────┬──────────────┬─────────────────┘
         /                \
   YES  /                  \  NO
       /                    \
      ▼                      ▼
┌──────────────────┐   ┌────────────────────┐
│ quitAndInstall() │   │ Install on next    │
│                  │   │ quit (auto)        │
└────────┬─────────┘   └────────────────────┘
         │
         │ Close app
         ▼
┌──────────────────────────────────────────┐
│     NSIS Installer Launched              │
│  ┌────────────────────────────────────┐  │
│  │ 1. Terminate old version process   │  │
│  │ 2. Uninstall old files             │  │
│  │ 3. Install new files               │  │
│  │ 4. Update registry                 │  │
│  │ 5. Preserve app data (important!)  │  │
│  │ 6. Launch new version              │  │
│  └────────────────────────────────────┘  │
└──────────────────┬───────────────────────┘
                   │
                   │ Installation complete
                   ▼
┌─────────────────────────────────────────┐
│     APP STARTS (v2.1.0)                 │
│  User data intact, settings preserved   │
└─────────────────────────────────────────┘
```

## File Structure During Update

### Before Update (v2.0.0 Installed)

```
C:\Users\Username\AppData\Local\Programs\stop-typing\
├── Stop Typing.exe (v2.0.0)
├── resources\
│   ├── app.asar
│   ├── voice-engine.exe
│   ├── ffmpeg\
│   │   └── ffmpeg.exe
│   └── app\
│       └── index.html
└── Uninstall Stop Typing.exe

C:\Users\Username\AppData\Roaming\Stop Typing\
├── voiceflow.db (PRESERVED during update)
├── logs\
│   └── main.log
└── *-updater\
    └── pending\
        └── Stop Typing-Setup-2.1.0.exe (downloaded)
```

### During Update (Transition)

```
NSIS Installer Process:
1. Kill "Stop Typing.exe" process
2. Delete: C:\Users\Username\AppData\Local\Programs\stop-typing\*
3. Extract new files to same location
4. Update registry keys
5. Keep: C:\Users\Username\AppData\Roaming\Stop Typing\* (because deleteAppDataOnUninstall: false)
6. Launch new version
```

### After Update (v2.1.0 Installed)

```
C:\Users\Username\AppData\Local\Programs\stop-typing\
├── Stop Typing.exe (v2.1.0) ← Updated
├── resources\
│   ├── app.asar ← Updated
│   ├── voice-engine.exe ← Updated
│   ├── ffmpeg\
│   │   └── ffmpeg.exe
│   └── app\
│       └── index.html ← Updated
└── Uninstall Stop Typing.exe ← Updated

C:\Users\Username\AppData\Roaming\Stop Typing\
├── voiceflow.db ← PRESERVED (contains user's transcription history)
├── logs\
│   └── main.log ← New logs appended
└── *-updater\
    └── (cleaned up after successful update)
```

## Update Check Timeline

```
Time     Event
─────────────────────────────────────────────────────────────────
00:00    App starts
00:10    First update check (10 second delay)
04:10    Second check (4 hours later)
08:10    Third check (4 hours later)
12:10    Fourth check (4 hours later)
...      (continues every 4 hours while app is running)
```

## Registry Management

### Installation (First Time or Update)

```
HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Uninstall\
└── {generated-guid-from-appId}\
    ├── DisplayName = "Stop Typing"
    ├── DisplayVersion = "2.1.0"
    ├── Publisher = "Yash"
    ├── InstallLocation = "C:\Users\...\stop-typing"
    ├── UninstallString = "C:\Users\...\Uninstall Stop Typing.exe"
    ├── DisplayIcon = "C:\Users\...\Stop Typing.exe"
    └── ... (other standard keys)
```

### Update Process (Registry)

```
Old entry (v2.0.0):
HKCU\...\Uninstall\{GUID}\DisplayVersion = "2.0.0"
                          ↓
                    (Update via NSIS)
                          ↓
New entry (v2.1.0):
HKCU\...\Uninstall\{GUID}\DisplayVersion = "2.1.0"

Note: GUID remains the same (derived from appId)
```

## Network Communication

### Update Check Request

```
GET https://api.github.com/repos/username/Voice-flow/releases/latest
Headers:
  Accept: application/vnd.github.v3+json
  User-Agent: electron-updater/6.3.9

Response:
{
  "tag_name": "v2.1.0",
  "assets": [
    {
      "name": "Stop Typing-Setup-2.1.0.exe",
      "browser_download_url": "https://github.com/..."
    },
    {
      "name": "latest.yml",
      "browser_download_url": "https://github.com/..."
    }
  ]
}
```

### latest.yml File

```yaml
version: 2.1.0
files:
  - url: Stop Typing-Setup-2.1.0.exe
    sha512: abc123def456... (checksum)
    size: 145678901
path: Stop Typing-Setup-2.1.0.exe
sha512: abc123def456...
releaseDate: '2025-01-15T10:30:00.000Z'
```

## Error Handling Flow

```
Update Check
     │
     ├─→ Network Error ──→ Log error, retry in 4 hours
     │
     ├─→ GitHub Rate Limit ──→ Wait until limit reset
     │
     ├─→ Invalid latest.yml ──→ Log error, skip update
     │
Download
     │
     ├─→ Network Error ──→ Resume download from last chunk
     │
     ├─→ Checksum Mismatch ──→ Delete, re-download
     │
     ├─→ Disk Space Error ──→ Show error dialog, cancel
     │
Install
     │
     ├─→ File Locked ──→ Retry after 1 second (up to 3 times)
     │
     ├─→ Permission Error ──→ Request elevation
     │
     ├─→ Installer Corrupted ──→ Show error, delete, re-download
     │
     └─→ Success ──→ Launch new version
```

## Data Preservation Strategy

### What Gets Updated

```
✓ Application binaries (.exe, .dll, .node)
✓ Resources (app.asar, voice-engine.exe, ffmpeg.exe)
✓ Frontend static files (index.html, assets)
✓ Registry entries (version, uninstall info)
✓ Shortcuts (desktop, start menu)
```

### What Gets Preserved

```
✓ User database (voiceflow.db)
✓ Settings (stored in database)
✓ Personal dictionary (stored in database)
✓ Transcription history (stored in database)
✓ Snippets (stored in database)
✓ Logs (for debugging)
✓ Temporary files (until cleanup)
```

### What Gets Deleted

```
✗ Old version binaries
✗ Old version resources
✗ Old installer package (after successful install)
✗ Old NSIS uninstaller
```

## Differential Update Flow (Optional)

When `differentialPackage: true`:

```
Full Update:                     Differential Update:
┌──────────────┐                 ┌──────────────┐
│ v2.0.0       │                 │ v2.0.0       │
└──────┬───────┘                 └──────┬───────┘
       │                                │
       │ Download 145 MB                │ Download 23 MB
       │ (full installer)               │ (delta patch)
       ▼                                ▼
┌──────────────┐                 ┌──────────────┐
│ v2.1.0       │                 │ Apply patch  │
│ installed    │                 │ to v2.0.0    │
└──────────────┘                 └──────┬───────┘
                                        │
                                        ▼
                                 ┌──────────────┐
                                 │ v2.1.0       │
                                 │ installed    │
                                 └──────────────┘

Savings: ~80% smaller download
```

## User Experience Comparison

### Without Auto-Update

```
1. User hears about new version
2. Visit website/GitHub
3. Download installer manually
4. Run installer
5. Wait for uninstall/install
6. Launch app
7. Settings may or may not be preserved

Total time: 5-10 minutes
User friction: HIGH
```

### With Auto-Update

```
1. Notification: "Update available"
2. Click "Download"
3. Continue using app while downloading
4. Notification: "Update ready"
5. Click "Restart"
6. App restarts with new version
7. All settings preserved

Total time: 1-2 minutes (mostly automatic)
User friction: LOW
```

## Security Verification Flow

```
Download Start
     │
     ▼
┌──────────────────────────┐
│ Download from GitHub     │
│ (HTTPS only)             │
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│ Verify SHA-512 Checksum  │
│ (from latest.yml)        │
└──────────┬───────────────┘
           │
          / \
    MATCH/   \MISMATCH
         /     \
        ▼       ▼
  ┌─────────┐ ┌──────────────┐
  │ Accept  │ │ Reject       │
  │ Install │ │ Re-download  │
  └─────────┘ └──────────────┘
```

## Rollback Strategy

If update fails or causes issues:

```
Option 1: Previous version backup
- Keep Stop Typing-Setup-2.0.0.exe
- Manually reinstall if needed
- Database is preserved

Option 2: GitHub releases
- All previous versions available
- Download older installer
- Install over broken version
- Database is preserved

Option 3: Emergency local rollback
- Not built-in to electron-updater
- Requires custom implementation
- Can restore from backup
```

## Performance Metrics

Typical update sizes (estimated):

```
Component                Size
───────────────────────────────────
Electron runtime        ~100 MB
Application code        ~5 MB
Voice-engine.exe        ~30 MB
FFmpeg.exe             ~10 MB
Frontend assets         ~2 MB
───────────────────────────────────
Full installer         ~145 MB
Differential update    ~20-30 MB
```

Update times (on typical connection):

```
Connection    Full Download    Differential    Install
─────────────────────────────────────────────────────────
50 Mbps       ~20 seconds      ~5 seconds      ~10 seconds
10 Mbps       ~2 minutes       ~20 seconds     ~10 seconds
5 Mbps        ~4 minutes       ~40 seconds     ~10 seconds
```
