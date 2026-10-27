from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class AIProviderSettingsSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, alias_generator=to_camel)

    gemini_api_key: str = ""
    gemini_api_keys: list[str] = []
    gemini_model: str = "gemini-2.5-flash"
    codecraft_api_key: str = ""
    codecraft_base_url: str = "https://codecraftapi.com/v1"
    codecraft_model: str = "deepseek-chat"
    default_transcription_provider: str = "gemini"
    default_translation_provider: str = "gemini"
    default_tts_provider: str = "edge_tts"
    request_timeout_seconds: int = 60
    retry_attempts: int = 3


class AppSettingsSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, alias_generator=to_camel)

    theme: str = "dark"
    accent_color: str = "#3B82F6"
    ai_providers: AIProviderSettingsSchema = AIProviderSettingsSchema()
    default_export_path: str = ""
    projects_dir: str = ""
    temp_dir: str = ""
    hardware_acceleration: bool = True
    auto_save_interval_seconds: int = 30
    snap_sensitivity_px: int = 10


class TestConnectionRequest(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, alias_generator=to_camel)

    provider: str  # gemini or codecraft
    api_key: str = ""
    api_keys: list[str] = []
    base_url: str | None = None
    model: str | None = None


class TestConnectionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, alias_generator=to_camel)

    success: bool
    message: str
    models: list[str] = []
