# COMPLETE MASTER BLUEPRINT - VOICE DICTATION APP
## Step-by-Step • Phase-by-Phase • Everything Consolidated

**Your Situation:**
- Building for a company (you have full resources)
- Using: VS Code + Claude + Antigravity + Your Coding Knowledge
- Goal: Cross-platform app (Windows, macOS, Linux) that works in ANY app
- Timeline: 3-4 weeks to production-ready

---

## TABLE OF CONTENTS

1. **YOUR SETUP** - Tools & why this combo works
2. **ARCHITECTURE OVERVIEW** - High-level design
3. **PHASE 1: FOUNDATION (Week 1, Days 1-2)** - Project setup
4. **PHASE 2: CORE BACKEND (Week 1, Days 3-4)** - Voice processing
5. **PHASE 3: DESKTOP APP (Week 1, Days 5)** - Electron + hotkey
6. **PHASE 4: TEXT INJECTION (Week 2, Days 1-2)** - Cross-platform injection
7. **PHASE 5: FRONTEND UI (Week 2, Days 3-4)** - React components
8. **PHASE 6: INTEGRATION (Week 2, Days 5)** - Wire everything
9. **PHASE 7: TESTING (Week 3, Days 1-2)** - All platforms
10. **PHASE 8: PRODUCTION (Week 3, Days 3-5)** - Deploy & ship

---

## YOUR SETUP (READ THIS FIRST)

### Tools You're Using

```
┌─────────────────────────────────────────────────────┐
│ TOOL 1: VS CODE + CLAUDE EXTENSION (Left Panel)    │
├─────────────────────────────────────────────────────┤
│ What: AI chat integrated into VS Code              │
│ Use: Ask architecture questions, get full code     │
│ When: Before generating, for strategy/advice       │
│ How:                                               │
│   1. Open VS Code                                  │
│   2. Extensions → Search "Claude"                  │
│   3. Install Claude for VS Code                    │
│   4. Click Claude icon in sidebar                  │
│   5. Chat panel opens on left                      │
│   6. Paste your prompt                             │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ TOOL 2: ANTIGRAVITY (Browser - Primary Generator)  │
├─────────────────────────────────────────────────────┤
│ What: Browser-based code generation IDE            │
│ Use: Generate entire components/functions fast     │
│ When: Need actual code generated                   │
│ How:                                               │
│   1. Browser → antigravity.dev                     │
│   2. Create new project                            │
│   3. Write prompt in AI box                        │
│   4. Get full code + preview                       │
│   5. Copy to clipboard                             │
│   6. Paste into VS Code                            │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ TOOL 3: YOUR CODING KNOWLEDGE + VIBE CODING        │
├─────────────────────────────────────────────────────┤
│ What: You review, tweak, integrate, test          │
│ Use: Make architectural decisions                  │
│ When: Always reviewing what Claude/Antigravity give│
│ How: Read code → test → iterate                    │
└─────────────────────────────────────────────────────┘
```

### How They Work Together

```
WORKFLOW CYCLE:
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│  1. THINK                                                   │
│     └─ What feature do I need?                             │
│                                                              │
│  2. ASK CLAUDE (VS Code left panel)                         │
│     └─ Architecture? Best practice? Strategy?               │
│                                                              │
│  3. GENERATE IN ANTIGRAVITY                                 │
│     └─ Write prompt → Get code → Preview                   │
│                                                              │
│  4. COPY TO VS CODE                                         │
│     └─ Paste into correct file                             │
│                                                              │
│  5. TEST LOCALLY                                            │
│     └─ Does it work? Need tweaks?                          │
│                                                              │
│  6. ITERATE IF NEEDED                                       │
│     └─ Ask Antigravity: "Modify to include..."             │
│                                                              │
│  REPEAT ↻                                                    │
│                                                              │
└──────────────────────────────────────────────────────────────┘

EXAMPLE:
  Monday 9 AM:  Think → "I need Electron main process"
  Monday 9:05:  Claude → "Here's the architecture"
  Monday 9:10:  Antigravity → "Here's the code"
  Monday 9:15:  Copy → Paste into src/main/index.ts
  Monday 9:20:  Test → npm run dev → Works!
  
  TIME SPENT: 20 minutes (vs 3 hours manually)
```

---

## ARCHITECTURE OVERVIEW

### What You're Building

