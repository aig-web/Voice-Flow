"""
Transcription Router - macOS
Audio transcription endpoints (HTTP and WebSocket) with full processing pipeline
"""
from fastapi import APIRouter, UploadFile, File, WebSocket, WebSocketDisconnect, Request, HTTPException, Form
import time
import asyncio
import numpy as np

from typing import Optional

from database import SessionLocal, Transcription, UserSettings, Mode

from services.transcription_service import transcription_service, DEVICE
from services.rate_limiter import rate_limiter
from services.auth_service import auth_service
from services.dictionary_service import dictionary_service
from services.text_cleanup_service import text_cleanup_service
from services.snippet_service import snippet_service
from services.ai_polish_service import ai_polish_service, Tone, AppContext

router = APIRouter(tags=["transcription"])

# Security limits
MAX_CHUNK_SIZE = 1024 * 1024  # 1MB max per audio chunk
MAX_AUDIO_BUFFER_SIZE = 50 * 1024 * 1024  # 50MB max total audio buffer


def get_user_settings() -> dict:
    """Get current user settings"""
    with SessionLocal() as db:
        settings = db.query(UserSettings).filter(
            UserSettings.user_id == "default"
        ).first()
        if settings:
            return settings.to_dict()
        return {"tone": "formal"}


async def process_text_pipeline(
    raw_text: str,
    app_context: str = "general",
    use_ai_polish: bool = True
) -> str:
    """
    Full text processing pipeline:
    1. Remove filler words and handle self-corrections
    2. Apply personal dictionary
    3. Apply snippets
    4. AI polish with tone and context (if enabled and configured)
    """
    if not raw_text or not raw_text.strip():
        return raw_text

    text = raw_text

    # Step 1: Remove filler words and handle self-corrections
    text = text_cleanup_service.process(text)
    print(f"[PIPELINE] After cleanup: {text[:50]}...")

    # Step 2: Apply personal dictionary
    dictionary = dictionary_service.get_dictionary()
    text = dictionary_service.apply_dictionary(text, dictionary)
    print(f"[PIPELINE] After dictionary: {text[:50]}...")

    # Step 3: Apply snippets
    text, applied_snippets = snippet_service.apply_snippets(text)
    if applied_snippets:
        print(f"[PIPELINE] Applied snippets: {applied_snippets}")

    # Step 4: AI polish (if enabled and configured)
    if use_ai_polish and ai_polish_service.is_configured():
        settings = get_user_settings()
        tone_str = settings.get("tone", "formal")
        try:
            tone = Tone(tone_str)
        except ValueError:
            tone = Tone.FORMAL

        try:
            context = AppContext(app_context)
        except ValueError:
            context = AppContext.GENERAL

        result = await ai_polish_service.polish(text, tone, context)
        if result["success"]:
            text = result["polished_text"]
            if result["changes_made"]:
                print(f"[PIPELINE] AI changes: {result['changes_made']}")
        else:
            print(f"[PIPELINE] AI polish skipped: {result['error']}")

    return text


@router.get("/api/ws-token")
async def get_ws_token():
    """Get WebSocket authentication token for streaming transcription"""
    return {"token": auth_service.generate_token()}


