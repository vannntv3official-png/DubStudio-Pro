from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class TimelineClipSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, alias_generator=to_camel)

    id: str
    track_id: str
    project_id: str
    source_id: str
    label: str
    start_ms: int
    duration_ms: int
    source_offset_ms: int = 0
    playback_rate: float = 1.0
    volume: float = 1.0
    muted: bool = False
    locked: bool = False
    color: str | None = None
    metadata: dict | None = None


class TimelineTrackSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, alias_generator=to_camel)

    id: str
    project_id: str
    type: str  # video, original_audio, dubbed_voice, background_audio, subtitles
    name: str
    index: int = 0
    muted: bool = False
    solo: bool = False
    locked: bool = False
    volume: float = 1.0
    clips: list[TimelineClipSchema] = []


class TimelineStateResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, alias_generator=to_camel)

    project_id: str
    duration_ms: int
    tracks: list[TimelineTrackSchema]


class TimelineUpdateRequest(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, alias_generator=to_camel)

    tracks: list[TimelineTrackSchema]