```
USER'S COMPUTER (Windows, macOS, or Linux)

┌────────────────────────────────────────────────────┐
│  ELECTRON DESKTOP APP                              │
│  ┌──────────────────────────────────────────────┐ │
│  │ Main Process (Electron)                      │ │
│  │ • Global hotkey listener (Ctrl+Shift+V)      │ │
│  │ • System accessibility APIs                  │ │
│  │ • Window management                          │ │
│  │ • Text injection to any app                  │ │
│  │ • IPC communication                          │ │
│  └──────────────────────────────────────────────┘ │
│                      ↕                             │
│  ┌──────────────────────────────────────────────┐ │
│  │ Renderer (React UI)                          │ │
│  │ • Record button                              │ │
│  │ • Settings panel                             │ │
│  │ • Dashboard                                  │ │
│  │ • Waveform visualization                     │ │
│  └──────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────┘
                      ↓
                (User speaks)
                      ↓
┌────────────────────────────────────────────────────┐
│  BACKEND SERVER (Your company runs this)           │
│  ┌──────────────────────────────────────────────┐ │
│  │ Audio Processing Pipeline                   │ │
│  │ • WebSocket: Receive audio chunks           │ │
│  │ • Whisper: Convert audio → text             │ │
│  │ • Claude API: Polish text (fix grammar)     │ │
│  │ • Return polished text                      │ │
│  └──────────────────────────────────────────────┘ │
│                      ↕                             │
│  ┌──────────────────────────────────────────────┐ │
│  │ PostgreSQL Database                         │ │
│  │ • User settings & preferences               │ │
│  │ • Transcription history                     │ │
│  │ • Personal dictionary                       │ │
│  │ • Usage statistics                          │ │
│  └──────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────┘
                      ↓
         (Polished text goes back to app)
                      ↓
            (Text injects into any app)
                      ↓
           (Slack, VS Code, Gmail, Word, etc.)
```

### Tech Stack

```
FRONTEND (On User's Computer):
├─ Electron (desktop framework)
├─ React (UI components)
├─ TypeScript (type safety)
└─ Tailwind CSS (styling)

AUDIO CAPTURE:
├─ Web Audio API (recording)
├─ WebSocket (streaming to backend)
└─ Local Whisper (speech-to-text)

TEXT INJECTION (Platform-specific):
├─ macOS: AppleScript + Accessibility APIs
├─ Windows: PowerShell + UI Automation
└─ Linux: xdotool

BACKEND (Your Server):
├─ Node.js + Express (API + WebSocket)
├─ Python + FastAPI (AI processing)
├─ OpenAI Whisper (speech recognition)
├─ Claude API (text polishing)
└─ PostgreSQL (database)

INFRASTRUCTURE:
├─ Docker (containerization)
├─ Kubernetes or Docker Compose (deployment)
└─ Sentry (error tracking)
```

---

# 🚀 EXECUTION PLAN - PHASE BY PHASE

---

## PHASE 1: FOUNDATION (Week 1, Monday)

**Duration: 1-2 hours**
**Outcome: Project structure ready, dependencies installed**

### Step 1: Open VS Code + Claude

```
1. Open VS Code
2. Extensions (Ctrl+Shift+X)
3. Search "Claude"
4. Install "Claude for VS Code"
5. Enter your Anthropic API key (get from console.anthropic.com)
6. Click Claude icon in sidebar
7. Claude panel opens on left
```

### Step 2: Ask Claude for Architecture

**In Claude chat panel, paste this:**

```
I'm building an Electron + React desktop app for voice dictation.
Works on Windows, macOS, Linux. Works in ANY app.

Generate complete project structure:
1. Folder organization
2. package.json with ALL dependencies
3. tsconfig.json
4. .gitignore
5. Docker setup
6. Backend structure (Node + Python)
7. Database schema (PostgreSQL)
8. Setup instructions

Make it production-ready.
```

**Claude will give you:**
- File structure as text
- package.json content
- Setup commands

### Step 3: Create Project Structure

**In terminal, run:**

```bash
# Create main folder
mkdir voice-dictation-app
cd voice-dictation-app

# Copy Claude's folder structure
# (Claude will show you the exact structure)
# Create all folders manually or copy from Claude

# Create package.json from Claude's version
# (Copy Claude's package.json content into file)

# Install dependencies
npm install

# This installs everything needed for Electron + React
```

### Step 4: Verify Setup

```bash
# Check if installed correctly
npm list electron react typescript

# You should see versions printed
# If errors, run: npm install --force
```

**By end of Phase 1:**
✅ Project folder created
✅ Dependencies installed
✅ Ready for actual coding

---

