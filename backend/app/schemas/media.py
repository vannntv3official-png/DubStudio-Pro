from datetime import datetime
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class VideoStreamMeta(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, alias_generator=to_camel)

    index: int
    codec: str
    width: int
    height: int
    fps: float
    duration_ms: int
    bitrate: int | None = None
    aspect_ratio: str | None = None


class AudioStreamMeta(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, alias_generator=to_camel)

    index: int
    codec: str
    channels: int
    sample_rate: int
    duration_ms: int
    bitrate: int | None = None


class MediaMetadata(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, alias_generator=to_camel)

    format_name: str
    duration_ms: int
    size_bytes: int
    bitrate: int
    video: VideoStreamMeta | None = None
    audio: AudioStreamMeta | None = None


class MediaAssetResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, alias_generator=to_camel)

    id: str
    project_id: str
    filename: str
    file_path: str
    relative_path: str
    file_size_bytes: int
    duration_ms: int
    metadata: MediaMetadata
    extracted_audio_path: str | None = None
    waveform_path: str | None = None
    thumbnail_path: str | None = None
    created_at: datetime


class MediaImportRequest(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, alias_generator=to_camel)

    project_id: str
    file_path: str
