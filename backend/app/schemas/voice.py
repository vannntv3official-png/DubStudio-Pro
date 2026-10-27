from datetime import datetime
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class VoiceProfileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, alias_generator=to_camel)

    id: str
    name: str
    display_name: str
    gender: str
    locale: str
    language_name: str
    suggested_codec: str | None = None
    sample_rate: int | None = None


class SpeakerSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, alias_generator=to_camel)

    id: str
    project_id: str
    name: str
    color: str = "#3B82F6"
    voice_id: str | None = None
    tts_provider: str = "edge_tts"
    rate: str = "+0%"
    pitch: str = "+0Hz"
    volume: str = "+0%"


class GeneratedAudioResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, alias_generator=to_camel)

    id: str
    project_id: str
    segment_id: str
    translation_id: str
    voice_id: str
    original_duration_ms: int
    raw_duration_ms: int
    aligned_duration_ms: int
    speed_factor: float
    audio_path: str
    aligned_audio_path: str
    sync_mode: str
    status: str
    created_at: datetime


class TTSJobRequest(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, alias_generator=to_camel)

    project_id: str
    voice_id: str | None = None
    rate: str = "+0%"
    pitch: str = "+0Hz"
    volume: str = "+0%"
    segment_ids: list[str] | None = None
    sync_mode: str | None = None


class VoicePreviewRequest(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, alias_generator=to_camel)

    voice_id: str
    text: str = "Hello, this is a preview of the selected voice for DubStudio AI."
    rate: str = "+0%"
    pitch: str = "+0Hz"
    volume: str = "+0%"