## PHASE 2: CORE BACKEND (Week 1, Tuesday)

**Duration: 1-2 hours**
**Outcome: Backend API running, can transcribe audio**

### Step 1: Backend Architecture (Claude)

**In Claude panel:**

```
I need a FastAPI backend for voice processing.

Main flow:
1. User speaks (on their computer)
2. Audio sent to backend via WebSocket
3. Whisper: Convert audio to text
4. Claude API: Fix grammar/punctuation
5. Send polished text back

Structure:
- WebSocket endpoint /transcribe
- Whisper integration (load model once)
- Claude API integration
- Error handling
- Logging

Tech:
- FastAPI (Python)
- Async/await
- Pydantic models
- Environment variables for API keys

Show me:
- File structure
- requirements.txt
- Complete main.py code
- How to run it
```

**Claude explains and gives code.**

### Step 2: Generate Backend (Antigravity)

**Open Antigravity (browser → antigravity.dev):**

1. Create new project: "voice-backend"
2. In AI prompt box, paste:

```
Generate production FastAPI backend for voice processing.

File: backend/main.py

Requirements:
- Python 3.10+
- Import: FastAPI, WebSocket, whisper, anthropic
- Load Whisper model on startup (cache it)
- WebSocket endpoint: /transcribe
- Receives audio chunks (webm/wav format)
- Transcribe with Whisper
- Polish with Claude Haiku API
- Return JSON with: transcription, polished_text
- Error handling (timeout 30 sec max)
- CORS enabled
- Logging

Pseudo-code flow:
1. ws = WebSocket
2. Receive audio_chunks
3. Save to temp file
4. result = whisper.transcribe(audio_file)
5. message = claude.messages.create("fix this: " + result)
6. ws.send({transcription, polished})

Full working code, imports included, ready to run.
```

**Antigravity generates:** 250+ lines of complete backend

### Step 3: Copy to VS Code

1. In Antigravity: Click "Copy"
2. In VS Code: Create file `backend/main.py`
3. Paste the code
4. Save

### Step 4: Setup Backend

**In terminal:**

```bash
# Go to backend folder
cd backend

# Create virtual environment (isolates dependencies)
python -m venv venv

# Activate it
# On macOS/Linux:
source venv/bin/activate
# On Windows:
venv\Scripts\activate

# Create requirements.txt
pip install fastapi websockets python-multipart whisper anthropic uvicorn

# Or create requirements.txt file with:
# fastapi==0.104.1
# uvicorn==0.24.0
# websockets==12.0
# python-multipart==0.0.6
# openai-whisper==20240314
# anthropic==0.7.6

pip install -r requirements.txt
```

### Step 5: Add API Keys

**Create `backend/.env` file:**

```
ANTHROPIC_API_KEY=your_key_here
```

Get from: console.anthropic.com

### Step 6: Test Backend

**In terminal (in backend folder with venv activated):**

```bash
uvicorn main:app --reload
```

**Expected output:**
```
INFO:     Uvicorn running on http://127.0.0.1:8000
```

✅ Backend running!

**Test it:**
- Browser → http://localhost:8000/docs
- You'll see interactive API documentation

**By end of Phase 2:**
✅ Backend running on localhost:8000
✅ Can receive audio WebSocket
✅ Transcribes with Whisper
✅ Polishes with Claude

---

## PHASE 3: DESKTOP APP SETUP (Week 1, Wednesday)

**Duration: 2-3 hours**
**Outcome: Electron app running, hotkey working**

### Step 1: Architecture (Claude)

**In Claude panel:**

```
I'm building an Electron desktop app.

Main features:
1. Global hotkey (Ctrl+Shift+V) anywhere on OS
2. Window for recording/settings
3. System tray icon
4. Auto-updates
5. IPC handlers to communicate with React renderer

Architecture:
- Main process (Electron core)
- Renderer process (React UI)
- Preload script (secure IPC)

Show me:
- File structure
- Main process code (src/main/index.ts)
- Preload script (src/preload/index.ts)
- Type definitions
- How to run

Platform support: Windows, macOS, Linux
```

Claude explains architecture.

### Step 2: Generate Main Process (Antigravity)

**In Antigravity:**

```
Generate Electron main process for cross-platform voice app.

File: src/main/index.ts

Requirements:
- Create BrowserWindow (1200x800)
- Register global hotkey:
  - Windows: Ctrl+Shift+V
  - macOS: Cmd+Shift+V
  - Linux: Ctrl+Shift+V
- System tray icon
- IPC handlers for:
  - start-recording
  - stop-recording
  - send-audio
  - inject-text
  - save-settings
- Auto-update setup
- Preload script configuration
- TypeScript with proper types
- Production error handling
- Platform detection (process.platform)

Full working code, ready to paste.
```

