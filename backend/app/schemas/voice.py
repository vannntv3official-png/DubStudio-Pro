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
    gender: str | None = None
    age_group: str | None = None
    relationship_role: str | None = None
    preferred_form_of_address: str | None = None
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
    measured_duration_ms: int = 0
    aligned_duration_ms: int
    timing_budget_ms: int = 0
    speed_factor: float
    tempo_factor: float = 1.0
    audio_path: str
    aligned_audio_path: str
    sync_mode: str
    status: str
    take_number: int = 1
    is_current: bool = True
    review_status: str = "generated"
    review_reasons: list[str] | None = None
    revision_attempts: int = 0
    pronunciation_text_used: str | None = None
    stale: bool = False
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
