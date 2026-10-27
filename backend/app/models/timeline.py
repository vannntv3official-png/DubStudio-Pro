import uuid
from sqlalchemy import String, Integer, Float, Boolean, JSON, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from app.database.session import Base


class TimelineTrackModel(Base):
    __tablename__ = "timeline_tracks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    type: Mapped[str] = mapped_column(String(32), nullable=False)  # video, original_audio, dubbed_voice, background_audio, subtitles
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    index: Mapped[int] = mapped_column(Integer, default=0)
    muted: Mapped[bool] = mapped_column(Boolean, default=False)
    solo: Mapped[bool] = mapped_column(Boolean, default=False)
    locked: Mapped[bool] = mapped_column(Boolean, default=False)
    volume: Mapped[float] = mapped_column(Float, default=1.0)


class TimelineClipModel(Base):
    __tablename__ = "timeline_clips"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    track_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    project_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    source_id: Mapped[str] = mapped_column(String(36), nullable=False)
    label: Mapped[str] = mapped_column(String(255), default="")
    start_ms: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    duration_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    source_offset_ms: Mapped[int] = mapped_column(Integer, default=0)
    playback_rate: Mapped[float] = mapped_column(Float, default=1.0)
    volume: Mapped[float] = mapped_column(Float, default=1.0)
    muted: Mapped[bool] = mapped_column(Boolean, default=False)
    locked: Mapped[bool] = mapped_column(Boolean, default=False)
    color: Mapped[str | None] = mapped_column(String(32), nullable=True)
    metadata_json: Mapped[dict | None] = mapped_column(JSON, default=dict)