**Antigravity generates:** ~250 lines

### Step 3: Generate Preload Script (Antigravity)

```
Generate Electron preload script for secure IPC.

File: src/preload/index.ts

Requirements:
- contextBridge to expose IPC safely
- Type-safe API:
  - window.electronAPI.startRecording()
  - window.electronAPI.stopRecording()
  - window.electronAPI.sendAudio(audioBlob)
  - window.electronAPI.injectText(text)
  - window.electronAPI.saveSettings(settings)
- No direct Node.js access in renderer
- Error handling

Full TypeScript with proper exports.
```

### Step 4: Copy & Test

1. Create `src/main/index.ts` → Paste Antigravity code
2. Create `src/preload/index.ts` → Paste Antigravity code
3. Save both files

**Test:**

```bash
# In project root
npm run dev

# Expected: Electron window opens
# Try hotkey: Ctrl+Shift+V
# Window should minimize/show
```

**By end of Phase 3:**
✅ Electron app running
✅ Global hotkey works
✅ Window responds
✅ All 3 platforms work

---

## PHASE 4: TEXT INJECTION (Week 2, Monday-Tuesday)

**Duration: 4-6 hours (1-2 hours per platform)**
**Outcome: Text injects into any app on any platform**

This is the most complex phase. Break it into 3 parts (one per platform).

### Step 1: Architecture (Claude)

**In Claude panel:**

```
I need cross-platform text injection.

User says something → Backend transcribes → Polishes → 
Text needs to inject into WHATEVER APP IS FOCUSED.

Challenges:
- Each OS has different text field APIs
- Must find focused text field
- Must send text + place cursor at end

Solutions:
- macOS: AppleScript (osascript command)
- Windows: PowerShell + SetText command
- Linux: xdotool (already on most Linux)

Questions:
1. Should I create one unified file or separate files?
2. How to handle errors gracefully?
3. What's the timeout strategy?
4. Fallback if injection fails?

Show me architecture + code examples for each platform.
```

Claude explains strategy.

### Step 2: Generate Text Injection Module (Antigravity)

```
Generate cross-platform text injection module in TypeScript.

File: src/main/accessibility/index.ts

Requirements:
- Main function: injectText(text: string): Promise<TextInjectionResult>
- Platform detection (process.platform)
- Three implementations:
  1. macOS: injectTextMacOS()
  2. Windows: injectTextWindows()
  3. Linux: injectTextLinux()

macOS Implementation:
- Use osascript to run AppleScript
- Algorithm:
  1. Copy text to clipboard (pbcopy)
  2. Send keystroke: Cmd+V
  3. Return success

Windows Implementation:
- Use execSync to run PowerShell
- Algorithm:
  1. Copy text to clipboard
  2. Send keystroke: Ctrl+V
  3. Return success

Linux Implementation:
- Use xdotool
- Algorithm:
  1. Use xclip to copy to clipboard
  2. Send keystroke: Ctrl+V
  3. Return success

Fallback:
- If any platform fails, copy to clipboard
- Log error with reason

Type:
```typescript
interface TextInjectionResult {
  success: boolean;
  method: 'direct' | 'clipboard-fallback';
  error?: string;
  platform: string;
}
```

Error handling:
- Timeout: 3 seconds max
- Log every attempt (for debugging)
- Never crash the app

Full production-grade code, all platforms, ready to paste.
```

**Antigravity generates:** ~400 lines

### Step 3: Copy & Setup

1. Create folder: `src/main/accessibility/`
2. Create file: `src/main/accessibility/index.ts`
3. Paste Antigravity code
4. Save

### Step 4: Test Each Platform

**Test on Windows:**
```
1. Open Notepad
2. Press Ctrl+Shift+V (your hotkey)
3. Say something: "hello world"
4. Check Notepad: "hello world" appears
```

**Test on macOS:**
```
1. Open TextEdit
2. Press Cmd+Shift+V
3. Say something: "hello world"
4. Check TextEdit: "hello world" appears
```

**Test on Linux:**
```
1. Open text editor (gedit)
2. Press Ctrl+Shift+V
3. Say something: "hello world"
4. Check editor: "hello world" appears
```

