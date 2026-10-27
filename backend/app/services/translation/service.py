import uuid
from datetime import datetime
from pathlib import Path
from sqlalchemy import select
from app.database.session import get_project_engine, GlobalAsyncSessionLocal
from app.models.project import ProjectModel
from app.models.transcript import TranscriptSegmentModel
from app.models.translation import TranslationSegmentModel
from app.models.setting import SettingModel
from app.providers.gemini.provider import GeminiProvider
from app.providers.codecraft.provider import CodecraftProvider
from app.schemas.translation import TranslationSegmentResponse, TranslationSegmentUpdate
from app.utils.file_io import atomic_write_json


class TranslationService:
    @staticmethod
    async def run_translation(
        project_id: str,
        provider_name: str = "gemini",
        model_name: str | None = None,
        source_language: str = "en",
        target_language: str = "km",
        glossary: dict[str, str] | None = None,
        on_progress=None,
    ) -> list[TranslationSegmentResponse]:
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
            # Fetch all transcript segments
            stmt = select(TranscriptSegmentModel).where(TranscriptSegmentModel.project_id == project_id).order_by(TranscriptSegmentModel.start_ms)
            res = await session.execute(stmt)
            transcripts = res.scalars().all()
            if not transcripts:
                raise ValueError("No transcript segments found to translate. Please transcribe audio first.")

            # Check existing translations to preserve manual edits
            ex_stmt = select(TranslationSegmentModel).where(TranslationSegmentModel.project_id == project_id)
            ex_res = await session.execute(ex_stmt)
            existing_map = {t.segment_id: t for t in ex_res.scalars().all()}

            # Filter segments that need AI translation (not manually edited)
            to_translate = []
            for t in transcripts:
                ex = existing_map.get(t.id)
                if not ex or not ex.is_manually_edited:
                    dur_sec = round(max(0.4, (t.end_ms - t.start_ms) / 1000.0), 2)
                    to_translate.append({
                        "id": t.id,
                        "text": t.text,
                        "speaker_id": t.speaker_id,
                        "duration_sec": dur_sec,
                    })

            if on_progress:
                on_progress(15.0, f"Initializing {provider_name.capitalize()} for {source_language} -> {target_language} translation...")

            if to_translate:
                if provider_name.lower() == "gemini":
                    resolved_model = model_name or (gemini_model.value if gemini_model and gemini_model.value else None) or "gemini-2.5-flash"
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
                    raise ValueError(f"Unknown translation provider: {provider_name}")

                if on_progress:
                    on_progress(40.0, f"Translating {len(to_translate)} dialogue segments...")

                translated_results = await provider.translate(
                    segments=to_translate,
                    source_language=source_language,
                    target_language=target_language,
                    options={"glossary": glossary or {}},
                )
                t_lookup = {r.segment_id: r.translated_text for r in translated_results}
            else:
                t_lookup = {}

            if on_progress:
                on_progress(80.0, "Updating project translations...")

            now = datetime.utcnow()
            all_translations = []

            for t in transcripts:
                ex = existing_map.get(t.id)
                if ex:
                    if not ex.is_manually_edited and t.id in t_lookup:
                        ex.translated_text = t_lookup[t.id]
                        ex.provider = provider_name
                        ex.model = model_name or "default"
                        ex.source_language = source_language
                        ex.target_language = target_language
                        ex.updated_at = now
                    all_translations.append(ex)
                else:
                    new_t = TranslationSegmentModel(
                        id=str(uuid.uuid4()),
                        project_id=project_id,
                        segment_id=t.id,
                        source_text=t.text,
                        translated_text=t_lookup.get(t.id, t.text),
                        source_language=source_language,
                        target_language=target_language,
                        provider=provider_name,
                        model=model_name or "default",
                        status="completed",
                        is_manually_edited=False,
                        created_at=now,
                        updated_at=now,
                    )
                    session.add(new_t)
                    all_translations.append(new_t)

            await session.commit()
            for item in all_translations:
                await session.refresh(item)

            # Export to translations/translation.json
            export_path = project_dir / "translations" / "translation.json"
            export_data = [
                {
                    "id": item.id,
                    "segment_id": item.segment_id,
                    "source_text": item.source_text,
                    "translated_text": item.translated_text,
                    "source_language": item.source_language,
                    "target_language": item.target_language,
                    "provider": item.provider,
                    "is_manually_edited": item.is_manually_edited,
                }
                for item in all_translations
            ]
            atomic_write_json(export_path, export_data)

            # Auto-synchronize project subtitles with new translated text
            try:
                from app.services.subtitles.service import SubtitleService
                await SubtitleService.sync_from_translations(project_id)
            except Exception as sub_err:
                logger.warning(f"Could not auto-sync subtitles from translations: {sub_err}")

            if on_progress:
                on_progress(100.0, f"Translation completed ({len(all_translations)} segments).")

            return [TranslationSegmentResponse.model_validate(item) for item in all_translations]

    @staticmethod
    async def get_translations(project_id: str) -> list[TranslationSegmentResponse]:
        async with GlobalAsyncSessionLocal() as g_session:
            project = await g_session.get(ProjectModel, project_id)
            if not project:
                return []

        project_dir = Path(project.project_dir)
        _, session_maker = get_project_engine(project_dir)
        async with session_maker() as session:
            stmt = select(TranslationSegmentModel).where(TranslationSegmentModel.project_id == project_id)
            res = await session.execute(stmt)
            items = res.scalars().all()
            return [TranslationSegmentResponse.model_validate(i) for i in items]

    @staticmethod
    async def update_translation(project_id: str, translation_id: str, data: TranslationSegmentUpdate) -> TranslationSegmentResponse:
        async with GlobalAsyncSessionLocal() as g_session:
            project = await g_session.get(ProjectModel, project_id)
            if not project:
                raise ValueError("Project not found")

        project_dir = Path(project.project_dir)
        _, session_maker = get_project_engine(project_dir)
        async with session_maker() as session:
            t = await session.get(TranslationSegmentModel, translation_id)
            if not t:
                raise ValueError("Translation segment not found")

            if data.translatedText is not None:
                t.translated_text = data.translatedText
            if data.status is not None:
                t.status = data.status
            t.is_manually_edited = data.isManuallyEdited
            t.updated_at = datetime.utcnow()

            await session.commit()
            await session.refresh(t)
            return TranslationSegmentResponse.model_validate(t)
