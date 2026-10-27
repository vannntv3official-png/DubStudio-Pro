from datetime import datetime
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class ExportConfigSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, alias_generator=to_camel)

    project_id: str
    resolution: str = "1080p"
    video_codec: str = "h264"
    audio_codec: str = "aac"
    fps: float | None = None
    video_bitrate: str = "6000k"
    audio_bitrate: str = "192k"
    output_file_path: str
    burn_in_subtitles: bool = True
    export_subtitles_sidecar: bool = False
    subtitles_sidecar_format: str = "srt"
    include_original_audio: bool = True
    original_audio_volume: float = 0.2
    dubbed_audio_volume: float = 1.0
    background_music_volume: float = 0.3


class ExportJobResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, alias_generator=to_camel)

    id: str
    project_id: str
    status: str
    progress: float
    current_stage: str
    output_path: str | None = None
    error: str | None = None
    created_at: datetime
    completed_at: datetime | None = None