@router.websocket("/ws/transcribe")
async def websocket_transcribe(websocket: WebSocket):
    """
    WebSocket endpoint for real-time streaming transcription

    Authentication: Client must send {"type": "auth", "token": "<token>"} as first message
    Client sends: 16-bit PCM audio at 16kHz, mono
    Server sends: JSON with partial and confirmed transcription
    """
    await websocket.accept()
    print("[WS] Client connected, awaiting authentication...")

    app_context = "general"  # Default
    selected_text: Optional[str] = None
    clipboard_text: Optional[str] = None
    mode_id: Optional[int] = None
    mode: Optional[dict] = None

    # Wait for authentication message
    try:
        auth_message = await asyncio.wait_for(websocket.receive_json(), timeout=5.0)
        if auth_message.get("type") != "auth" or not auth_service.verify_token(auth_message.get("token", "")):
            await websocket.send_json({"error": "Authentication failed"})
            await websocket.close(code=4001, reason="Authentication failed")
            print("[WS] Authentication failed - invalid token")
            return

        # Get context from auth message (sent by Electron)
        app_context = auth_message.get("app_context", "general")
        selected_text = auth_message.get("selected_text")
        clipboard_text = auth_message.get("clipboard_text")
        mode_id = auth_message.get("mode_id")

        # Load mode if specified, or get active mode based on app, or use default
        with SessionLocal() as db:
            if mode_id:
                mode_obj = db.query(Mode).filter(Mode.id == mode_id).first()
                if mode_obj:
                    mode = mode_obj.to_dict()
            else:
                # Try to find mode that auto-switches for this app
                app_name = auth_message.get("app_name", "")
                if app_name:
                    modes = db.query(Mode).filter(Mode.user_id == "default").all()
                    for m in modes:
                        auto_apps = m.auto_switch_apps or []
                        if any(app_name.lower().find(a.lower()) >= 0 for a in auto_apps):
                            mode = m.to_dict()
                            break

                # If no mode selected yet, use the default mode
                if not mode:
                    default_mode = db.query(Mode).filter(
                        Mode.user_id == "default",
                        Mode.is_default == True
                    ).first()
                    if default_mode:
                        mode = default_mode.to_dict()
                        print(f"[WS] Using default mode: {mode.get('name')}")

        print(f"[WS] Client authenticated (context: {app_context}, mode: {mode.get('name') if mode else 'default'}, has_selection: {bool(selected_text)})")
    except asyncio.TimeoutError:
        await websocket.send_json({"error": "Authentication timeout"})
        await websocket.close(code=4002, reason="Authentication timeout")
        print("[WS] Authentication timeout")
        return
    except Exception as e:
        await websocket.send_json({"error": f"Authentication error: {str(e)}"})
        await websocket.close(code=4003, reason="Authentication error")
        print(f"[WS] Authentication error: {e}")
        return

    if not transcription_service.is_model_loaded():
        await websocket.send_json({"error": "ASR model not loaded"})
        await websocket.close()
        return

    streaming_transcriber = transcription_service.get_streaming_transcriber()

    try:
        last_transcribe_time = time.time()
        transcribe_interval = 0.3  # 300ms for responsive live updates

        while True:
            try:
                message = await asyncio.wait_for(websocket.receive(), timeout=0.1)

                if "bytes" in message:
                    data = message["bytes"]

                    # Security: Limit chunk size to prevent memory exhaustion
                    if len(data) > MAX_CHUNK_SIZE:
                        await websocket.send_json({"error": "Chunk too large", "max_size": MAX_CHUNK_SIZE})
                        continue

                    audio_int16 = np.frombuffer(data, dtype=np.int16)
                    audio_float32 = audio_int16.astype(np.float32) / 32768.0
                    streaming_transcriber.add_audio_chunk(audio_float32)

                elif "text" in message:
                    text = message["text"]
                    if text == "stop":
                        print("[WS] Stop command received, sending final transcription")

                        final_text = streaming_transcriber.get_final_transcription()
                        print(f"[WS] Final: {final_text[:100] if final_text else 'empty'}...")

                        # Process text through pipeline with mode support
                        polished_text = final_text
                        command_type = "none"

                        if final_text:
                            # Check mode settings for what to apply
                            use_cleanup = mode.get("use_cleanup", True) if mode else True
                            use_dictionary = mode.get("use_dictionary", True) if mode else True
                            use_snippets = mode.get("use_snippets", True) if mode else True
                            use_ai_polish = mode.get("use_ai_polish", False) if mode else False

                            print(f"[WS] Processing pipeline: cleanup={use_cleanup}, dict={use_dictionary}, snippets={use_snippets}, ai_polish={use_ai_polish}")
                            print(f"[WS] Mode loaded: {mode.get('name') if mode else 'None'}, mode settings: {mode}")

                            # Step 1: Quick text cleanup (filler words, self-corrections)
                            if use_cleanup:
                                polished_text = text_cleanup_service.process(final_text)

                            # Step 2: Apply personal dictionary
                            if use_dictionary:
                                dictionary = dictionary_service.get_dictionary()
                                polished_text = dictionary_service.apply_dictionary(polished_text, dictionary)

                            # Step 3: Apply snippets
                            if use_snippets:
                                polished_text, _ = snippet_service.apply_snippets(polished_text)

                            # Step 4: AI polish with mode (if enabled)
                            if use_ai_polish and ai_polish_service.is_configured():
                                print(f"[WS] AI polish starting...")
                                try:
                                    context = AppContext(app_context)
                                except ValueError:
                                    context = AppContext.GENERAL

                                result = await ai_polish_service.polish_with_mode(
                                    text=polished_text,
                                    mode=mode,
                                    selected_text=selected_text,
                                    clipboard_text=clipboard_text,
                                    app_context=context
                                )
                                if result["success"]:
                                    polished_text = result["polished_text"]
                                    command_type = result.get("command_type", "none")
                                    print(f"[WS] AI polish SUCCESS: {result.get('changes_made', [])}")
                                    print(f"[WS] Polished text: {polished_text[:100]}...")
                                else:
                                    print(f"[WS] AI polish FAILED: {result.get('error')}")
                            else:
                                if not use_ai_polish:
                                    print(f"[WS] AI polish SKIPPED - not enabled in mode")
                                elif not ai_polish_service.is_configured():
                                    print(f"[WS] AI polish SKIPPED - not configured")

                            # Save to database
                            with SessionLocal() as db:
                                transcription = Transcription(
                                    raw_text=final_text,
                                    polished_text=polished_text,
                                    mode_id=mode.get("id") if mode else None,
                                    mode_name=mode.get("name") if mode else None
                                )
                                db.add(transcription)
                                db.commit()
                            print(f"[WS] Saved to database (mode: {mode.get('name') if mode else 'default'})")

                        print(f"[WS] SENDING FINAL: text='{polished_text[:80] if polished_text else 'empty'}...', raw='{final_text[:80] if final_text else 'empty'}...'")
                        await websocket.send_json({
                            "type": "final",
                            "text": polished_text or "",
                            "raw": final_text or "",
                            "mode": mode.get("name") if mode else None,
                            "command_type": command_type
                        })

                        streaming_transcriber.reset()
                        break

            except asyncio.TimeoutError:
                pass

            current_time = time.time()
            if current_time - last_transcribe_time >= transcribe_interval:
                partial, confirmed = streaming_transcriber.transcribe_current()

                if partial or confirmed:
                    await websocket.send_json({
                        "type": "partial",
                        "partial": partial,
                        "confirmed": confirmed
                    })

                last_transcribe_time = current_time

    except WebSocketDisconnect:
        print("[WS] Client disconnected unexpectedly")
        if streaming_transcriber:
            streaming_transcriber.reset()

    except Exception as e:
        print(f"[WS] Error: {e}")
        import traceback
        traceback.print_exc()


