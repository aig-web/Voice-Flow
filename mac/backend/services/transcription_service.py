"""
Transcription Service - macOS Version
Handles ASR model loading, streaming transcription, and audio processing
Supports MPS (Apple Silicon) and CPU - NO CUDA
"""
import os
import sys
import gc
import io
import time
import tempfile
import subprocess
import warnings
import logging
import numpy as np
import torch
import soundfile as sf

from .dictionary_service import dictionary_service

# Configure logger for this module
logger = logging.getLogger(__name__)


# ============== CACHE DIRECTORIES ==============
def setup_cache_dirs():
    """Set up cache directories for model and temp files"""
    cache_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".cache")
    os.environ['HF_HOME'] = os.path.join(cache_dir, "huggingface")
    os.environ['NEMO_CACHE_DIR'] = os.path.join(cache_dir, "nemo")
    os.environ['TMPDIR'] = os.path.join(cache_dir, "tmp")

    # Create cache directories
    for d in [os.environ['HF_HOME'], os.environ['NEMO_CACHE_DIR'], os.environ['TMPDIR']]:
        os.makedirs(d, exist_ok=True)


# ============== CONFIGURATION ==============
PARAKEET_MODEL_NAME = "nvidia/parakeet-tdt-0.6b-v2"

# Device selection: MPS (Apple Silicon) > CPU
# macOS does NOT support CUDA - NVIDIA GPUs are not available on Mac
def get_device():
    """Get the best available device for macOS"""
    # Check for MPS (Metal Performance Shaders) - Apple Silicon M1/M2/M3/M4
    if hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
        try:
            # Test MPS availability
            test_tensor = torch.zeros(1, device='mps')
            del test_tensor
            return "mps"
        except Exception as e:
            print(f"[DEVICE] MPS available but failed test: {e}")
            return "cpu"
    return "cpu"

DEVICE = get_device()
# MPS doesn't support float16 well for all operations, use float32
MODEL_PRECISION = "fp32"


