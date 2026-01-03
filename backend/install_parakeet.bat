@echo off
REM ============================================================
REM Voice-Flow Parakeet STT Installation Script
REM Based on: https://www.youtube.com/watch?v=IzYlO7gd5gY
REM ============================================================

echo.
echo ============================================================
echo Voice-Flow Parakeet TDT 0.6B v2 Installation
echo ============================================================
echo.

REM Check if running with admin privileges
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [WARN] Not running as administrator. Some features may not work.
)

REM Check Python version
python --version 2>nul
if %errorLevel% neq 0 (
    echo [ERROR] Python not found! Please install Python 3.10 or 3.11
    pause
    exit /b 1
)

REM Check CUDA availability
echo.
echo [1/6] Checking CUDA availability...
nvidia-smi --query-gpu=name,memory.total --format=csv,noheader 2>nul
if %errorLevel% neq 0 (
    echo [WARN] NVIDIA GPU not detected. Model will run on CPU (slower)
) else (
    echo [OK] NVIDIA GPU detected
)

REM Create virtual environment if not exists
echo.
echo [2/6] Setting up virtual environment...
if not exist "venv" (
    python -m venv venv
    echo [OK] Virtual environment created
) else (
    echo [OK] Virtual environment already exists
)

REM Activate virtual environment
call venv\Scripts\activate.bat

REM Upgrade pip
echo.
echo [3/6] Upgrading pip...
python -m pip install --upgrade pip

REM Install PyTorch with CUDA 12.1 support
echo.
echo [4/6] Installing PyTorch with CUDA 12.1 support...
pip install torch==2.5.1+cu121 torchaudio==2.5.1+cu121 --index-url https://download.pytorch.org/whl/cu121

REM Verify CUDA is available
echo.
echo Verifying CUDA availability in PyTorch...
python -c "import torch; print(f'CUDA available: {torch.cuda.is_available()}'); print(f'Device: {torch.cuda.get_device_name(0) if torch.cuda.is_available() else \"CPU\"}')"

REM Install NeMo and dependencies
echo.
echo [5/6] Installing NeMo toolkit and dependencies...
pip install nemo-toolkit==2.1.0 --no-deps
pip install omegaconf hydra-core sentencepiece einops lightning pytorch-lightning
pip install librosa soundfile datasets pandas matplotlib ipython
pip install pyannote.core pyannote.metrics jiwer nltk inflect peft kaldialign
pip install lhotse webdataset fiddle cloudpickle editdistance

REM Patch NeMo for Windows compatibility (SIGKILL fix)
echo.
echo Patching NeMo for Windows compatibility...
python -c "
import os
nemo_path = os.path.join('venv', 'Lib', 'site-packages', 'nemo', 'utils', 'exp_manager.py')
if os.path.exists(nemo_path):
    with open(nemo_path, 'r') as f:
        content = f.read()
    if 'signal.SIGKILL' in content:
        content = content.replace('signal.SIGKILL', \"getattr(signal, 'SIGKILL', signal.SIGTERM)\")
        with open(nemo_path, 'w') as f:
            f.write(content)
        print('[OK] NeMo patched for Windows')
    else:
        print('[OK] NeMo already patched')
else:
    print('[WARN] NeMo not found at expected path')
"

REM Install remaining requirements
echo.
echo [6/6] Installing remaining requirements...
pip install fastapi uvicorn[standard] sqlalchemy pydantic pydantic-settings
pip install python-dotenv python-multipart aiohttp reportlab pydub
pip install pytest httpx pyinstaller

REM Create cache directories
echo.
echo Creating cache directories...
if not exist ".cache\huggingface" mkdir .cache\huggingface
if not exist ".cache\nemo" mkdir .cache\nemo
if not exist ".cache\tmp" mkdir .cache\tmp

REM Download Parakeet model
echo.
echo ============================================================
echo Downloading Parakeet TDT 0.6B v2 model (~600MB)...
echo This may take a few minutes depending on your connection.
echo ============================================================
echo.

set HF_HOME=%CD%\.cache\huggingface
set NEMO_CACHE_DIR=%CD%\.cache\nemo
set TMPDIR=%CD%\.cache\tmp
set TEMP=%CD%\.cache\tmp
set TMP=%CD%\.cache\tmp

python -c "
import warnings
warnings.filterwarnings('ignore')
import os
os.environ['HF_HOME'] = os.path.join(os.getcwd(), '.cache', 'huggingface')
os.environ['NEMO_CACHE_DIR'] = os.path.join(os.getcwd(), '.cache', 'nemo')
import nemo.collections.asr as nemo_asr
print('Loading Parakeet model...')
model = nemo_asr.models.ASRModel.from_pretrained('nvidia/parakeet-tdt-0.6b-v2')
print('Model downloaded and loaded successfully!')
print(f'Model type: {type(model).__name__}')
"

if %errorLevel% neq 0 (
    echo [ERROR] Failed to download/load model
    pause
    exit /b 1
)

echo.
echo ============================================================
echo Installation Complete!
echo ============================================================
echo.
echo Parakeet TDT 0.6B v2 has been installed successfully.
echo.
echo To start the server, run:
echo   venv\Scripts\activate
echo   python main.py
echo.
echo Or simply run: start_server.bat
echo.
pause