@router.post("/api/transcribe")
async def transcribe_audio(
    request: Request,
    file: UploadFile = File(...),
    app_context: str = Form(default="general")
):
    """Transcribe audio using local Parakeet model with full processing pipeline"""

    # Rate limiting check
    client_ip = request.client.host if request.client else "unknown"
    if not rate_limiter.is_allowed(client_ip):
        raise HTTPException(
            status_code=429,
            detail="Rate limit exceeded. Please wait before making more requests."
        )

    try:
        contents = await file.read()
        print(f"\n{'='*60}")
        print(f"[TRANSCRIBE] Received: {file.filename} ({len(contents)} bytes)")

        if len(contents) < 1000:
            print(f"[TRANSCRIBE] Audio too short ({len(contents)} bytes)")
            return {
                "transcription": "",
                "polished_text": "",
                "status": "success",
                "message": "Recording too short"
            }

        start_time = time.time()

        result = transcription_service.transcribe(contents, file.filename or "audio.webm")

        transcribe_time = time.time() - start_time
        print(f"[TRANSCRIBE] Parakeet took {transcribe_time:.2f}s")

        if result.get("error"):
            print(f"[TRANSCRIBE] Error: {result['error']}")
            return {
                "transcription": "",
                "polished_text": "",
                "status": "error",
                "error": result["error"]
            }

        raw_text = result.get("text", "").strip()
        print(f"[TRANSCRIBE] Result: '{raw_text}'")

        if not raw_text:
            print("[TRANSCRIBE] No speech detected")
            return {
                "transcription": "",
                "polished_text": "",
                "status": "success",
                "message": "No speech detected"
            }

        # Use full processing pipeline with app context for tone adaptation
        print(f"[TRANSCRIBE] App context: {app_context}")
        polished_text = await process_text_pipeline(
            raw_text,
            app_context=app_context,
            use_ai_polish=True
        )

        if polished_text != raw_text:
            print(f"[TRANSCRIBE] After pipeline: '{polished_text}'")

        with SessionLocal() as db:
            transcription = Transcription(
                raw_text=raw_text,
                polished_text=polished_text,
                duration=transcribe_time
            )
            db.add(transcription)
            db.commit()
            db.refresh(transcription)

            print(f"[TRANSCRIBE] Saved to database (ID: {transcription.id})")
            print(f"{'='*60}\n")

            return {
                "transcription": raw_text,
                "polished_text": polished_text,
                "id": transcription.id,
                "created_at": transcription.created_at.isoformat(),
                "status": "success"
            }

    except Exception as e:
        print(f"[ERROR] Transcription error: {e}")
        import traceback
        traceback.print_exc()
        return {
            "transcription": "",
            "error": str(e),
            "status": "error"
        }


