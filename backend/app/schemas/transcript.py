from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict
from pydantic.alias_generators import to_camel


class WordTimingSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, alias_generator=to_camel)

    word: str
    start_ms: int
    end_ms: int
    confidence: float | None = None


class TranscriptSegmentCreate(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, alias_generator=to_camel)

    start_ms: int
    end_ms: int
    text: str
    speaker_id: str = "speaker_1"
    language: str = "en"
    confidence: float | None = None
    words: list[WordTimingSchema] = []


class TranscriptSegmentUpdate(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, alias_generator=to_camel)

    start_ms: int | None = None
    end_ms: int | None = None
    text: str | None = None
    speaker_id: str | None = None
    language: str | None = None
    confidence: float | None = None
    words: list[WordTimingSchema] | None = None
    status: str | None = None


class TranscriptSegmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, alias_generator=to_camel)

    id: str
    project_id: str
    start_ms: int
    end_ms: int
    text: str
    speaker_id: str
    language: str
    confidence: float | None = None
    words: list[WordTimingSchema] = []
    status: str
    created_at: datetime
    updated_at: datetime


class TranscriptionJobRequest(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, alias_generator=to_camel)

    project_id: str
    media_asset_id: str
    provider: str = "gemini"
    model: str | None = None
    source_language: str | None = None


class TranscriptSplitRequest(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, alias_generator=to_camel)

    segment_id: str
    split_time_ms: int
    project_id: str | None = None


class TranscriptMergeRequest(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, alias_generator=to_camel)

    segment_ids: list[str] = Field(..., min_length=2)
    project_id: str | None = None
