"""
Transcription Service
Handles ASR model loading, streaming transcription, and audio processing
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
    """Set up cache directories to avoid C: drive space issues"""
    cache_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".cache")
    os.environ['HF_HOME'] = os.path.join(cache_dir, "huggingface")
    os.environ['NEMO_CACHE_DIR'] = os.path.join(cache_dir, "nemo")
    os.environ['TMPDIR'] = os.path.join(cache_dir, "tmp")
    os.environ['TEMP'] = os.path.join(cache_dir, "tmp")
    os.environ['TMP'] = os.path.join(cache_dir, "tmp")

    # Create cache directories
    for d in [os.environ['HF_HOME'], os.environ['NEMO_CACHE_DIR'], os.environ['TMPDIR']]:
        os.makedirs(d, exist_ok=True)


# ============== CONFIGURATION ==============
PARAKEET_MODEL_NAME = "nvidia/parakeet-tdt-0.6b-v2"

# NeMo Parakeet has a hard limit of 40 seconds per inference
# We chunk audio at 30 seconds to stay well within limits (like Wispr Flow)
MAX_CHUNK_DURATION = 30.0  # seconds
CHUNK_OVERLAP = 2.0  # seconds overlap to avoid cutting words

# Device selection: CUDA (NVIDIA) > MPS (Apple Silicon) > CPU
def get_device():
    if torch.cuda.is_available():
        # Force PyTorch to use discrete GPU (RTX 3060), not integrated GPU
        torch.cuda.set_device(0)  # Use GPU 0 (usually discrete GPU)
        gpu_name = torch.cuda.get_device_name(0)
        print(f"[GPU] Using: {gpu_name}")

        # Verify it's the RTX 3060
        if "3060" not in gpu_name and "RTX" not in gpu_name:
            print(f"[GPU WARNING] Expected RTX 3060, got: {gpu_name}")

        return "cuda:0"  # Explicitly use cuda:0
    elif hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
        return "mps"
    else:
        return "cpu"

DEVICE = get_device()
# Allow overriding precision via environment variable (default: fp16 for CUDA to save VRAM)
# Set MODEL_PRECISION=fp32 for better quality on high-VRAM GPUs (Colab T4 = 15GB)
MODEL_PRECISION = os.getenv("MODEL_PRECISION", "fp16" if "cuda" in DEVICE else "fp32")


def get_base_path():
    """Get base path for resources (handles PyInstaller frozen state)"""
    if getattr(sys, 'frozen', False):
        return sys._MEIPASS
    else:
        return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class StreamingTranscriber:
    """Real-time streaming transcription using Parakeet TDT"""

    # Maximum audio buffer size: 2 minutes at 16kHz (optimized for 6GB VRAM)
    MAX_BUFFER_SAMPLES = 16000 * 60 * 2  # 2 minutes (reduced from 5 to save RAM)

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
        self.min_word_count = 4  # Increased from 2 - word must appear 4 times to be confirmed

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
                    with torch.cuda.amp.autocast(enabled=(DEVICE == "cuda")):
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
        """
        Get final transcription when recording stops.

        ALWAYS runs inference on all accumulated audio to capture any words
        spoken after the last streaming transcription (which runs every 500ms).

        For long recordings (>30s), automatically chunks audio to avoid model limits.
        """
        import time as _time
        _t0 = _time.perf_counter()

        audio_duration = len(self.accumulated_audio) / self.sample_rate if self.sample_rate > 0 else 0

        # Audio too short - nothing to transcribe
        if len(self.accumulated_audio) < self.sample_rate * 0.3:
            print(f"[FINAL] Audio too short ({audio_duration:.2f}s < 0.3s), returning empty")
            return ""

        print(f"[FINAL] Running final inference on {audio_duration:.2f}s audio...")

        try:
            # For long audio, use chunking to avoid exceeding model's 40s limit
            if audio_duration > MAX_CHUNK_DURATION:
                print(f"[FINAL] Long recording detected ({audio_duration:.1f}s), using chunking...")
                chunks = self._chunk_long_audio(self.accumulated_audio, self.sample_rate)
                merged_text = ""

                for i, chunk in enumerate(chunks):
                    chunk_duration = len(chunk) / self.sample_rate
                    print(f"[FINAL] Processing chunk {i+1}/{len(chunks)} ({chunk_duration:.1f}s)...")

                    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp_file:
                        sf.write(tmp_file.name, chunk, self.sample_rate)
                        tmp_path = tmp_file.name

                    try:
                        with torch.inference_mode():
                            with torch.cuda.amp.autocast(enabled=(DEVICE == "cuda")):
                                # Freeze encoder to prevent NeMo's unfreeze error
                                try:
                                    if hasattr(self.model, 'encoder'):
                                        self.model.encoder.freeze()
                                except Exception:
                                    pass  # If freeze fails, continue anyway

                                try:
                                    output = self.model.transcribe([tmp_path], batch_size=1, verbose=False)
                                except ValueError as e:
                                    # Handle NeMo's unfreeze bug gracefully
                                    if "Cannot unfreeze" in str(e):
                                        print(f"[FINAL] NeMo unfreeze error (ignoring, non-critical)")
                                        output = []
                                    else:
                                        raise

                        if output and len(output) > 0:
                            chunk_text = self._extract_text(output[0])
                            chunk_text = self._clean_text(chunk_text)
                            merged_text = merge_text(merged_text, chunk_text, overlap_words=5)
                    finally:
                        try:
                            os.unlink(tmp_path)
                        except OSError:
                            pass

                _ms = (_time.perf_counter() - _t0) * 1000
                print(f"[FINAL] Chunked inference took {_ms:.0f}ms: {merged_text[:50] if merged_text else 'empty'}...")
                return merged_text

            # Short audio - process normally without chunking
            with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp_file:
                sf.write(tmp_file.name, self.accumulated_audio, self.sample_rate)
                tmp_path = tmp_file.name

            try:
                with torch.inference_mode():
                    with torch.cuda.amp.autocast(enabled=(DEVICE == "cuda")):
                        # Freeze encoder to prevent NeMo's unfreeze error
                        try:
                            if hasattr(self.model, 'encoder'):
                                self.model.encoder.freeze()
                        except Exception:
                            pass  # If freeze fails, continue anyway

                        try:
                            output = self.model.transcribe([tmp_path], batch_size=1, verbose=False)
                        except ValueError as e:
                            # Handle NeMo's unfreeze bug gracefully
                            if "Cannot unfreeze" in str(e):
                                print(f"[FINAL] NeMo unfreeze error (ignoring, non-critical)")
                                output = []
                            else:
                                raise

                _ms = (_time.perf_counter() - _t0) * 1000
                if output and len(output) > 0:
                    text = self._extract_text(output[0])
                    text = self._clean_text(text)
                    print(f"[FINAL] Inference took {_ms:.0f}ms: {text[:50] if text else 'empty'}...")
                    return text
            finally:
                try:
                    os.unlink(tmp_path)
                except OSError:
                    pass
        except Exception as e:
            print(f"[FINAL] Error: {e}")
            import traceback
            traceback.print_exc()

        return ""

    def _chunk_long_audio(self, audio: np.ndarray, sample_rate: int) -> list[np.ndarray]:
        """
        Split long audio into chunks for StreamingTranscriber.

        Args:
            audio: Audio array
            sample_rate: Sample rate

        Returns:
            List of audio chunks
        """
        audio_duration = len(audio) / sample_rate
        chunk_samples = int(MAX_CHUNK_DURATION * sample_rate)
        overlap_samples = int(CHUNK_OVERLAP * sample_rate)
        stride_samples = chunk_samples - overlap_samples

        chunks = []
        start_idx = 0

        while start_idx < len(audio):
            end_idx = min(start_idx + chunk_samples, len(audio))
            chunk = audio[start_idx:end_idx]
            chunks.append(chunk)
            start_idx += stride_samples
            if end_idx >= len(audio):
                break

        chunk_durations = [len(c) / sample_rate for c in chunks]
        print(f"[FINAL] Split {audio_duration:.1f}s into {len(chunks)} chunks: {chunk_durations}")
        return chunks

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
        """Load Parakeet ASR model with warmup (optimized for 6GB VRAM)"""
        import nemo.collections.asr as nemo_asr

        print(f"[PARAKEET] Loading model on {DEVICE} with {MODEL_PRECISION.upper()} precision...")
        warnings.filterwarnings('ignore')

        # Aggressive memory cleanup before loading
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            torch.cuda.reset_peak_memory_stats()

        with torch.inference_mode():
            model = nemo_asr.models.ASRModel.from_pretrained(
                PARAKEET_MODEL_NAME,
                map_location=DEVICE
            )
            if DEVICE == "cuda":
                # Use .float() or .half() for proper recursive conversion
                # This is more robust than .to(dtype) for NeMo models
                if MODEL_PRECISION == "fp32":
                    model = model.float()  # Recursively convert all params to FP32
                else:
                    model = model.half()   # Recursively convert all params to FP16

                model = model.cuda()

                # Verify actual dtype (check encoder - holds bulk of weights)
                if hasattr(model, 'encoder'):
                    param = next(model.encoder.parameters())
                    print(f"[PARAKEET] Encoder Dtype: {param.dtype}")
                else:
                    param = next(model.parameters())
                    print(f"[PARAKEET] Model Dtype: {param.dtype}")

                # Check VRAM allocation directly via torch
                allocated_gb = torch.cuda.memory_allocated(0) / 1024**3
                print(f"[PARAKEET] VRAM (torch): {allocated_gb:.2f} GB")

                # Disable CUDA graphs to prevent crashes on long recordings (like Wispr Flow)
                # Trade: Slightly slower inference, but stable for 10-15min recordings
                torch.backends.cudnn.benchmark = False
                torch.backends.cudnn.deterministic = True
                # Disable CUDA graph capture (causes "replay without capture" errors)
                torch.cuda.set_sync_debug_mode(0)  # Disable graph debugging

                # CRITICAL: Explicitly disable CUDA graphs in the decoder
                if hasattr(model, 'decoding') and hasattr(model.decoding, 'decoding'):
                    if hasattr(model.decoding.decoding, '_decoding_computer'):
                        model.decoding.decoding._decoding_computer.use_cuda_graphs = False
                        print("[PARAKEET] CUDA graphs disabled in decoder")

            model.eval()

        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            # Print VRAM usage
            allocated = torch.cuda.memory_allocated() / 1024**3
            reserved = torch.cuda.memory_reserved() / 1024**3
            print(f"[PARAKEET] VRAM: {allocated:.2f}GB allocated, {reserved:.2f}GB reserved")

        self.model = model
        print(f"[PARAKEET] Model loaded successfully on {DEVICE} ({MODEL_PRECISION.upper()})")

        # Warmup: run a tiny inference to avoid first-call CUDA overhead
        self._warmup_model()

    def _warmup_model(self):
        """Run warmup inference to initialize CUDA graphs and avoid first-call latency"""
        try:
            t0 = time.perf_counter()
            # 0.5s of silence at 16kHz
            dummy_audio = np.zeros(int(0.5 * 16000), dtype=np.float32)
            _ = self.transcribe_ndarray(dummy_audio)
            warmup_ms = (time.perf_counter() - t0) * 1000.0
            print(f"[PARAKEET] Model warmup complete ({warmup_ms:.1f}ms)")
        except Exception as e:
            print(f"[PARAKEET] Model warmup failed: {e}")

    def _chunk_audio(self, audio_float32: np.ndarray, sample_rate: int = 16000) -> list[np.ndarray]:
        """
        Split long audio into overlapping chunks to stay within model's 40s limit.

        Uses 30-second chunks with 2-second overlap to:
        - Avoid exceeding NeMo's 40s max_duration
        - Prevent cutting words mid-sentence
        - Enable processing of 10-15 minute recordings (like Wispr Flow)

        Args:
            audio_float32: Audio array (dtype float32)
            sample_rate: Sample rate (default 16000 Hz)

        Returns:
            List of audio chunks, each <= 30 seconds
        """
        audio_duration = len(audio_float32) / sample_rate

        # No chunking needed for short audio
        if audio_duration <= MAX_CHUNK_DURATION:
            return [audio_float32]

        chunk_samples = int(MAX_CHUNK_DURATION * sample_rate)
        overlap_samples = int(CHUNK_OVERLAP * sample_rate)
        stride_samples = chunk_samples - overlap_samples

        chunks = []
        start_idx = 0

        while start_idx < len(audio_float32):
            end_idx = min(start_idx + chunk_samples, len(audio_float32))
            chunk = audio_float32[start_idx:end_idx]
            chunks.append(chunk)

            # Move to next chunk with overlap
            start_idx += stride_samples

            # Stop if we've covered all audio
            if end_idx >= len(audio_float32):
                break

        chunk_durations = [len(c) / sample_rate for c in chunks]
        print(f"[CHUNKING] Split {audio_duration:.1f}s audio into {len(chunks)} chunks: {chunk_durations}")
        return chunks

    def _transcribe_chunked(self, audio_float32: np.ndarray, sample_rate: int = 16000) -> str:
        """
        Transcribe long audio by splitting into chunks and merging results.

        Args:
            audio_float32: Long audio array (> 30 seconds)
            sample_rate: Sample rate (default 16000 Hz)

        Returns:
            Merged transcription text
        """
        chunks = self._chunk_audio(audio_float32, sample_rate)
        merged_text = ""

        for i, chunk in enumerate(chunks):
            chunk_duration = len(chunk) / sample_rate
            print(f"[CHUNKING] Processing chunk {i+1}/{len(chunks)} ({chunk_duration:.1f}s)...")

            try:
                # Transcribe this chunk using the single-chunk method
                with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp_file:
                    sf.write(tmp_file.name, chunk, samplerate=sample_rate, format='WAV', subtype='PCM_16')
                    tmp_file.flush()
                    tmp_file.close()

                    with torch.inference_mode():
                        output = self.model.transcribe([tmp_file.name], batch_size=1, verbose=False)

                    chunk_text = self._extract_and_clean_text(output)

                    # Merge with existing text, handling overlap intelligently
                    merged_text = merge_text(merged_text, chunk_text, overlap_words=5)

                    print(f"[CHUNKING] Chunk {i+1}/{len(chunks)}: {chunk_text[:80]}...")

                try:
                    os.unlink(tmp_file.name)
                except OSError:
                    pass

            except Exception as e:
                print(f"[CHUNKING] Error processing chunk {i+1}: {e}")
                # Continue with other chunks even if one fails

        print(f"[CHUNKING] Final merged text: {merged_text[:100]}...")
        return merged_text

    def transcribe_ndarray(self, audio_float32: np.ndarray, sample_rate: int = 16000) -> str:
        """
        Transcribe audio from numpy float32 array with automatic chunking for long recordings.

        For audio > 30 seconds, automatically splits into overlapping chunks to avoid
        exceeding NeMo's 40-second limit. Supports 10-15 minute recordings like Wispr Flow.

        This method tries multiple approaches in order:
        - Option A: Direct waveform/tensor API (if model supports it)
        - Option B: In-memory BytesIO buffer (if model accepts file-like objects)
        - Option C: Fallback to tempfile (always works, but has disk I/O)

        Args:
            audio_float32: np.ndarray of shape (N,), dtype float32, range [-1,1], sr=16000
            sample_rate: Sample rate of the audio (default 16000)

        Returns:
            Transcribed text string
        """
        if self.model is None:
            raise RuntimeError("ASR model not loaded")

        # Check if chunking is needed
        audio_duration = len(audio_float32) / sample_rate
        if audio_duration > MAX_CHUNK_DURATION:
            print(f"[CHUNKING] Audio is {audio_duration:.1f}s, chunking required (max {MAX_CHUNK_DURATION}s)")
            return self._transcribe_chunked(audio_float32, sample_rate)

        t0 = time.perf_counter()
        method_used = "unknown"

        # Helper for autocast context (only CUDA supports amp.autocast)
        def get_autocast_context():
            if self.device.type == "cuda":
                return torch.cuda.amp.autocast(enabled=True)
            else:
                # MPS and CPU don't use autocast the same way
                return torch.inference_mode()

        # Option A: Try direct waveform/tensor API if available
        # NeMo Parakeet models typically don't have this, but check anyway
        try:
            if hasattr(self.model, 'transcribe_waveform'):
                wav_tensor = torch.from_numpy(audio_float32).unsqueeze(0).to(self.device)
                with torch.inference_mode():
                    text = self.model.transcribe_waveform(wav_tensor)
                took_ms = (time.perf_counter() - t0) * 1000.0
                logger.info(f"transcribe_ndarray: {took_ms:.1f}ms via Option A (waveform)")
                return self._extract_and_clean_text(text)
            elif hasattr(self.model, 'transcribe_audio'):
                wav_tensor = torch.from_numpy(audio_float32).unsqueeze(0).to(self.device)
                with torch.inference_mode():
                    text = self.model.transcribe_audio(wav_tensor)
                took_ms = (time.perf_counter() - t0) * 1000.0
                logger.info(f"transcribe_ndarray: {took_ms:.1f}ms via Option A (audio)")
                return self._extract_and_clean_text(text)
        except Exception as e:
            logger.debug(f"Option A failed: {e}")

        # Option B: Try in-memory BytesIO buffer
        # Most NeMo models don't accept file-like objects, but we try anyway
        try:
            bio = io.BytesIO()
            sf.write(bio, audio_float32, samplerate=sample_rate, format='WAV', subtype='PCM_16')
            bio.seek(0)

            # Check if transcribe accepts file-like by trying it
            # This will likely fail for NeMo, but we try
            with torch.inference_mode():
                output = self.model.transcribe(bio, batch_size=1, verbose=False)

            took_ms = (time.perf_counter() - t0) * 1000.0
            logger.info(f"transcribe_ndarray: {took_ms:.1f}ms via Option B (BytesIO)")
            return self._extract_and_clean_text(output)
        except Exception as e:
            logger.debug(f"Option B failed: {e}")

        # Option C: Fallback to tempfile (always works with NeMo)
        # Note: Caller should run this in asyncio.to_thread to keep disk I/O off event loop
        tmp_file = None
        try:
            t_write = time.perf_counter()
            tmp_file = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
            sf.write(tmp_file.name, audio_float32, samplerate=sample_rate, format='WAV', subtype='PCM_16')
            tmp_file.flush()
            tmp_file.close()  # Close before reading on Windows
            write_ms = (time.perf_counter() - t_write) * 1000.0

            t_infer = time.perf_counter()
            with torch.inference_mode():
                output = self.model.transcribe([tmp_file.name], batch_size=1, verbose=False)
            infer_ms = (time.perf_counter() - t_infer) * 1000.0

            took_ms = (time.perf_counter() - t0) * 1000.0
            logger.info(f"transcribe_ndarray: {took_ms:.1f}ms via Option C (tempfile: write={write_ms:.1f}ms, infer={infer_ms:.1f}ms)")
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

        # Clear CUDA cache and synchronize to prevent state corruption (supports long recordings)
        if torch.cuda.is_available():
            torch.cuda.synchronize()  # Wait for all CUDA ops to complete
            torch.cuda.empty_cache()   # Free unused memory
            # Reset CUDA graph state to prevent "replay without capture" errors
            torch.cuda.reset_peak_memory_stats()

        return text.strip()

    def unload_model(self):
        """Cleanup GPU memory"""
        print("[SHUTDOWN] Cleaning up resources...")
        if self.model is not None:
            del self.model
            self.model = None

        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            torch.cuda.synchronize()
        print("[SHUTDOWN] GPU memory released")

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

            base_path = get_base_path()
            project_root = os.path.dirname(base_path)
            ffmpeg_paths = [
                'ffmpeg',
                os.path.join(base_path, 'ffmpeg', 'ffmpeg.exe'),
                os.path.join(base_path, 'ffmpeg.exe'),
                os.path.join(project_root, 'ffmpeg-master-latest-win64-gpl', 'bin', 'ffmpeg.exe'),
                os.path.join(base_path, '..', 'ffmpeg-master-latest-win64-gpl', 'bin', 'ffmpeg.exe'),
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
                    with torch.cuda.amp.autocast(enabled=(DEVICE == "cuda")):
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
