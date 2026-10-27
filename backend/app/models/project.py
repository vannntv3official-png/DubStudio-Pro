import uuid
from datetime import datetime
from sqlalchemy import String, Integer, Float, DateTime, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database.session import Base


class ProjectModel(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    project_dir: Mapped[str] = mapped_column(Text, nullable=False)
    schema_version: Mapped[str] = mapped_column(String(32), default="1.0.0")
    source_language: Mapped[str | None] = mapped_column(String(32), nullable=True)
    target_language: Mapped[str | None] = mapped_column(String(32), nullable=True)
    duration_ms: Mapped[int] = mapped_column(Integer, default=0)
    sync_mode: Mapped[str] = mapped_column(String(32), default="balanced")
    audio_settings: Mapped[dict] = mapped_column(
        JSON,
        default=lambda: {
            "originalVolume": 1.0,
            "dubbedVolume": 1.0,
            "backgroundVolume": 0.3,
            "duckingEnabled": True,
            "duckingAttenuationDb": -14,
        },
    )
    subtitle_style: Mapped[dict] = mapped_column(
        JSON,
        default=lambda: {
            "fontFamily": "Kantumruy Pro, sans-serif",
            "fontSize": 24,
            "fontWeight": "600",
            "textColor": "#FFFFFF",
            "outlineColor": "#000000",
            "outlineThickness": 2,
            "shadowColor": "rgba(0, 0, 0, 0.7)",
            "shadowBlur": 4,
            "backgroundColor": "transparent",
            "alignment": "bottom",
            "verticalMargin": 48,
            "horizontalMargin": 32,
            "lineHeight": 1.4,
        },
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_opened_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
