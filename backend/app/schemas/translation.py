from datetime import datetime
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class TranslationSegmentCreate(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, alias_generator=to_camel)

    segment_id: str
    source_text: str
    translated_text: str
    spoken_script: str | None = None
    subtitle_text: str | None = None
    pronunciation_text: str | None = None
    source_language: str = "en"
    target_language: str = "km"
    provider: str = "gemini"
    model: str = "gemini-2.5-flash"
    approval_status: str = "draft"
    review_reasons: list[str] | None = None
    context_notes: str | None = None
    form_of_address: str | None = None
    dubbing_register: str | None = None


class TranslationSegmentUpdate(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, alias_generator=to_camel)

    translated_text: str | None = None
    spoken_script: str | None = None
    subtitle_text: str | None = None
    pronunciation_text: str | None = None
    approval_status: str | None = None
    review_reasons: list[str] | None = None
    context_notes: str | None = None
    form_of_address: str | None = None
    dubbing_register: str | None = None
    status: str | None = None
    is_manually_edited: bool = True


class TranslationSegmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, alias_generator=to_camel)

    id: str
    project_id: str
    segment_id: str
    source_text: str
    translated_text: str
    spoken_script: str | None = None
    subtitle_text: str | None = None
    pronunciation_text: str | None = None
    source_language: str
    target_language: str
    provider: str
    model: str
    status: str
    approval_status: str = "draft"
    review_reasons: list[str] | None = None
    context_notes: str | None = None
    form_of_address: str | None = None
    dubbing_register: str | None = None

    is_manually_edited: bool
    created_at: datetime
    updated_at: datetime


class TranslationJobRequest(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, alias_generator=to_camel)

    project_id: str
    provider: str = "gemini"
    model: str | None = None
    source_language: str = "en"
    target_language: str = "km"
    dubbing_register: str = "natural"
    glossary: dict[str, str] | None = None
    character_memory: dict[str, str] | None = None
    preserve_proper_nouns: bool = True

