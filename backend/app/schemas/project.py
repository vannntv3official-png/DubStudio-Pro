from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict
from pydantic.alias_generators import to_camel


class SubtitleStyleSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, alias_generator=to_camel)

    font_family: str = "Kantumruy Pro, sans-serif"
    font_size: int = 24
    font_weight: str = "600"
    text_color: str = "#FFFFFF"
    outline_color: str = "#000000"
    outline_thickness: float = 2.0
    shadow_color: str = "rgba(0, 0, 0, 0.7)"
    shadow_blur: int = 4
    background_color: str = "transparent"
    background_padding: int = 0
    border_radius: int = 0
    alignment: str = "bottom"
    vertical_margin: int = 48
    horizontal_margin: int = 32
    line_height: float = 1.4
    preset_id: str | None = None
    animation: str = "none"
    karaoke_enabled: bool = False
    karaoke_style: str = "bounce-pop"
    karaoke_active_color: str = "#FFE600"
    karaoke_inactive_color: str = "#FFFFFF"
    karaoke_active_scale: float = 1.15
    karaoke_active_bg: str = "transparent"


class AudioSettingsSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, alias_generator=to_camel)

    original_volume: float = 1.0
    dubbed_volume: float = 1.0
    background_volume: float = 0.3
    ducking_enabled: bool = True
    ducking_attenuation_db: float = -14.0


class ProjectCreate(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, alias_generator=to_camel)

    name: str = Field(..., min_length=1, max_length=255)
    source_language: str | None = "en"
    target_language: str | None = "km"
    sync_mode: str = "balanced"


class ProjectUpdate(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, alias_generator=to_camel)

    name: str | None = None
    source_language: str | None = None
    target_language: str | None = None
    sync_mode: str | None = None
    duration_ms: int | None = None
    audio_settings: AudioSettingsSchema | None = None
    subtitle_style: SubtitleStyleSchema | None = None


class ProjectResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, alias_generator=to_camel)

    id: str
    name: str
    project_dir: str
    schema_version: str = "1.0.0"
    source_language: str | None = None
    target_language: str | None = None
    duration_ms: int = 0
    sync_mode: str = "balanced"
    audio_settings: AudioSettingsSchema
    subtitle_style: SubtitleStyleSchema
    created_at: datetime
    updated_at: datetime
    last_opened_at: datetime
