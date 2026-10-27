import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Integer, Float, DateTime, Text, Boolean, JSON
from sqlalchemy.orm import Mapped, mapped_column
from app.database.session import Base


class GeneratedAudioModel(Base):
    __tablename__ = "generated_audios"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    segment_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    translation_id: Mapped[str] = mapped_column(String(36), nullable=False)
    voice_id: Mapped[str] = mapped_column(String(128), nullable=False)
    original_duration_ms: Mapped[int] = mapped_column(Integer, default=0)
    raw_duration_ms: Mapped[int] = mapped_column(Integer, default=0)
    measured_duration_ms: Mapped[int] = mapped_column(Integer, default=0)
    aligned_duration_ms: Mapped[int] = mapped_column(Integer, default=0)
    timing_budget_ms: Mapped[int] = mapped_column(Integer, default=0)
    speed_factor: Mapped[float] = mapped_column(Float, default=1.0)
    tempo_factor: Mapped[float] = mapped_column(Float, default=1.0)
    audio_path: Mapped[str] = mapped_column(Text, nullable=False)
    aligned_audio_path: Mapped[str] = mapped_column(Text, nullable=False)
    sync_mode: Mapped[str] = mapped_column(String(32), default="balanced")
    status: Mapped[str] = mapped_column(String(32), default="aligned")
    take_number: Mapped[int] = mapped_column(Integer, default=1)
    is_current: Mapped[bool] = mapped_column(Boolean, default=True)
    review_status: Mapped[str] = mapped_column(String(32), default="generated")
    review_reasons: Mapped[list | None] = mapped_column(JSON, default=list)
    revision_attempts: Mapped[int] = mapped_column(Integer, default=0)
    pronunciation_text_used: Mapped[str | None] = mapped_column(Text, nullable=True)
    stale: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

