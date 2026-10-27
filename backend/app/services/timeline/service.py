import uuid
from pathlib import Path
from sqlalchemy import select, delete
from app.database.session import get_project_engine, GlobalAsyncSessionLocal
from app.models.project import ProjectModel
from app.models.timeline import TimelineTrackModel, TimelineClipModel
from app.schemas.timeline import TimelineTrackSchema, TimelineClipSchema, TimelineStateResponse


class TimelineService:
    @staticmethod
    async def get_timeline(project_id: str) -> TimelineStateResponse:
        async with GlobalAsyncSessionLocal() as g_session:
            project = await g_session.get(ProjectModel, project_id)
            if not project:
                raise ValueError("Project not found")

        project_dir = Path(project.project_dir)
        _, session_maker = get_project_engine(project_dir)

        async with session_maker() as session:
            # Tracks ordered by index
            stmt = select(TimelineTrackModel).where(TimelineTrackModel.project_id == project_id).order_by(TimelineTrackModel.index)
            res = await session.execute(stmt)
            tracks = res.scalars().all()

            # Clips
            c_stmt = select(TimelineClipModel).where(TimelineClipModel.project_id == project_id).order_by(TimelineClipModel.start_ms)
            c_res = await session.execute(c_stmt)
            clips = c_res.scalars().all()

            clips_by_track: dict[str, list[TimelineClipSchema]] = {t.id: [] for t in tracks}
            for c in clips:
                if c.track_id in clips_by_track:
                    track_clips = clips_by_track[c.track_id]
                    clip_schema = TimelineClipSchema(
                        id=c.id,
                        trackId=c.track_id,
                        projectId=c.project_id,
                        sourceId=c.source_id,
                        label=c.label,
                        startMs=c.start_ms,
                        durationMs=c.duration_ms,
                        sourceOffsetMs=c.source_offset_ms,
                        playbackRate=c.playback_rate,
                        volume=c.volume,
                        muted=c.muted,
                        locked=c.locked,
                        color=c.color,
                        metadata=c.metadata_json,
                    )
                    # Automatically heal stacked duplicates at identical start times
                    if track_clips and track_clips[-1].startMs == c.start_ms:
                        track_clips[-1] = clip_schema
                    else:
                        track_clips.append(clip_schema)

            track_schemas = [
                TimelineTrackSchema(
                    id=t.id,
                    projectId=t.project_id,
                    type=t.type,
                    name=t.name,
                    index=t.index,
                    muted=t.muted,
                    solo=t.solo,
                    locked=t.locked,
                    volume=t.volume,
                    clips=clips_by_track.get(t.id, []),
                )
                for t in tracks
            ]

            return TimelineStateResponse(
                projectId=project_id,
                durationMs=project.duration_ms,
                tracks=track_schemas,
            )

    @staticmethod
    async def save_timeline(project_id: str, tracks_data: list[TimelineTrackSchema]) -> TimelineStateResponse:
        async with GlobalAsyncSessionLocal() as g_session:
            project = await g_session.get(ProjectModel, project_id)
            if not project:
                raise ValueError("Project not found")

        project_dir = Path(project.project_dir)
        _, session_maker = get_project_engine(project_dir)

        async with session_maker() as session:
            # Update tracks and clips
            for t_in in tracks_data:
                db_track = await session.get(TimelineTrackModel, t_in.id)
                if db_track:
                    db_track.muted = t_in.muted
                    db_track.solo = t_in.solo
                    db_track.locked = t_in.locked
                    db_track.volume = t_in.volume
                    db_track.name = t_in.name

                # Synchronize clips on track
                await session.execute(
                    delete(TimelineClipModel).where(
                        TimelineClipModel.track_id == t_in.id,
                        TimelineClipModel.project_id == project_id
                    )
                )

                for c_in in t_in.clips:
                    clip_model = TimelineClipModel(
                        id=c_in.id or str(uuid.uuid4()),
                        track_id=t_in.id,
                        project_id=project_id,
                        source_id=c_in.sourceId,
                        label=c_in.label,
                        start_ms=c_in.startMs,
                        duration_ms=c_in.durationMs,
                        source_offset_ms=c_in.sourceOffsetMs,
                        playback_rate=c_in.playbackRate,
                        volume=c_in.volume,
                        muted=c_in.muted,
                        locked=c_in.locked,
                        color=c_in.color,
                        metadata_json=c_in.metadata or {},
                    )
                    session.add(clip_model)

            await session.commit()

        return await TimelineService.get_timeline(project_id)
