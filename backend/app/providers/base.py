from typing import Protocol, Any
from pydantic import BaseModel


class TranscriptResultItem(BaseModel):
    id: str | None = None
    start_ms: int
    end_ms: int
    text: str
    speaker_id: str = "speaker_1"
    language: str = "en"
    confidence: float | None = None
    words: list[dict[str, Any]] = []


class TranscriptionProvider(Protocol):
    async def transcribe(
        self,
        audio_path: str,
        source_language: str | None = None,
        options: dict[str, Any] | None = None,
    ) -> list[TranscriptResultItem]:
        ...


class TranslationResultItem(BaseModel):
    segment_id: str
    source_text: str
    translated_text: str
    spoken_script: str
    subtitle_text: str
    source_language: str
    target_language: str
    form_of_address: str | None = None
    dubbing_register: str | None = None
    review_reasons: list[str] = []


class TTSProviderCapability(BaseModel):
    provider_name: str = "edge_tts"
    supports_rate: bool = True
    supports_pitch: bool = True
    supports_volume: bool = True
    supports_ssml_emotion: bool = False
    supports_phoneme_control: bool = False
    supports_precise_duration: bool = False
    supported_emotions: list[str] = []


class TranslationProvider(Protocol):
    async def translate(
        self,
        segments: list[dict[str, Any]],
        source_language: str,
        target_language: str,
        options: dict[str, Any] | None = None,
    ) -> list[TranslationResultItem]:
        ...

