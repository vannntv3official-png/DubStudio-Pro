import uuid
from datetime import datetime
from sqlalchemy import String, Boolean, DateTime, Text
from sqlalchemy.orm import Mapped, mapped_column
from app.database.session import Base


class TranslationSegmentModel(Base):
    __tablename__ = "translation_segments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    segment_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    source_text: Mapped[str] = mapped_column(Text, nullable=False)
    translated_text: Mapped[str] = mapped_column(Text, nullable=False)
    source_language: Mapped[str] = mapped_column(String(32), default="en")
    target_language: Mapped[str] = mapped_column(String(32), default="km")
    provider: Mapped[str] = mapped_column(String(64), default="gemini")
    model: Mapped[str] = mapped_column(String(128), default="gemini-2.5-flash")
    status: Mapped[str] = mapped_column(String(32), default="completed")
    is_manually_edited: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
