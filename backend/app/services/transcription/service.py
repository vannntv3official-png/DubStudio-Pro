import re
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from sqlalchemy import select, delete
from app.database.session import get_project_engine
from app.models.project import ProjectModel
from app.models.media import MediaAssetModel
from app.models.transcript import TranscriptSegmentModel
from app.models.setting import SettingModel
from app.providers.gemini.provider import GeminiProvider
from app.providers.codecraft.provider import CodecraftProvider
from app.providers.base import TranscriptResultItem
from app.schemas.transcript import TranscriptSegmentResponse, TranscriptSplitRequest, TranscriptMergeRequest
from app.utils.file_io import atomic_write_json


def split_segment_by_breath(seg: TranscriptResultItem) -> list[TranscriptResultItem]:
    """Splits a single long transcript segment into natural short breath phrases with accurate timestamps."""
    text = seg.text.strip()
    if not text:
        return [seg]

    # Split by spaces / tokens
    tokens = [t for t in re.split(r"[\s\u200b]+", text) if t]
    if len(tokens) <= 6 and not any(p in text for p in ["។", ".", "?", "!", ";"]):
        return [seg]

    total_dur = max(100, seg.end_ms - seg.start_ms)
    per_token_dur = total_dur / max(1, len(tokens))

    chunks: list[list[str]] = []
    cur_chunk: list[str] = []

    for i, tok in enumerate(tokens):
        cur_chunk.append(tok)
        has_punct = bool(re.search(r"[។\.\?!,;]$", tok))
        is_conjunction = bool(re.match(r"^(ហើយ|ដែល|ពេល|នៅពេល|ប៉ុន្តែ|តែ|ព្រោះ|ពីព្រោះ|ថា)$", tok))
        is_hard_limit = len(cur_chunk) >= 5
        is_soft_limit = len(cur_chunk) >= 3 and is_conjunction

        if has_punct or is_hard_limit or is_soft_limit or i == len(tokens) - 1:
            if cur_chunk:
                chunks.append(cur_chunk)
                cur_chunk = []

    if len(chunks) <= 1:
        return [seg]

    sub_segments: list[TranscriptResultItem] = []
    current_offset_ms = seg.start_ms

    for chunk in chunks:
        chunk_text = " ".join(chunk)
        chunk_dur = int(len(chunk) * per_token_dur)
        start_ms = current_offset_ms
        end_ms = min(seg.end_ms, current_offset_ms + chunk_dur)
        current_offset_ms = end_ms

        # Build word timings for this chunk
        chunk_words = []
        w_dur = (end_ms - start_ms) / max(1, len(chunk))
        for wi, w in enumerate(chunk):
            chunk_words.append({
                "word": w,
                "start_ms": int(start_ms + wi * w_dur),
                "end_ms": int(start_ms + (wi + 1) * w_dur),
                "confidence": 1.0,
            })

        sub_segments.append(
            TranscriptResultItem(
                start_ms=start_ms,
                end_ms=end_ms,
                text=chunk_text,
                speaker_id=seg.speaker_id,
                language=seg.language,
                confidence=seg.confidence,
                words=chunk_words,
            )
        )

    # Ensure last sub_segment reaches seg.end_ms
    if sub_segments:
        sub_segments[-1].end_ms = seg.end_ms

    return sub_segments


