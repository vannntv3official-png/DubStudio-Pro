import uuid
import shutil
from datetime import datetime, timezone
from pathlib import Path
from fastapi import APIRouter, HTTPException, status
from starlette.responses import FileResponse
from sqlalchemy import select
from app.database.session import get_project_engine, GlobalAsyncSessionLocal
from app.models.project import ProjectModel
from app.models.media import MediaAssetModel
from app.models.timeline import TimelineTrackModel, TimelineClipModel
from app.schemas.media import MediaImportRequest, MediaAssetResponse
from app.services.media.probe import probe_media_file
from app.services.media.waveform import generate_audio_peaks
from app.services.media.thumbnail import generate_media_thumbnails
from app.utils.ffmpeg import extract_audio_wav
from app.utils.file_io import make_project_relative
from app.jobs.manager import job_manager

router = APIRouter(prefix="/media", tags=["media"])


@router.post("/import", response_model=MediaAssetResponse)
async def import_media(req: MediaImportRequest):
    src_path = Path(req.file_path)
    if not src_path.exists():
        raise HTTPException(status_code=404, detail=f"Source file not found: {req.file_path}")

    async with GlobalAsyncSessionLocal() as g_session:
        project = await g_session.get(ProjectModel, req.project_id)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

    project_dir = Path(project.project_dir)
    _, session_maker = get_project_engine(project_dir)

    # Copy or link source file into media/source/
    dest_video_path = project_dir / "media" / "source" / src_path.name
    if src_path.resolve() != dest_video_path.resolve():
        shutil.copy2(src_path, dest_video_path)

    # Probe metadata
    metadata = await probe_media_file(dest_video_path)

    # Extract audio WAV
    audio_wav_path = project_dir / "media" / "audio" / f"{src_path.stem}_audio.wav"
    await extract_audio_wav(dest_video_path, audio_wav_path)

    # Generate waveform peaks JSON
    peaks_path = project_dir / "waveform-cache" / f"{src_path.stem}_peaks.json"
    generate_audio_peaks(audio_wav_path, peaks_path, num_peaks=1200)

    # Generate thumbnails
    thumb_dir = project_dir / "thumbnails"
    thumbs = await generate_media_thumbnails(dest_video_path, thumb_dir, duration_sec=metadata.duration_ms / 1000.0)
    primary_thumb = thumbs[0] if thumbs else None

    # Save MediaAssetModel
    asset_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    rel_path = make_project_relative(project_dir, dest_video_path)

    async with session_maker() as session:
        asset = MediaAssetModel(
            id=asset_id,
            project_id=req.project_id,
            filename=dest_video_path.name,
            file_path=str(dest_video_path.resolve()),
            relative_path=rel_path,
            file_size_bytes=dest_video_path.stat().st_size,
            duration_ms=metadata.duration_ms,
            metadata_json=metadata.model_dump(),
            extracted_audio_path=str(audio_wav_path.resolve()),
            waveform_path=str(peaks_path.resolve()),
            thumbnail_path=primary_thumb,
            created_at=now,
        )
        session.add(asset)

        # Place initial video and original audio clips into timeline
        v_track = (await session.execute(
            select(TimelineTrackModel).where(
                TimelineTrackModel.project_id == req.project_id,
                TimelineTrackModel.type == "video"
            )
        )).scalar_one_or_none()

        a_track = (await session.execute(
            select(TimelineTrackModel).where(
                TimelineTrackModel.project_id == req.project_id,
                TimelineTrackModel.type == "original_audio"
            )
        )).scalar_one_or_none()

        if v_track:
            v_clip = TimelineClipModel(
                id=str(uuid.uuid4()),
                track_id=v_track.id,
                project_id=req.project_id,
                source_id=asset.id,
                label=dest_video_path.name,
                start_ms=0,
                duration_ms=metadata.duration_ms,
                playback_rate=1.0,
                volume=1.0,
                color="#2563EB",
            )
            session.add(v_clip)

        if a_track:
            a_clip = TimelineClipModel(
                id=str(uuid.uuid4()),
                track_id=a_track.id,
                project_id=req.project_id,
                source_id=asset.id,
                label=f"{dest_video_path.stem} Audio",
                start_ms=0,
                duration_ms=metadata.duration_ms,
                playback_rate=1.0,
                volume=0.2,
                color="#059669",
            )
            session.add(a_clip)

        await session.commit()
        await session.refresh(asset)

    # Update project duration in global DB
    async with GlobalAsyncSessionLocal() as g_session:
        proj_to_update = await g_session.get(ProjectModel, req.project_id)
        if proj_to_update:
            proj_to_update.duration_ms = metadata.duration_ms
            await g_session.commit()

    return MediaAssetResponse(
        id=asset.id,
        projectId=asset.project_id,
        filename=asset.filename,
        filePath=asset.file_path,
        relativePath=asset.relative_path,
        fileSizeBytes=asset.file_size_bytes,
        durationMs=asset.duration_ms,
        metadata=metadata,
        extractedAudioPath=asset.extracted_audio_path,
        waveformPath=asset.waveform_path,
        thumbnailPath=asset.thumbnail_path,
        createdAt=asset.created_at,
    )


