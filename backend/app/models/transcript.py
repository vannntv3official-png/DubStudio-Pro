import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Integer, Float, DateTime, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column
from app.database.session import Base


class TranscriptSegmentModel(Base):
    __tablename__ = "transcript_segments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    start_ms: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    end_ms: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    speaker_id: Mapped[str] = mapped_column(String(64), default="speaker_1")
    language: Mapped[str] = mapped_column(String(32), default="en")
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    words: Mapped[list | None] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(32), default="completed")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
