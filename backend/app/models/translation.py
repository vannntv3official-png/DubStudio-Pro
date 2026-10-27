import uuid
from datetime import datetime
from sqlalchemy import String, Boolean, DateTime, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column
from app.database.session import Base


class TranslationSegmentModel(Base):
    __tablename__ = "translation_segments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    segment_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    source_text: Mapped[str] = mapped_column(Text, nullable=False)
    translated_text: Mapped[str] = mapped_column(Text, nullable=False)
    spoken_script: Mapped[str | None] = mapped_column(Text, nullable=True)
    subtitle_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    pronunciation_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_language: Mapped[str] = mapped_column(String(32), default="en")
    target_language: Mapped[str] = mapped_column(String(32), default="km")
    provider: Mapped[str] = mapped_column(String(64), default="gemini")
    model: Mapped[str] = mapped_column(String(128), default="gemini-3.5-flash")
    status: Mapped[str] = mapped_column(String(32), default="completed")
    approval_status: Mapped[str] = mapped_column(String(32), default="draft")
    review_reasons: Mapped[list | None] = mapped_column(JSON, default=list)
    context_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    form_of_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
    dubbing_register: Mapped[str | None] = mapped_column(String(32), nullable=True)
    is_manually_edited: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