**Test in real apps:**
- VS Code
- Slack
- Gmail
- Discord
- Word
- Google Docs

**By end of Phase 4:**
✅ Text injection works on Windows
✅ Text injection works on macOS
✅ Text injection works on Linux
✅ Works in ANY app

---

## PHASE 5: FRONTEND UI (Week 2, Wednesday-Thursday)

**Duration: 2-3 hours**
**Outcome: React UI components done**

### Step 1: Generate Recorder Component (Antigravity)

```
Generate React Recorder component for voice recording.

File: src/renderer/components/Recorder.tsx

Requirements:
- TypeScript + React hooks
- Features:
  1. Start/stop button
  2. Real-time waveform visualization
  3. Timer (00:15 format)
  4. Status indicator (Ready/Recording/Processing)
  5. WebSocket connection to backend
  6. Receive transcription results
  7. Show error messages

UI Requirements:
- Tailwind CSS styling
- Responsive design
- Large buttons (easy to click)
- Dark/light mode support
- Beautiful waveform animation

Integration:
- Connects to: FastAPI backend (localhost:8000)
- Sends: Audio chunks via WebSocket
- Receives: {transcription, polished_text}
- Displays: Results with copy button

Error Handling:
- Microphone permission denied
- WebSocket connection failed
- Audio recording failed
- Backend timeout (30 sec)

Full working component with TypeScript types.
```

**Antigravity generates:** ~250 lines

### Step 2: Generate Settings Component (Antigravity)

```
Generate React Settings component.

File: src/renderer/components/Settings.tsx

Requirements:
- TypeScript + React hooks
- Features:
  1. Personal dictionary editor
     - Input: mishearing → correction
     - Table showing all entries
     - Add/delete buttons
  2. Tone selector
     - Radio buttons: Formal / Casual / Technical
  3. Voice shortcuts
     - Say: "brb" → Expands to: "be right back"
     - Table of shortcuts
     - Add/delete
  4. Excluded apps
     - Checkboxes for: Slack, Discord, Terminal, etc.
     - User can check which apps to disable voice in
  5. Save/Reset buttons

UI:
- Tailwind CSS
- Clean, organized layout
- Form validation
- Success/error messages
- Modal for adding new entries

Storage:
- Save to backend API (POST /settings)
- Load on mount (GET /settings)
- Update local state

Full working component with types.
```

**Antigravity generates:** ~300 lines

### Step 3: Generate Dashboard Component (Antigravity)

```
Generate React Dashboard component.

File: src/renderer/components/Dashboard.tsx

Requirements:
- TypeScript + React hooks
- Displays user statistics:
  1. Transcriptions today
  2. Words typed today
  3. Time saved estimate
  4. Recent transcriptions list
  5. Export option

UI:
- Tailwind CSS
- Card layout
- Charts (optional, using recharts)
- Statistics displayed nicely
- Copy buttons on transcriptions

Data source:
- Backend API: GET /stats
- Backend API: GET /transcriptions

Full working component.
```

**Antigravity generates:** ~250 lines

### Step 4: Copy All Components

1. Create folder: `src/renderer/components/`
2. Create 3 files:
   - `Recorder.tsx` → Paste Antigravity code
   - `Settings.tsx` → Paste Antigravity code
   - `Dashboard.tsx` → Paste Antigravity code
3. Save all

### Step 5: Create Main App Component (Antigravity)

```
Generate main App component that uses the 3 components.

File: src/renderer/App.tsx

Requirements:
- Import: Recorder, Settings, Dashboard
- Tabs to switch between them:
  - Tab 1: Recorder (default)
  - Tab 2: Settings
  - Tab 3: Dashboard
- State management for:
  - Current tab
  - Recording status
  - Settings
- TypeScript + React hooks

Full working App component.
```

**By end of Phase 5:**
✅ Recorder component done
✅ Settings component done
✅ Dashboard component done
✅ All wired to main App
✅ UI looks professional

---

## PHASE 6: INTEGRATION (Week 2, Friday)

**Duration: 2-3 hours**
**Outcome: Everything connected end-to-end**

### Step 1: Generate IPC Handlers (Antigravity)

```
Generate Electron IPC handlers to connect everything.

File: src/main/ipc.ts

Requirements:
- Handlers for:
  1. 'start-recording': Tell renderer to start
  2. 'send-audio': Receive audio from renderer
  3. 'inject-text': Inject text into focused app
  4. 'save-settings': Save user settings
  5. 'get-stats': Get user statistics

TypeScript with proper type definitions:
```typescript
interface RecordingRequest {
  userId: string;
}

