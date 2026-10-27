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
    source_language: str
    target_language: str


class TranslationProvider(Protocol):
    async def translate(
        self,
        segments: list[dict[str, Any]],
        source_language: str,
        target_language: str,
        options: dict[str, Any] | None = None,
    ) -> list[TranslationResultItem]:
        ...