def get_base_path():
    """Get base path for resources (handles PyInstaller frozen state)"""
    if getattr(sys, 'frozen', False):
        return sys._MEIPASS
    else:
        return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class StreamingTranscriber:
    """Real-time streaming transcription using Parakeet TDT"""

    # Maximum audio buffer size: 5 minutes at 16kHz = 4,800,000 samples
    MAX_BUFFER_SAMPLES = 16000 * 60 * 5  # 5 minutes

    def __init__(self, model, sample_rate=16000, chunk_duration_ms=500):
        self.model = model
        self.sample_rate = sample_rate
        self.chunk_duration_ms = chunk_duration_ms
        self.chunk_samples = int(sample_rate * chunk_duration_ms / 1000)
        self.audio_buffer = []
        self.accumulated_audio = np.array([], dtype=np.float32)
        self.last_transcription = ""
        self.confirmed_text = ""
        self.confirmed_word_count = 0  # Track how many words are locked/confirmed
        self.word_counts = {}
        self.min_word_count = 4  # Word must appear 4 times to be confirmed

    def reset(self):
        """Reset state for new recording"""
        self.audio_buffer = []
        self.accumulated_audio = np.array([], dtype=np.float32)
        self.last_transcription = ""
        self.confirmed_text = ""
        self.confirmed_word_count = 0
        self.word_counts = {}

    def add_audio_chunk(self, audio_chunk: np.ndarray):
        """Add audio chunk to buffer with sliding window to prevent memory exhaustion"""
        self.accumulated_audio = np.concatenate([self.accumulated_audio, audio_chunk])

        # Apply sliding window if buffer exceeds max size
        if len(self.accumulated_audio) > self.MAX_BUFFER_SAMPLES:
            self.accumulated_audio = self.accumulated_audio[-self.MAX_BUFFER_SAMPLES:]
            print(f"[STREAMING] Buffer trimmed to {len(self.accumulated_audio)} samples")

    def transcribe_current(self) -> tuple[str, str]:
        """
        Transcribe accumulated audio and return (partial_text, confirmed_text)

        LOCKED CONFIRMATION: Once words are confirmed (yellow), they NEVER change.
        Only new words can be added to confirmed. Gray text shows current unstable words.

        Returns:
            partial_text: Current unconfirmed words being spoken (gray in UI)
            confirmed_text: LOCKED confirmed words (yellow in UI) - never changes once set
        """
        # Need at least 0.4 seconds of audio before showing anything
        if len(self.accumulated_audio) < self.sample_rate * 0.4:
            return "", self.confirmed_text

        try:
            import soundfile as sf

            with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp_file:
                sf.write(tmp_file.name, self.accumulated_audio, self.sample_rate)
                tmp_path = tmp_file.name

            try:
                with torch.inference_mode():
                    # MPS doesn't need autocast like CUDA
                    output = self.model.transcribe([tmp_path], batch_size=1, verbose=False)

                if output and len(output) > 0:
                    text = self._extract_text(output[0])
                    text = self._clean_text(text)

                    if not text.strip():
                        return "", self.confirmed_text

                    self.last_transcription = text
                    current_words = text.split()

                    # Track word appearances at each position (only for positions beyond confirmed)
                    for i, word in enumerate(current_words):
                        if i >= self.confirmed_word_count:  # Only track unconfirmed positions
                            key = f"{i}:{word.lower()}"
                            self.word_counts[key] = self.word_counts.get(key, 0) + 1

                    # Find NEW words to confirm (starting from where we left off)
                    # Once confirmed, words are LOCKED and never change
                    new_confirmed = []
                    for i in range(self.confirmed_word_count, len(current_words)):
                        word = current_words[i]
                        key = f"{i}:{word.lower()}"
                        if self.word_counts.get(key, 0) >= self.min_word_count:
                            new_confirmed.append(word)
                        else:
                            # Stop at first unstable word
                            break

                    # Add new confirmed words to the locked confirmed text
                    if new_confirmed:
                        if self.confirmed_text:
                            self.confirmed_text += " " + " ".join(new_confirmed)
                        else:
                            self.confirmed_text = " ".join(new_confirmed)
                        self.confirmed_word_count += len(new_confirmed)

                    # Partial = everything AFTER the locked confirmed portion
                    if self.confirmed_word_count < len(current_words):
                        partial_words = current_words[self.confirmed_word_count:]
                        partial_text = " ".join(partial_words)
                    else:
                        partial_text = ""

                    return partial_text, self.confirmed_text

            finally:
                try:
                    os.unlink(tmp_path)
                except OSError:
                    pass

        except Exception as e:
            print(f"[STREAMING] Error: {e}")

        # On error, return empty partial to avoid duplication
        return "", self.confirmed_text

    def get_final_transcription(self) -> str:
        """Get final transcription when recording stops"""
        audio_duration = len(self.accumulated_audio) / self.sample_rate if self.sample_rate > 0 else 0
        print(f"[FINAL] Audio samples: {len(self.accumulated_audio)}, duration: {audio_duration:.2f}s")
        if len(self.accumulated_audio) < self.sample_rate * 0.3:
            print(f"[FINAL] Audio too short (< 0.3s), returning empty")
            return ""

        try:
            import soundfile as sf

            with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp_file:
                sf.write(tmp_file.name, self.accumulated_audio, self.sample_rate)
                tmp_path = tmp_file.name

            try:
                with torch.inference_mode():
                    output = self.model.transcribe([tmp_path], batch_size=1, verbose=False)

                if output and len(output) > 0:
                    text = self._extract_text(output[0])
                    return self._clean_text(text)

            finally:
                try:
                    os.unlink(tmp_path)
                except OSError:
                    pass

        except Exception as e:
            print(f"[STREAMING] Final error: {e}")

        return self.last_transcription

    def _extract_text(self, output) -> str:
        """Extract text from model output"""
        if hasattr(output, 'text'):
            return output.text
        elif isinstance(output, str):
            return output
        else:
            return str(output)

    def _clean_text(self, text: str) -> str:
        """Clean up transcription text"""
        text = text.strip()
        if text.startswith('["') and text.endswith('"]'):
            text = text[2:-2]
        elif text.startswith('[') and text.endswith(']'):
            text = text[1:-1].strip('"\'')
        return text


