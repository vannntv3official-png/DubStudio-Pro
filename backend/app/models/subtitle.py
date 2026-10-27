import uuid
from sqlalchemy import String, Integer, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column
from app.database.session import Base


class SubtitleItemModel(Base):
    __tablename__ = "subtitle_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    start_ms: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    end_ms: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    speaker_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    style_override: Mapped[dict | None] = mapped_column(JSON, nullable=True)
