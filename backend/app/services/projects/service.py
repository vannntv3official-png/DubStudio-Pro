import uuid
from datetime import datetime, timezone
from pathlib import Path
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import settings
from app.database.session import init_project_db, get_project_engine, GlobalAsyncSessionLocal
from app.models.project import ProjectModel
from app.models.timeline import TimelineTrackModel
from app.models.setting import SettingModel
from app.schemas.project import ProjectCreate, ProjectUpdate, ProjectResponse
from app.utils.file_io import atomic_write_json


class ProjectService:
    @staticmethod
    def scaffold_project_directories(project_dir: Path) -> dict[str, Path]:
        dirs = {
            "root": project_dir,
            "media_source": project_dir / "media" / "source",
            "media_audio": project_dir / "media" / "audio",
            "media_generated": project_dir / "media" / "generated",
            "transcripts": project_dir / "transcripts",
            "translations": project_dir / "translations",
            "subtitles": project_dir / "subtitles",
            "thumbnails": project_dir / "thumbnails",
            "waveform_cache": project_dir / "waveform-cache",
            "preview_cache": project_dir / "preview-cache",
            "exports": project_dir / "exports",
            "logs": project_dir / "logs",
        }
        for d in dirs.values():
            d.mkdir(parents=True, exist_ok=True)
        return dirs

    @staticmethod
    async def create_project(data: ProjectCreate) -> ProjectResponse:
        project_id = str(uuid.uuid4())
        safe_name = "".join(c for c in data.name if c.isalnum() or c in (" ", "-", "_")).strip() or "Untitled Project"
        project_dir = settings.PROJECTS_DIR / f"{safe_name}_{project_id[:8]}"
        ProjectService.scaffold_project_directories(project_dir)

        # Initialize SQLite inside project dir
        await init_project_db(project_dir)
        _, session_maker = get_project_engine(project_dir)

        now = datetime.now(timezone.utc)
        model = ProjectModel(
            id=project_id,
            name=data.name,
            project_dir=str(project_dir.resolve()),
            schema_version="1.0.0",
            source_language=data.source_language,
            target_language=data.target_language,
            duration_ms=0,
            sync_mode=data.sync_mode,
            created_at=now,
            updated_at=now,
            last_opened_at=now,
        )

        async with session_maker() as session:
            session.add(model)
            # Create default 5 timeline tracks
            tracks = [
                TimelineTrackModel(project_id=project_id, type="video", name="Video", index=0),
                TimelineTrackModel(project_id=project_id, type="original_audio", name="Original Audio", index=1, volume=0.2),
                TimelineTrackModel(project_id=project_id, type="dubbed_voice", name="Dubbed Voice", index=2, volume=1.0),
                TimelineTrackModel(project_id=project_id, type="background_audio", name="Background Audio", index=3, volume=0.3),
                TimelineTrackModel(project_id=project_id, type="subtitles", name="Subtitles", index=4),
            ]
            session.add_all(tracks)
            await session.commit()
            await session.refresh(model)

        # Write project manifest JSON
        manifest_path = project_dir / "project.json"
        manifest_data = {
            "id": model.id,
            "schemaVersion": model.schema_version,
            "name": model.name,
            "projectDir": model.project_dir,
            "sourceLanguage": model.source_language,
            "targetLanguage": model.target_language,
            "durationMs": model.duration_ms,
            "syncMode": model.sync_mode,
            "audioSettings": model.audio_settings,
            "subtitleStyle": model.subtitle_style,
            "createdAt": model.created_at.isoformat(),
            "updatedAt": model.updated_at.isoformat(),
            "lastOpenedAt": model.last_opened_at.isoformat(),
        }
        atomic_write_json(manifest_path, manifest_data)

        # Record in global DB
        async with GlobalAsyncSessionLocal() as g_session:
            g_model = ProjectModel(
                id=project_id,
                name=data.name,
                project_dir=str(project_dir.resolve()),
                schema_version="1.0.0",
                source_language=data.source_language,
                target_language=data.target_language,
                duration_ms=0,
                sync_mode=data.sync_mode,
                created_at=now,
                updated_at=now,
                last_opened_at=now,
            )
            g_session.add(g_model)
            await g_session.commit()

        return ProjectResponse.model_validate(model)

    @staticmethod
    async def list_recent_projects() -> list[ProjectResponse]:
        async with GlobalAsyncSessionLocal() as session:
            stmt = select(ProjectModel).order_by(desc(ProjectModel.last_opened_at)).limit(20)
            res = await session.execute(stmt)
            projects = res.scalars().all()
            return [ProjectResponse.model_validate(p) for p in projects]

    @staticmethod
    async def get_project(project_id: str) -> ProjectResponse | None:
        async with GlobalAsyncSessionLocal() as session:
            p = await session.get(ProjectModel, project_id)
            if not p:
                return None
            p.last_opened_at = datetime.now(timezone.utc)
            await session.commit()
            return ProjectResponse.model_validate(p)

    @staticmethod
    async def update_project(project_id: str, data: ProjectUpdate) -> ProjectResponse | None:
        async with GlobalAsyncSessionLocal() as session:
            p = await session.get(ProjectModel, project_id)
            if not p:
                return None

            if data.name is not None:
                p.name = data.name
            if data.source_language is not None:
                p.source_language = data.source_language
            if data.target_language is not None:
                p.target_language = data.target_language
            if data.sync_mode is not None:
                p.sync_mode = data.sync_mode
            if data.duration_ms is not None:
                p.duration_ms = data.duration_ms
            if data.audio_settings is not None:
                p.audio_settings = data.audio_settings.model_dump()
            if data.subtitle_style is not None:
                p.subtitle_style = data.subtitle_style.model_dump()

            p.updated_at = datetime.now(timezone.utc)
            await session.commit()
            await session.refresh(p)

            # Sync project.json
            project_dir = Path(p.project_dir)
            manifest_path = project_dir / "project.json"
            if manifest_path.parent.exists():
                manifest_data = {
                    "id": p.id,
                    "schemaVersion": p.schema_version,
                    "name": p.name,
                    "projectDir": p.project_dir,
                    "sourceLanguage": p.source_language,
                    "targetLanguage": p.target_language,
                    "durationMs": p.duration_ms,
                    "syncMode": p.sync_mode,
                    "audioSettings": p.audio_settings,
                    "subtitleStyle": p.subtitle_style,
                    "createdAt": p.created_at.isoformat(),
                    "updatedAt": p.updated_at.isoformat(),
                    "lastOpenedAt": p.last_opened_at.isoformat(),
                }
                atomic_write_json(manifest_path, manifest_data)

            return ProjectResponse.model_validate(p)