class TranscriptionService:
    """Main transcription service managing ASR model and processing"""

    def __init__(self):
        self.model = None
        self.streaming_transcriber = None
        self.device = torch.device(DEVICE)

    def load_model(self):
        """Load Parakeet ASR model with warmup"""
        import nemo.collections.asr as nemo_asr

        print(f"[PARAKEET] Loading model on {DEVICE}...")
        if DEVICE == "mps":
            print("[PARAKEET] Using Apple Silicon MPS acceleration")
        else:
            print("[PARAKEET] Using CPU (no GPU acceleration)")

        warnings.filterwarnings('ignore')

        with torch.inference_mode():
            # Load model - will be on CPU initially
            model = nemo_asr.models.ASRModel.from_pretrained(
                PARAKEET_MODEL_NAME,
                map_location='cpu'  # Load to CPU first
            )

            # Move to MPS if available
            if DEVICE == "mps":
                try:
                    model = model.to('mps')
                    print("[PARAKEET] Model moved to MPS")
                except Exception as e:
                    print(f"[PARAKEET] Failed to move to MPS, using CPU: {e}")
                    self.device = torch.device('cpu')

            model.eval()

        gc.collect()

        self.model = model
        print(f"[PARAKEET] Model loaded successfully on {DEVICE}")

        # Warmup: run a tiny inference to avoid first-call latency
        self._warmup_model()

    def _warmup_model(self):
        """Run warmup inference to initialize and avoid first-call latency"""
        try:
            t0 = time.perf_counter()
            # 0.5s of silence at 16kHz
            dummy_audio = np.zeros(int(0.5 * 16000), dtype=np.float32)
            _ = self.transcribe_ndarray(dummy_audio)
            warmup_ms = (time.perf_counter() - t0) * 1000.0
            print(f"[PARAKEET] Model warmup complete ({warmup_ms:.1f}ms)")
        except Exception as e:
            print(f"[PARAKEET] Model warmup failed: {e}")

    def transcribe_ndarray(self, audio_float32: np.ndarray, sample_rate: int = 16000) -> str:
        """
        Transcribe audio from numpy float32 array.

        Args:
            audio_float32: np.ndarray of shape (N,), dtype float32, range [-1,1], sr=16000
            sample_rate: Sample rate of the audio (default 16000)

        Returns:
            Transcribed text string
        """
        if self.model is None:
            raise RuntimeError("ASR model not loaded")

        t0 = time.perf_counter()

        # Use tempfile approach (works reliably with NeMo)
        tmp_file = None
        try:
            t_write = time.perf_counter()
            tmp_file = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
            sf.write(tmp_file.name, audio_float32, samplerate=sample_rate, format='WAV', subtype='PCM_16')
            tmp_file.flush()
            tmp_file.close()
            write_ms = (time.perf_counter() - t_write) * 1000.0

            t_infer = time.perf_counter()
            with torch.inference_mode():
                output = self.model.transcribe([tmp_file.name], batch_size=1, verbose=False)
            infer_ms = (time.perf_counter() - t_infer) * 1000.0

            took_ms = (time.perf_counter() - t0) * 1000.0
            logger.info(f"transcribe_ndarray: {took_ms:.1f}ms (write={write_ms:.1f}ms, infer={infer_ms:.1f}ms)")
            print(f"[TRANSCRIBE] {took_ms:.1f}ms (write={write_ms:.1f}ms, infer={infer_ms:.1f}ms)")

            return self._extract_and_clean_text(output)
        finally:
            if tmp_file is not None:
                try:
                    os.unlink(tmp_file.name)
                except OSError:
                    pass

    def _extract_and_clean_text(self, output) -> str:
        """Extract and clean text from model output"""
        # Handle list output (common for NeMo)
        if isinstance(output, list) and len(output) > 0:
            output = output[0]

        # Extract text from output object
        if hasattr(output, 'text'):
            text = output.text
        elif isinstance(output, str):
            text = output
        else:
            text = str(output)

        # Clean up common artifacts
        text = text.strip()
        if text.startswith('["') and text.endswith('"]'):
            text = text[2:-2]
        elif text.startswith('[') and text.endswith(']'):
            text = text[1:-1].strip('"\'')

        return text.strip()

    def unload_model(self):
        """Cleanup memory"""
        print("[SHUTDOWN] Cleaning up resources...")
        if self.model is not None:
            del self.model
            self.model = None

        gc.collect()

        # MPS doesn't have explicit cache clearing like CUDA
        if torch.backends.mps.is_available():
            try:
                # Force garbage collection for MPS
                torch.mps.empty_cache()
            except:
                pass

        print("[SHUTDOWN] Memory released")

    def is_model_loaded(self) -> bool:
        """Check if model is loaded"""
        return self.model is not None

    def get_streaming_transcriber(self) -> StreamingTranscriber:
        """Get or create streaming transcriber"""
        if self.model is None:
            raise RuntimeError("ASR model not loaded")
        self.streaming_transcriber = StreamingTranscriber(self.model)
        return self.streaming_transcriber

    def convert_webm_to_wav(self, webm_data: bytes) -> bytes:
        """Convert WebM/Opus audio to WAV format using FFmpeg"""
        try:
            with tempfile.NamedTemporaryFile(suffix='.webm', delete=False) as webm_file:
                webm_file.write(webm_data)
                webm_path = webm_file.name

            wav_path = webm_path.replace('.webm', '.wav')

            # On macOS, FFmpeg should be installed via Homebrew
            ffmpeg_paths = [
                'ffmpeg',  # Should be in PATH if installed via Homebrew
                '/usr/local/bin/ffmpeg',  # Intel Mac Homebrew
                '/opt/homebrew/bin/ffmpeg',  # Apple Silicon Homebrew
            ]

            ffmpeg_cmd = None
            for path in ffmpeg_paths:
                try:
                    result = subprocess.run([path, '-version'], capture_output=True, timeout=5)
                    if result.returncode == 0:
                        ffmpeg_cmd = path
                        break
                except (subprocess.SubprocessError, FileNotFoundError, OSError):
                    continue

            if not ffmpeg_cmd:
                print("[CONVERT] FFmpeg not found, trying without conversion")
                return webm_data

            cmd = [
                ffmpeg_cmd,
                '-y',
                '-i', webm_path,
                '-ar', '16000',
                '-ac', '1',
                '-f', 'wav',
                wav_path
            ]

            result = subprocess.run(cmd, capture_output=True, timeout=30)

            if result.returncode != 0:
                print(f"[CONVERT] FFmpeg failed: {result.stderr.decode()}")
                return webm_data

            with open(wav_path, 'rb') as f:
                wav_data = f.read()

            try:
                os.unlink(webm_path)
                os.unlink(wav_path)
            except OSError:
                pass

            print(f"[CONVERT] Converted WebM ({len(webm_data)} bytes) to WAV ({len(wav_data)} bytes)")
            return wav_data

        except Exception as e:
            print(f"[CONVERT] Error: {e}")
            return webm_data

    def transcribe(self, audio_data: bytes, filename: str) -> dict:
        """Transcribe audio using local Parakeet model"""
        if self.model is None:
            return {"error": "ASR model not loaded", "text": ""}

        try:
            import soundfile as sf
            import librosa
            import io

            convert_start = time.time()

            # Convert WebM to WAV first
            wav_data = self.convert_webm_to_wav(audio_data)

            audio_buffer = io.BytesIO(wav_data)
            audio, sr = sf.read(audio_buffer)

            if len(audio.shape) > 1:
                audio = audio.mean(axis=1)

            if sr != 16000:
                audio = librosa.resample(audio, orig_sr=sr, target_sr=16000)
                sr = 16000

            audio = audio.astype(np.float32)

            convert_time = time.time() - convert_start
            print(f"[PARAKEET] Audio prepared: {len(audio)/sr:.2f}s at {sr}Hz (convert: {convert_time:.2f}s)")

            with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp_file:
                sf.write(tmp_file.name, audio, sr)
                tmp_path = tmp_file.name

            try:
                transcribe_start = time.time()

                with torch.inference_mode():
                    output = self.model.transcribe(
                        [tmp_path],
                        batch_size=1,
                        verbose=False
                    )

                    transcribe_time = time.time() - transcribe_start

                    if output and len(output) > 0:
                        if hasattr(output[0], 'text'):
                            text = output[0].text
                        elif isinstance(output[0], str):
                            text = output[0]
                        else:
                            text = str(output[0])

                        text = text.strip()
                        if text.startswith('["') and text.endswith('"]'):
                            text = text[2:-2]
                        elif text.startswith('[') and text.endswith(']'):
                            text = text[1:-1].strip('"\'')

                        print(f"[PARAKEET] Transcription ({transcribe_time:.2f}s): {text[:100]}...")
                        return {"text": text.strip(), "error": None}
                    else:
                        return {"text": "", "error": None}

            finally:
                try:
                    os.unlink(tmp_path)
                except OSError:
                    pass

        except Exception as e:
            print(f"[PARAKEET] Error: {e}")
            import traceback
            traceback.print_exc()
            return {"error": str(e), "text": ""}


