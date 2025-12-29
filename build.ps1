# Voice-Flow Build Script (Windows PowerShell)
# This script builds the complete standalone .exe installer

param(
    [switch]$SkipBackend,
    [switch]$SkipFrontend,
    [switch]$SkipElectron,
    [switch]$Clean
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Voice-Flow Build Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$ProjectRoot = $PSScriptRoot

# Clean build directories if requested
if ($Clean) {
    Write-Host "[CLEAN] Removing build artifacts..." -ForegroundColor Yellow
    Remove-Item -Path "$ProjectRoot\backend\dist" -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -Path "$ProjectRoot\backend\build" -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -Path "$ProjectRoot\app\dist" -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -Path "$ProjectRoot\app\release" -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -Path "$ProjectRoot\dist" -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "[CLEAN] Done!" -ForegroundColor Green
    Write-Host ""
}

# ============================================
# STEP 1: Build Python Backend (voice-engine.exe)
# ============================================
if (-not $SkipBackend) {
    Write-Host "[1/3] Building Python Backend (voice-engine.exe)..." -ForegroundColor Cyan

    Push-Location "$ProjectRoot\backend"

    # Check if virtual environment exists
    if (-not (Test-Path ".venv")) {
        Write-Host "  Creating virtual environment..." -ForegroundColor Yellow
        python -m venv .venv
    }

    # Activate virtual environment
    Write-Host "  Activating virtual environment..." -ForegroundColor Yellow
    & ".venv\Scripts\Activate.ps1"

    # Install dependencies
    Write-Host "  Installing dependencies..." -ForegroundColor Yellow
    pip install -r requirements.txt --quiet
    pip install pyinstaller --quiet

    # Build with PyInstaller
    Write-Host "  Running PyInstaller..." -ForegroundColor Yellow
    pyinstaller build_engine.spec --noconfirm

    if (Test-Path "dist\voice-engine.exe") {
        $size = (Get-Item "dist\voice-engine.exe").Length / 1MB
        Write-Host "  SUCCESS: voice-engine.exe created ($([math]::Round($size, 2)) MB)" -ForegroundColor Green
    } else {
        Write-Host "  ERROR: voice-engine.exe not created!" -ForegroundColor Red
        exit 1
    }

    Pop-Location
    Write-Host ""
}

# ============================================
# STEP 2: Build Frontend (React/Vite)
# ============================================
if (-not $SkipFrontend) {
    Write-Host "[2/3] Building Frontend..." -ForegroundColor Cyan

    Push-Location "$ProjectRoot\frontend"

    # Install dependencies
    Write-Host "  Installing npm dependencies..." -ForegroundColor Yellow
    npm install --silent

    # Build frontend
    Write-Host "  Running Vite build..." -ForegroundColor Yellow
    npm run build

    if (Test-Path "..\dist\index.html") {
        Write-Host "  SUCCESS: Frontend built to ../dist/" -ForegroundColor Green
    } else {
        Write-Host "  ERROR: Frontend build failed!" -ForegroundColor Red
        exit 1
    }

    Pop-Location
    Write-Host ""
}

# ============================================
# STEP 3: Build Electron App (.exe installer)
# ============================================
if (-not $SkipElectron) {
    Write-Host "[3/3] Building Electron App..." -ForegroundColor Cyan

    Push-Location "$ProjectRoot\app"

    # Install dependencies
    Write-Host "  Installing npm dependencies..." -ForegroundColor Yellow
    npm install --silent

    # Build TypeScript
    Write-Host "  Compiling TypeScript..." -ForegroundColor Yellow
    npm run build

    # Build with electron-builder
    Write-Host "  Running electron-builder..." -ForegroundColor Yellow
    npm run dist:win

    $installer = Get-ChildItem "release\*.exe" | Select-Object -First 1
    if ($installer) {
        $size = $installer.Length / 1MB
        Write-Host "  SUCCESS: $($installer.Name) created ($([math]::Round($size, 2)) MB)" -ForegroundColor Green
        Write-Host ""
        Write-Host "  Installer location:" -ForegroundColor Cyan
        Write-Host "  $($installer.FullName)" -ForegroundColor White
    } else {
        Write-Host "  ERROR: Installer not created!" -ForegroundColor Red
        exit 1
    }

    Pop-Location
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  BUILD COMPLETE!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Run the installer from: app\release\" -ForegroundColor White
Write-Host "2. Share the .exe file with friends!" -ForegroundColor White
Write-Host ""