interface AudioData {
  audioChunks: Uint8Array[];
}

interface TextInjectionRequest {
  text: string;
}
```

Flow:
1. Renderer asks to inject text
2. Main process calls injectText()
3. Returns success/failure
4. Renderer updates UI

Full code with error handling.
```

**Antigravity generates:** ~200 lines

### Step 2: Wire Renderer to Main (Antigravity)

```
Generate useElectronAPI hook for React components.

File: src/renderer/hooks/useElectronAPI.ts

Requirements:
- Hook that wraps window.electronAPI
- Provides type-safe functions:
  - startRecording()
  - stopRecording()
  - sendAudio(audioBlob)
  - injectText(text)
  - saveSettings(settings)
  - getStats()
- Error handling
- Loading states

Usage in component:
```typescript
const { injectText, loading } = useElectronAPI();
const handleInject = async (text) => {
  const result = await injectText(text);
  if (result.success) console.log("Done!");
};
```

Full hook code with TypeScript types.
```

**Antigravity generates:** ~150 lines

### Step 3: Connect to Backend

**In Recorder.tsx, update WebSocket connection:**

```typescript
// Inside Recorder component
const ws = new WebSocket('ws://localhost:8000/transcribe');

ws.onmessage = (event) => {
  const { transcription, polished_text } = JSON.parse(event.data);
  
  // Now inject into focused app
  const { injectText } = useElectronAPI();
  await injectText(polished_text);
};
```

### Step 4: Test End-to-End

**Full flow test:**

```
1. Start backend: python main.py (in backend folder)
2. Start app: npm run dev (in root folder)
3. Electron window opens
4. Click "Start Recording" button
5. Speak: "hello world"
6. Hear processing sounds
7. Text appears in Recorder component
8. Click "Inject" button
9. Switch to Notepad
10. Text appears in Notepad automatically ✓
```

**If fails:**
- Check console for errors
- Ask Claude: "Why is WebSocket connection failing?"
- Fix and retry

**By end of Phase 6:**
✅ Hotkey → Recording works
✅ Recording → Sends to backend
✅ Backend → Returns polished text
✅ Text → Injects into app
✅ Full end-to-end flow complete

---

## PHASE 7: TESTING (Week 3, Monday-Tuesday)

**Duration: 8 hours (4 hours per day)**
**Outcome: All bugs fixed, all platforms stable**

### Step 1: Test on All Platforms

**Windows VM Test:**
```
Test checklist:
□ App launches
□ Hotkey (Ctrl+Shift+V) works
□ Recording starts/stops
□ Audio sends to backend
□ Transcription works
□ Text appears in: Notepad, VS Code, Slack, Discord, Word
□ Settings save/load correctly
□ Personal dictionary works
□ Tone selector works
□ Dashboard shows stats
□ No crashes or errors
```

**macOS Test:**
```
Same checklist as Windows
□ Hotkey (Cmd+Shift+V) works specifically
□ Text injection works with macOS apps
□ Performance is good
□ No permissions errors
```

**Linux Test:**
```
Same checklist
□ Hotkey works
□ xdotool works
□ Dependencies available
```

### Step 2: Performance Testing

**Measure latency:**
```bash
# Add timing in Recorder component
const startTime = Date.now();
// ... record audio
// ... send to backend
// ... receive response
const latency = Date.now() - startTime;
console.log(`Total latency: ${latency}ms`);

# Goal: < 2000ms (2 seconds)
# Acceptable: 1000-1500ms
```

**Test on slow network:**
- If it works on 3G, it'll work anywhere

### Step 3: Bug Fixes

**When you find bugs:**

1. **If it's code issue:**
   - Ask Claude: "Text injection fails on Windows with error: X"
   - Claude: "Here's the fix..."
   - Implement fix

2. **If it's Antigravity-generated code:**
   - Ask Antigravity: "Modify [component] to handle [edge case]"
   - Regenerate with fix
   - Test again

3. **Edge cases to test:**
   - Very long text (500+ words)
   - Special characters (emoji, quotes, etc.)
   - Rapid-fire requests
   - App in background vs foreground
   - Multiple text fields on screen

**By end of Phase 7:**
✅ All platforms stable
✅ Latency < 2 seconds
✅ No crashes
✅ All edge cases handled
✅ Text injection success rate > 95%

---

## PHASE 8: PRODUCTION (Week 3, Wednesday-Friday)

**Duration: 6-8 hours**
**Outcome: Ready to ship to company**