def merge_text(existing: str, new_chunk: str, overlap_words: int = 3) -> str:
    """
    Merge overlapping transcript chunks intelligently.

    Since we send overlapping audio windows (50% overlap), consecutive chunk
    transcriptions may contain repeated words at boundaries. This function
    detects and removes such overlaps.

    Args:
        existing: The accumulated transcript so far
        new_chunk: The new chunk to merge
        overlap_words: Max words to check for overlap (default 3)

    Returns:
        Merged text with overlaps removed
    """
    if not existing:
        return new_chunk.strip()
    if not new_chunk:
        return existing.strip()

    existing = existing.strip()
    new_chunk = new_chunk.strip()

    existing_words = existing.split()
    new_words = new_chunk.split()

    if not existing_words or not new_words:
        return (existing + " " + new_chunk).strip()

    # Look for overlap: check if end of existing matches start of new
    best_overlap = 0
    for overlap_len in range(1, min(overlap_words + 1, len(existing_words) + 1, len(new_words) + 1)):
        existing_tail = existing_words[-overlap_len:]
        new_head = new_words[:overlap_len]

        # Case-insensitive comparison
        if [w.lower() for w in existing_tail] == [w.lower() for w in new_head]:
            best_overlap = overlap_len

    if best_overlap > 0:
        # Remove overlapping words from new chunk
        merged = existing + " " + " ".join(new_words[best_overlap:])
    else:
        merged = existing + " " + new_chunk

    return merged.strip()


# Global transcription service instance
transcription_service = TranscriptionService()

# Setup cache directories on module load
setup_cache_dirs()
