#!/usr/bin/env node
/**
 * Cross-platform Electron launcher
 * Works on Windows, macOS, and Linux
 */

const { spawn } = require('child_process');
const path = require('path');
const os = require('os');

// Unset ELECTRON_RUN_AS_NODE
delete process.env.ELECTRON_RUN_AS_NODE;
process.env.NODE_ENV = 'development';

const appDir = path.dirname(__dirname);
const platform = os.platform();

let electronPath;
if (platform === 'win32') {
  electronPath = path.join(appDir, 'node_modules', 'electron', 'dist', 'electron.exe');
} else if (platform === 'darwin') {
  electronPath = path.join(appDir, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron');
} else {
  electronPath = path.join(appDir, 'node_modules', '.bin', 'electron');
}

console.log(`[Electron] Platform: ${platform}`);
console.log(`[Electron] Path: ${electronPath}`);
console.log(`[Electron] App Dir: ${appDir}`);

const child = spawn(electronPath, [appDir], {
  stdio: 'inherit',
  cwd: appDir,
  env: {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '',
    NODE_ENV: 'development'
  }
});

child.on('error', (err) => {
  console.error('[Electron] Failed to start:', err);
  process.exit(1);
});

child.on('close', (code) => {
  console.log(`[Electron] Exited with code ${code}`);
  process.exit(code);
});