### Step 1: Docker Setup (Antigravity)

```
Generate Docker setup for backend.

Files:
1. Dockerfile
2. docker-compose.yml

Requirements:
- Python 3.10 base image
- Install dependencies (requirements.txt)
- Expose port 8000
- Run FastAPI with uvicorn
- Health check endpoint
- Environment variables support

Production-ready with best practices.
```

**Files to create:**
- `backend/Dockerfile` ← Paste Antigravity code
- `docker-compose.yml` ← Paste Antigravity code

**Test Docker:**
```bash
docker-compose up

# Should see:
# Backend running on port 8000
```

### Step 2: Create Installers (Antigravity)

```
Generate Electron builder configuration.

File: electron-builder.json

Requirements:
- Build for:
  1. Windows (NSIS installer + portable)
  2. macOS (DMG + signed)
  3. Linux (AppImage + deb)
- Auto-updates support
- Code signing setup (if needed)
- Publishing to GitHub releases
- Compress efficiently

Full configuration file.
```

**Create:** `electron-builder.json` ← Paste

**Build installers:**
```bash
npm run make

# Creates:
# - dist/voice-app-1.0.0.exe (Windows)
# - dist/voice-app-1.0.0.dmg (macOS)
# - dist/voice-app-1.0.0.AppImage (Linux)
```

### Step 3: Documentation (Claude)

**Ask Claude to write:**

```
Write comprehensive documentation for:

1. Architecture Overview
   - Diagram of components
   - Data flow
   - Technology stack

2. Setup Guide
   - How to install desktop app
   - How to setup backend
   - Environment variables needed
   - API keys required

3. User Guide
   - How to use the app
   - Voice commands
   - Settings explanation
   - Troubleshooting

4. Admin Guide
   - How to deploy backend
   - Docker commands
   - Database setup
   - Monitoring
   - Scaling

5. Developer Guide
   - Project structure
   - How to add new features
   - Testing procedures
   - Building/deploying

Format as Markdown.
```

**Create files:**
- `README.md` (User guide)
- `ARCHITECTURE.md` (Architecture docs)
- `SETUP.md` (Setup instructions)
- `DEPLOYMENT.md` (Production deployment)
- `DEVELOPMENT.md` (Dev guide)

### Step 4: Security Review (Claude)

```
Review my app for security issues:

1. Is authentication needed? (users per company)
2. Are API keys secure? (environment variables)
3. Is data encrypted in transit? (HTTPS/WSS)
4. Are secrets protected? (no hardcoding)
5. Permission handling? (microphone, file system)

Give me:
- Security checklist
- Fixes needed
- Best practices
```

### Step 5: Final Deployment

**Checklist before shipping:**

```
□ All 3 platforms tested thoroughly
□ No crashes in 1 hour of heavy use
□ Latency consistently < 2 seconds
□ Text injection success rate > 95%
□ Backend deployed and running
□ Database initialized
□ Monitoring setup (Sentry)
□ Documentation complete
□ Installers created
□ All API keys configured
□ Error logging working
□ Performance acceptable
□ Security reviewed
□ Team trained (if needed)
```

**Company Handoff:**
1. Give them installers (for Windows, macOS, Linux)
2. Give them backend deployment instructions
3. Give them user documentation
4. Train team on how to use
5. Setup support channel

**By end of Phase 8:**
✅ Production-ready app
✅ All platforms have installers
✅ Backend deployed
✅ Documentation complete
✅ Ready for company rollout

---

## COMPLETE TIMELINE SUMMARY