@router.get("/api/transcriptions")
async def get_transcriptions(limit: int = 50):
    """Get all transcriptions, newest first"""
    try:
        with SessionLocal() as db:
            transcriptions = db.query(Transcription).order_by(
                Transcription.created_at.desc()
            ).limit(limit).all()
            return [t.to_dict() for t in transcriptions]
    except Exception as e:
        print(f"[ERROR] Error fetching: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(500, f"Failed to fetch transcriptions: {str(e)}")


@router.get("/api/stats")
async def get_stats():
    """Get computed stats for dashboard"""
    try:
        with SessionLocal() as db:
            transcriptions = db.query(Transcription).all()

            total_transcriptions = len(transcriptions)
            words_captured = 0
            for t in transcriptions:
                text = t.polished_text or t.raw_text or ""
                words_captured += len([w for w in text.split() if w])

            time_saved_minutes = round(words_captured / 40)

            return {
                "totalTranscriptions": total_transcriptions,
                "wordsCaptured": words_captured,
                "timeSavedMinutes": time_saved_minutes
            }
    except Exception as e:
        print(f"[ERROR] Error getting stats: {e}")
        raise HTTPException(500, f"Failed to get stats: {str(e)}")


@router.delete("/api/transcriptions/{transcription_id}")
async def delete_transcription(transcription_id: int):
    """Delete a transcription"""
    try:
        with SessionLocal() as db:
            t = db.query(Transcription).filter(
                Transcription.id == transcription_id
            ).first()
            if t:
                db.delete(t)
                db.commit()
                print(f"[*] Deleted transcription #{transcription_id}")
                return {"status": "deleted"}
            return {"error": "Not found"}
    except Exception as e:
        return {"error": str(e)}


@router.post("/api/transcriptions/{transcription_id}/reprocess")
async def reprocess_transcription(
    transcription_id: int,
    mode_id: Optional[int] = None
):
    """
    Reprocess an existing transcription through a different mode.
    This re-runs the text through the processing pipeline with the specified mode.
    """
    try:
        with SessionLocal() as db:
            # Get the original transcription
            transcription = db.query(Transcription).filter(
                Transcription.id == transcription_id
            ).first()

            if not transcription:
                raise HTTPException(404, "Transcription not found")

            # Get the mode
            mode = None
            if mode_id:
                mode_obj = db.query(Mode).filter(Mode.id == mode_id).first()
                if mode_obj:
                    mode = mode_obj.to_dict()

            # Start from raw text
            raw_text = transcription.raw_text
            if not raw_text:
                raise HTTPException(400, "No raw text available for reprocessing")

            # Process through pipeline
            polished_text = raw_text

            # Check mode settings
            use_cleanup = mode.get("use_cleanup", True) if mode else True
            use_dictionary = mode.get("use_dictionary", True) if mode else True
            use_snippets = mode.get("use_snippets", True) if mode else True
            use_ai_polish = mode.get("use_ai_polish", True) if mode else True

            # Step 1: Text cleanup
            if use_cleanup:
                polished_text = text_cleanup_service.process(polished_text)

            # Step 2: Apply personal dictionary
            if use_dictionary:
                dictionary = dictionary_service.get_dictionary()
                polished_text = dictionary_service.apply_dictionary(polished_text, dictionary)

            # Step 3: Apply snippets
            if use_snippets:
                polished_text, _ = snippet_service.apply_snippets(polished_text)

            # Step 4: AI polish with mode
            command_type = "none"
            if use_ai_polish and ai_polish_service.is_configured():
                result = await ai_polish_service.polish_with_mode(
                    text=polished_text,
                    mode=mode,
                    selected_text=None,
                    clipboard_text=None,
                    app_context=AppContext.GENERAL
                )
                if result["success"]:
                    polished_text = result["polished_text"]
                    command_type = result.get("command_type", "none")

            # Create new transcription record with reprocessed text
            new_transcription = Transcription(
                raw_text=raw_text,
                polished_text=polished_text,
                duration=transcription.duration,
                mode_id=mode_id,
                mode_name=mode.get("name") if mode else None
            )
            db.add(new_transcription)
            db.commit()
            db.refresh(new_transcription)

            print(f"[REPROCESS] Transcription #{transcription_id} -> #{new_transcription.id} (mode: {mode.get('name') if mode else 'default'})")

            return {
                "id": new_transcription.id,
                "raw_text": new_transcription.raw_text,
                "polished_text": new_transcription.polished_text,
                "mode_name": new_transcription.mode_name,
                "command_type": command_type,
                "created_at": new_transcription.created_at.isoformat() if new_transcription.created_at else None
            }

    except HTTPException:
        raise
    except Exception as e:
        print(f"[ERROR] Reprocess error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(500, f"Reprocessing failed: {str(e)}")
