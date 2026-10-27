import uuid
from datetime import datetime
from sqlalchemy import String, Integer, Float, DateTime, Text
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
    aligned_duration_ms: Mapped[int] = mapped_column(Integer, default=0)
    speed_factor: Mapped[float] = mapped_column(Float, default=1.0)
    audio_path: Mapped[str] = mapped_column(Text, nullable=False)
    aligned_audio_path: Mapped[str] = mapped_column(Text, nullable=False)
    sync_mode: Mapped[str] = mapped_column(String(32), default="balanced")
    status: Mapped[str] = mapped_column(String(32), default="aligned")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