@router.get("/{project_id}", response_model=list[MediaAssetResponse])
async def get_project_media(project_id: str):
    async with GlobalAsyncSessionLocal() as g_session:
        project = await g_session.get(ProjectModel, project_id)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

    project_dir = Path(project.project_dir)
    _, session_maker = get_project_engine(project_dir)

    async with session_maker() as session:
        stmt = select(MediaAssetModel).where(MediaAssetModel.project_id == project_id)
        res = await session.execute(stmt)
        assets = res.scalars().all()
        return [
            MediaAssetResponse(
                id=a.id,
                projectId=a.project_id,
                filename=a.filename,
                filePath=a.file_path,
                relativePath=a.relative_path,
                fileSizeBytes=a.file_size_bytes,
                durationMs=a.duration_ms,
                metadata=a.metadata_json,
                extractedAudioPath=a.extracted_audio_path,
                waveformPath=a.waveform_path,
                thumbnailPath=a.thumbnail_path,
                createdAt=a.created_at,
            )
            for a in assets
        ]


@router.get("/stream/{media_id}")
async def stream_media_asset(media_id: str):
    """Streams a media asset video or audio file with HTTP Range support."""
    async with GlobalAsyncSessionLocal() as g_session:
        projects = (await g_session.execute(select(ProjectModel))).scalars().all()

    for proj in projects:
        project_dir = Path(proj.project_dir)
        if not project_dir.exists():
            continue
        try:
            _, session_maker = get_project_engine(project_dir)
            async with session_maker() as session:
                asset = await session.get(MediaAssetModel, media_id)
                if asset and asset.file_path and Path(asset.file_path).exists():
                    file_path = Path(asset.file_path)
                    mime_type = "video/mp4"
                    ext = file_path.suffix.lower()
                    if ext == ".webm":
                        mime_type = "video/webm"
                    elif ext == ".mov":
                        mime_type = "video/quicktime"
                    elif ext == ".mkv":
                        mime_type = "video/x-matroska"
                    elif ext == ".mp3":
                        mime_type = "audio/mpeg"
                    elif ext == ".wav":
                        mime_type = "audio/wav"
                    return FileResponse(
                        path=file_path,
                        media_type=mime_type,
                        filename=asset.filename,
                        headers={"Accept-Ranges": "bytes"},
                    )
        except Exception:
            continue

    raise HTTPException(status_code=404, detail="Media asset not found on disk")


@router.get("/stream-file")
async def stream_media_by_path(path: str):
    """Streams any local media file directly with HTTP Range support."""
    p = Path(path)
    if not p.exists():
        raise HTTPException(status_code=404, detail="File not found")
    mime_type = "video/mp4"
    ext = p.suffix.lower()
    if ext == ".webm":
        mime_type = "video/webm"
    elif ext == ".mov":
        mime_type = "video/quicktime"
    elif ext == ".mkv":
        mime_type = "video/x-matroska"
    elif ext == ".mp3":
        mime_type = "audio/mpeg"
    elif ext == ".wav":
        mime_type = "audio/wav"
    return FileResponse(path=p, media_type=mime_type, filename=p.name, headers={"Accept-Ranges": "bytes"})
