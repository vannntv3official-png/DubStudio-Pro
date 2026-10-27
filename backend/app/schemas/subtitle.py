from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel
from app.schemas.project import SubtitleStyleSchema


class SubtitleItemSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, alias_generator=to_camel)

    id: str
    project_id: str
    start_ms: int
    end_ms: int
    text: str
    speaker_id: str | None = None
    words: list[dict] | None = None
    style_override: dict | None = None


class SubtitleStateResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, alias_generator=to_camel)

    project_id: str
    style: SubtitleStyleSchema
    items: list[SubtitleItemSchema]


class SubtitleImportRequest(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, alias_generator=to_camel)

    project_id: str
    content: str
    format: str = "srt"  # srt or vtt