class TranscriptionService:
    @staticmethod
    async def get_provider_key(session, key_name: str) -> str | None:
        setting = await session.get(SettingModel, key_name)
        return setting.value if setting else None

    @staticmethod
    async def run_transcription(
        project_id: str,
        media_asset_id: str,
        provider_name: str = "gemini",
        model_name: str | None = None,
        source_language: str | None = None,
        on_progress=None,
    ) -> list[TranscriptSegmentResponse]:
        from app.database.session import GlobalAsyncSessionLocal

        # Retrieve project and settings
        async with GlobalAsyncSessionLocal() as g_session:
            project = await g_session.get(ProjectModel, project_id)
            if not project:
                raise ValueError("Project not found")

            gemini_key = await g_session.get(SettingModel, "gemini_api_key")
            gemini_keys_setting = await g_session.get(SettingModel, "gemini_api_keys")
            gemini_model = await g_session.get(SettingModel, "gemini_model")
            codecraft_key = await g_session.get(SettingModel, "codecraft_api_key")
            codecraft_base = await g_session.get(SettingModel, "codecraft_base_url")
            codecraft_model = await g_session.get(SettingModel, "codecraft_model")

        project_dir = Path(project.project_dir)
        _, session_maker = get_project_engine(project_dir)

        async with session_maker() as session:
            media = await session.get(MediaAssetModel, media_asset_id)
            if not media or not media.extracted_audio_path:
                raise ValueError("Extracted audio not found for media asset")

            audio_path = Path(media.extracted_audio_path)

            if on_progress:
                on_progress(10.0, f"Initializing {provider_name.capitalize()} speech recognition...")

            if provider_name.lower() == "gemini":
                resolved_model = model_name or (gemini_model.value if gemini_model and gemini_model.value else None) or "gemini-3.5-flash"
                if resolved_model in ("gemini-2.5-flash", "gemini-2.5-pro", "gemini-flash-latest", "gemini-2.5-flash-lite"):
                    resolved_model = "gemini-3.5-flash"
                provider = GeminiProvider(
                    api_key=gemini_key.value if gemini_key else None,
                    api_keys=gemini_keys_setting.value if gemini_keys_setting else None,
                    model=resolved_model,
                )
            elif provider_name.lower() == "codecraft":
                resolved_model = model_name or (codecraft_model.value if codecraft_model and codecraft_model.value else None) or "deepseek-chat"
                provider = CodecraftProvider(
                    api_key=codecraft_key.value if codecraft_key else None,
                    base_url=codecraft_base.value if codecraft_base else "https://codecraftapi.com/v1",
                    model=resolved_model,
                )
            else:
                raise ValueError(f"Unknown transcription provider: {provider_name}")

            if on_progress:
                on_progress(30.0, f"Analyzing audio and transcribing spoken dialogue...")

            results = await provider.transcribe(
                audio_path=str(audio_path.resolve()),
                source_language=source_language,
            )

            # Post-process into natural breath groups with accurate timestamps
            processed_results: list[TranscriptResultItem] = []
            for r in results:
                processed_results.extend(split_segment_by_breath(r))
            results = processed_results

            if on_progress:
                on_progress(75.0, "Storing transcript segments into project database...")

            # Clear previous segments for fresh run
            await session.execute(delete(TranscriptSegmentModel).where(TranscriptSegmentModel.project_id == project_id))

            created_segments = []
            now = datetime.now(timezone.utc)
            for r in results:
                seg = TranscriptSegmentModel(
                    id=str(uuid.uuid4()),
                    project_id=project_id,
                    start_ms=r.start_ms,
                    end_ms=r.end_ms,
                    text=r.text,
                    speaker_id=r.speaker_id,
                    language=r.language,
                    confidence=r.confidence,
                    words=r.words or [],
                    status="completed",
                    created_at=now,
                    updated_at=now,
                )
                session.add(seg)
                created_segments.append(seg)

            await session.commit()

            # Refresh models
            for s in created_segments:
                await session.refresh(s)

            # Export to transcripts/transcript.json
            export_path = project_dir / "transcripts" / "transcript.json"
            export_data = [
                {
                    "id": s.id,
                    "start_ms": s.start_ms,
                    "end_ms": s.end_ms,
                    "text": s.text,
                    "speaker_id": s.speaker_id,
                    "language": s.language,
                    "confidence": s.confidence,
                    "words": s.words,
                    "status": s.status,
                }
                for s in created_segments
            ]
            atomic_write_json(export_path, export_data)

            # Auto-sync initial subtitles if none exist yet
            try:
                from app.services.subtitles.service import SubtitleService
                await SubtitleService.sync_from_transcripts_if_empty(project_id)
            except Exception as sub_err:
                logger.warning(f"Could not auto-sync subtitles from transcripts: {sub_err}")

            if on_progress:
                on_progress(100.0, f"Transcription completed. {len(created_segments)} segments generated.")

            return [TranscriptSegmentResponse.model_validate(s) for s in created_segments]

    @staticmethod
    async def get_segments(project_id: str) -> list[TranscriptSegmentResponse]:
        from app.database.session import GlobalAsyncSessionLocal
        async with GlobalAsyncSessionLocal() as g_session:
            project = await g_session.get(ProjectModel, project_id)
            if not project:
                return []

        project_dir = Path(project.project_dir)
        _, session_maker = get_project_engine(project_dir)
        async with session_maker() as session:
            stmt = select(TranscriptSegmentModel).where(TranscriptSegmentModel.project_id == project_id).order_by(TranscriptSegmentModel.start_ms)
            res = await session.execute(stmt)
            segments = res.scalars().all()
            return [TranscriptSegmentResponse.model_validate(s) for s in segments]

    @staticmethod
    async def split_segment(project_id: str, req: TranscriptSplitRequest) -> list[TranscriptSegmentResponse]:
        from app.database.session import GlobalAsyncSessionLocal
        async with GlobalAsyncSessionLocal() as g_session:
            project = await g_session.get(ProjectModel, project_id)
            if not project:
                raise ValueError("Project not found")

        project_dir = Path(project.project_dir)
        _, session_maker = get_project_engine(project_dir)
        async with session_maker() as session:
            seg = await session.get(TranscriptSegmentModel, req.segmentId)
            if not seg:
                raise ValueError("Segment not found")

            if req.splitTimeMs <= seg.start_ms or req.splitTimeMs >= seg.end_ms:
                raise ValueError("Split time must be between segment start and end")

            # Word approximation or middle split
            words = seg.text.split()
            mid = max(1, len(words) // 2)
            first_text = " ".join(words[:mid])
            second_text = " ".join(words[mid:])

            old_end = seg.end_ms
            seg.end_ms = req.splitTimeMs
            seg.text = first_text
            seg.status = "edited"
            seg.updated_at = datetime.now(timezone.utc)

            new_seg = TranscriptSegmentModel(
                id=str(uuid.uuid4()),
                project_id=project_id,
                start_ms=req.splitTimeMs,
                end_ms=old_end,
                text=second_text,
                speaker_id=seg.speaker_id,
                language=seg.language,
                status="edited",
                created_at=datetime.now(timezone.utc),
                updated_at=datetime.now(timezone.utc),
            )
            session.add(new_seg)
            await session.commit()

        return await TranscriptionService.get_segments(project_id)

    @staticmethod
    async def merge_segments(project_id: str, req: TranscriptMergeRequest) -> list[TranscriptSegmentResponse]:
        from app.database.session import GlobalAsyncSessionLocal
        async with GlobalAsyncSessionLocal() as g_session:
            project = await g_session.get(ProjectModel, project_id)
            if not project:
                raise ValueError("Project not found")

        project_dir = Path(project.project_dir)
        _, session_maker = get_project_engine(project_dir)
        async with session_maker() as session:
            stmt = select(TranscriptSegmentModel).where(TranscriptSegmentModel.id.in_(req.segmentIds)).order_by(TranscriptSegmentModel.start_ms)
            res = await session.execute(stmt)
            segments = res.scalars().all()
            if len(segments) < 2:
                raise ValueError("At least two valid segments required for merge")

            first = segments[0]
            last = segments[-1]
            merged_text = " ".join(s.text.strip() for s in segments)
            first.end_ms = last.end_ms
            first.text = merged_text
            first.status = "edited"
            first.updated_at = datetime.now(timezone.utc)

            for s in segments[1:]:
                await session.delete(s)

            await session.commit()

        return await TranscriptionService.get_segments(project_id)
