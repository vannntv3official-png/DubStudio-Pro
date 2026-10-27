from pathlib import Path
from fastapi import APIRouter, Query
from fastapi.responses import FileResponse
from app.core.config import settings
from app.providers.edge_tts.provider import EdgeTTSProvider
from app.schemas.voice import VoiceProfileResponse, VoicePreviewRequest

router = APIRouter(prefix="/voices", tags=["voices"])


@router.get("", response_model=list[VoiceProfileResponse])
async def list_voices(locale: str | None = Query(None)):
    voices = await EdgeTTSProvider.list_voices()
    if locale:
        loc_lower = locale.lower()
        voices = [v for v in voices if loc_lower in v["locale"].lower()]
    return [VoiceProfileResponse.model_validate(v) for v in voices]


@router.post("/preview")
async def preview_voice(req: VoicePreviewRequest):
    preview_file = settings.TEMP_DIR / f"preview_{req.voice_id.replace(':', '_')}.wav"
    await EdgeTTSProvider.generate_speech(
        text=req.text,
        output_path=preview_file,
        voice_id=req.voice_id,
        rate=req.rate,
        pitch=req.pitch,
        volume=req.volume,
    )
    return FileResponse(preview_file, media_type="audio/wav")
