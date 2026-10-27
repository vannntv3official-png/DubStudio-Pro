import uuid
from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column
from app.database.session import Base


class SpeakerModel(Base):
    __tablename__ = "speakers"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    project_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(128), default="Speaker")
    color: Mapped[str] = mapped_column(String(32), default="#3B82F6")
    voice_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    tts_provider: Mapped[str] = mapped_column(String(64), default="edge_tts")
    rate: Mapped[str] = mapped_column(String(16), default="+0%")
    pitch: Mapped[str] = mapped_column(String(16), default="+0Hz")
    volume: Mapped[str] = mapped_column(String(16), default="+0%")
