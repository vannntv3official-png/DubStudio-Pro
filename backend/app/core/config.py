import os
from pathlib import Path
from pydantic import Field, AliasChoices
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    APP_NAME: str = "DubStudio AI"
    APP_VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"

    # Server settings
    HOST: str = Field(default="127.0.0.1", validation_alias=AliasChoices("DUBSTUDIO_BACKEND_HOST", "HOST"))
    PORT: int = Field(default=8765, validation_alias=AliasChoices("DUBSTUDIO_BACKEND_PORT", "PORT"))
    AUTH_TOKEN: str = Field(default="dev_secret_token_12345", validation_alias=AliasChoices("DUBSTUDIO_AUTH_TOKEN", "AUTH_TOKEN"))

    # Base storage directory
    BASE_DIR: Path = Path(os.getenv("APPDATA", Path.home())) / "DubStudioAI"
    PROJECTS_DIR: Path = BASE_DIR / "Projects"
    TEMP_DIR: Path = BASE_DIR / "Temp"
    GLOBAL_DATABASE_URL: str = f"sqlite+aiosqlite:///{BASE_DIR}/global_app.sqlite"

    # External AI defaults
    GEMINI_API_KEY: str | None = None
    GEMINI_DEFAULT_MODEL: str = "gemini-2.5-flash"
    CODECRAFT_API_KEY: str | None = None
    CODECRAFT_BASE_URL: str = "https://codecraftapi.com/v1"
    CODECRAFT_DEFAULT_MODEL: str = "deepseek-chat"

    # Concurrency and limits
    MAX_CONCURRENT_JOBS: int = 4
    FFMPEG_TIMEOUT_SECONDS: int = 1800

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    def init_directories(self) -> None:
        self.BASE_DIR.mkdir(parents=True, exist_ok=True)
        self.PROJECTS_DIR.mkdir(parents=True, exist_ok=True)
        self.TEMP_DIR.mkdir(parents=True, exist_ok=True)


settings = Settings()
settings.init_directories()