```
MONDAY (Foundation)
├─ 9:00-10:00   PHASE 1: Project setup + dependencies (1 hour)
├─ 10:00-12:00  PHASE 2: Backend setup + testing (2 hours)
└─ 12:00-3:00   PHASE 3: Electron app + hotkey (3 hours)
    TIME: 6 hours
    RESULT: App launching, backend running ✓

TUESDAY (Text Injection)
├─ 9:00-11:00   PHASE 4a: Windows text injection (2 hours)
├─ 11:00-1:00   PHASE 4b: macOS text injection (2 hours)
├─ 1:00-3:00    PHASE 4c: Linux text injection (2 hours)
└─ 3:00-5:00    Test all 3 platforms
    TIME: 8 hours
    RESULT: Text injection works on all platforms ✓

WEDNESDAY (Frontend)
├─ 9:00-11:00   PHASE 5: Generate 3 React components (2 hours)
├─ 11:00-1:00   Copy & setup components (2 hours)
├─ 1:00-2:00    Test components locally (1 hour)
└─ 2:00-5:00    PHASE 6: Integration wiring (3 hours)
    TIME: 8 hours
    RESULT: Full end-to-end flow works ✓

THURSDAY (Testing & Polish)
├─ 9:00-1:00    PHASE 7: Cross-platform testing (4 hours)
├─ 1:00-5:00    Bug fixes & optimization (4 hours)
    TIME: 8 hours
    RESULT: All bugs fixed, all platforms stable ✓

FRIDAY (Production)
├─ 9:00-10:00   Docker setup (1 hour)
├─ 10:00-11:00  Create installers (1 hour)
├─ 11:00-1:00   Documentation (2 hours)
├─ 1:00-2:00    Security review (1 hour)
└─ 2:00-5:00    Final testing + handoff (3 hours)
    TIME: 8 hours
    RESULT: Production-ready, ready to ship ✓

TOTAL TIME: 38 hours over 5 days
RESULT: Production-grade voice dictation app for Windows, macOS, Linux
```

---

## CHECKLISTS (Print These)

### Before You Start
- [ ] VS Code installed
- [ ] Claude extension installed (API key ready)
- [ ] Antigravity account created
- [ ] Node.js v18+ installed
- [ ] Python 3.10+ installed
- [ ] PostgreSQL ready (local or cloud)
- [ ] Git initialized for version control

### End of Each Day
**Monday:**
- [ ] Project structure created
- [ ] Dependencies installed
- [ ] Backend running on localhost:8000
- [ ] Electron app launching
- [ ] Hotkey working

**Tuesday:**
- [ ] Text injection works on Windows
- [ ] Text injection works on macOS
- [ ] Text injection works on Linux
- [ ] Tested in 5+ real apps
- [ ] No crashes

**Wednesday:**
- [ ] Recorder component done
- [ ] Settings component done
- [ ] Dashboard component done
- [ ] End-to-end flow working
- [ ] Hotkey → Record → Inject

**Thursday:**
- [ ] All platforms tested
- [ ] All bugs fixed
- [ ] Performance acceptable
- [ ] 95%+ success rate on injection

**Friday:**
- [ ] Docker working
- [ ] Installers created
- [ ] Documentation complete
- [ ] Ready for company handoff

---

## QUICK REFERENCE: The Workflow Loop

**Repeat this cycle for every component/feature:**

```
1. THINK
   └─ What do I need to build?

2. ASK CLAUDE (VS Code)
   └─ "Is this the right approach? Show me architecture"

3. GENERATE (Antigravity)
   └─ Write prompt → Get full code

4. COPY-PASTE (VS Code)
   └─ Paste into correct file

5. TEST
   └─ Does it work?

6. ITERATE
   └─ Need tweaks? Ask Antigravity to refine

REPEAT for next component
```

**Time per feature: 30-60 minutes**
(vs 2-3 hours manually)

---

## EMERGENCY HELP

**If something breaks:**

1. **Error in console?**
   → Ask Claude: "I'm getting error: [ERROR]. What's wrong?"
   → Claude explains + gives fix

2. **Generated code doesn't work?**
   → Ask Antigravity: "Modify [component] to handle [issue]"
   → Regenerate + copy-paste

3. **Can't figure out next step?**
   → Refer back to this document (Phase X)
   → Copy exact prompt from document
   → Follow step-by-step

4. **Need architecture advice?**
   → Always ask Claude (not Antigravity)
   → Claude is for "why" and "how"
   → Antigravity is for "generate code"

---

## FINAL WORDS

**You have:**
- ✅ Complete step-by-step blueprint
- ✅ All prompts ready to copy-paste
- ✅ Clear timeline (5 days, 38 hours)
- ✅ Tools (Claude + Antigravity + Your knowledge)
- ✅ Phase-by-phase checklist

**You can build this. Start Monday morning.**

By Friday evening, you'll deliver a production-ready voice dictation app that works on Windows, macOS, and Linux.

**Start now. 🚀**

---

## CONTACT POINTS IN THIS GUIDE

**Stuck at Phase 1?** → Jump to "PHASE 1: FOUNDATION"
**Stuck at Text Injection?** → Jump to "PHASE 4: TEXT INJECTION"
**Timeline unclear?** → Jump to "COMPLETE TIMELINE SUMMARY"
**Need a prompt?** → Search for "Generate" in this document

**You've got everything you need. Execute. Ship. 🚀**
