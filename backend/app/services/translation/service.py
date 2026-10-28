import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from sqlalchemy import select
from app.database.session import get_project_engine, GlobalAsyncSessionLocal
from app.models.project import ProjectModel
from app.models.transcript import TranscriptSegmentModel
from app.models.translation import TranslationSegmentModel
from app.models.setting import SettingModel
from app.models.speaker import SpeakerModel
from app.services.translation.context import DialogueContextBuilder
from app.services.khmer.pronunciation import prepare_khmer_pronunciation
from app.providers.gemini.provider import GeminiProvider
from app.providers.codecraft.provider import CodecraftProvider
from app.schemas.translation import TranslationSegmentResponse, TranslationSegmentUpdate
from app.utils.file_io import atomic_write_json

logger = logging.getLogger("dubstudio.services.translation")



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

            # Fetch speakers
            sp_stmt = select(SpeakerModel).where(SpeakerModel.project_id == project_id)
            sp_res = await session.execute(sp_stmt)
            speakers = {s.id: s for s in sp_res.scalars().all()}

            # Check existing translations to preserve manual edits and approvals
            ex_stmt = select(TranslationSegmentModel).where(TranslationSegmentModel.project_id == project_id)
            ex_res = await session.execute(ex_stmt)
            existing_map = {t.segment_id: t for t in ex_res.scalars().all()}

            # Auto-detect actual source language script from transcripts if set to 'en' or 'auto'
            from app.services.khmer.localization_guard import detect_text_language
            effective_source_lang = source_language
            if not effective_source_lang or effective_source_lang.lower() in ("auto", "detect", "auto-detect", "en"):
                sample_texts = [t.text for t in transcripts[:20]]
                detected = detect_text_language(sample_texts, fallback=source_language or "en")
                if detected != "en" or effective_source_lang.lower() in ("auto", "detect", "auto-detect"):
                    effective_source_lang = detected

            # Build structured dialogue context
            project_context = DialogueContextBuilder.build_context(
                project_id=project_id,
                transcripts=transcripts,
                speakers=speakers,
                existing_translations=existing_map,
                glossary=glossary or (project.glossary if hasattr(project, "glossary") else None) or {},
                character_memory=project.character_memory if hasattr(project, "character_memory") else None,
                dubbing_register=getattr(project, "dubbing_register", "natural"),
                source_language=effective_source_lang,
                target_language=target_language,
            )

            # Partition into bounded batches
            unapproved_turns = [
                t for t in project_context.turns
                if not (existing_map.get(t.segment_id) and existing_map[t.segment_id].is_manually_edited)
            ]

            if on_progress:
                on_progress(15.0, f"Initializing {provider_name.capitalize()} for {effective_source_lang} -> {target_language} translation...")

            t_lookup: dict[str, Any] = {}

            if unapproved_turns:
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
                    raise ValueError(f"Unknown translation provider: {provider_name}")

                # Translate in bounded batches of 12 turns
                batch_size = 12
                total_batches = (len(unapproved_turns) + batch_size - 1) // batch_size
                for b_idx in range(total_batches):
                    batch_turns = unapproved_turns[b_idx * batch_size : (b_idx + 1) * batch_size]
                    if on_progress:
                        pct = 20.0 + (b_idx / max(1, total_batches)) * 55.0
                        on_progress(pct, f"Translating batch {b_idx + 1}/{total_batches} ({len(batch_turns)} turns)...")

                    payload_segments = [
                        {
                            "id": turn.segment_id,
                            "text": turn.text,
                            "speaker_id": turn.speaker_id,
                            "speaker_name": turn.speaker_name,
                            "duration_sec": turn.duration_sec,
                            "preceding": turn.preceding_turns,
                            "following": turn.following_turns,
                            "preferred_address": turn.preferred_address,
                        }
                        for turn in batch_turns
                    ]

                    translated_results = await provider.translate(
                        segments=payload_segments,
                        source_language=effective_source_lang,
                        target_language=target_language,
                        options={
                            "glossary": project_context.glossary,
                            "character_memory": project_context.character_memory,
                            "dubbing_register": project_context.dubbing_register,
                        },
                    )

                    for r in translated_results:
                        t_lookup[r.segment_id] = r

            if on_progress:
                on_progress(80.0, "Updating project translations & phonetic preparation...")

            now = datetime.now(timezone.utc)
            all_translations = []

            for t in transcripts:
                ex = existing_map.get(t.id)
                res_item = t_lookup.get(t.id)

                if ex:
                    if not ex.is_manually_edited and res_item:
                        ex.translated_text = res_item.translated_text
                        ex.spoken_script = res_item.spoken_script
                        ex.subtitle_text = res_item.subtitle_text
                        ex.pronunciation_text = prepare_khmer_pronunciation(
                            res_item.spoken_script,
                            overrides=getattr(project, "pronunciation_overrides", None)
                        )
                        ex.approval_status = "needs_review" if res_item.review_reasons else "generated"
                        ex.review_reasons = res_item.review_reasons
                        ex.form_of_address = res_item.form_of_address
                        ex.dubbing_register = res_item.dubbing_register
                        ex.provider = provider_name
                        ex.model = model_name or "default"
                        ex.source_language = source_language
                        ex.target_language = target_language
                        ex.updated_at = now
                    all_translations.append(ex)
                else:
                    t_text = res_item.translated_text if res_item else t.text
                    sp_script = res_item.spoken_script if res_item else t_text
                    sub_text = res_item.subtitle_text if res_item else t_text
                    rev_reasons = res_item.review_reasons if res_item else []
                    pron_text = prepare_khmer_pronunciation(
                        sp_script,
                        overrides=getattr(project, "pronunciation_overrides", None)
                    )

                    new_t = TranslationSegmentModel(
                        id=str(uuid.uuid4()),
                        project_id=project_id,
                        segment_id=t.id,
                        source_text=t.text,
                        translated_text=t_text,
                        spoken_script=sp_script,
                        subtitle_text=sub_text,
                        pronunciation_text=pron_text,
                        source_language=source_language,
                        target_language=target_language,
                        provider=provider_name,
                        model=model_name or "default",
                        status="completed",
                        approval_status="needs_review" if rev_reasons else "generated",
                        review_reasons=rev_reasons,
                        form_of_address=res_item.form_of_address if res_item else None,
                        dubbing_register=res_item.dubbing_register if res_item else project_context.dubbing_register,
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
                    "spoken_script": getattr(item, "spoken_script", item.translated_text),
                    "subtitle_text": getattr(item, "subtitle_text", item.translated_text),
                    "pronunciation_text": getattr(item, "pronunciation_text", None),
                    "approval_status": getattr(item, "approval_status", "draft"),
                    "review_reasons": getattr(item, "review_reasons", []),
                    "form_of_address": getattr(item, "form_of_address", None),
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

            if data.translated_text is not None:
                t.translated_text = data.translated_text
            if data.spoken_script is not None:
                t.spoken_script = data.spoken_script
                # Re-prepare pronunciation for TTS
                t.pronunciation_text = prepare_khmer_pronunciation(
                    data.spoken_script,
                    overrides=getattr(project, "pronunciation_overrides", None)
                )
            if data.subtitle_text is not None:
                t.subtitle_text = data.subtitle_text
            if data.pronunciation_text is not None:
                t.pronunciation_text = data.pronunciation_text
            if data.approval_status is not None:
                t.approval_status = data.approval_status
            if data.review_reasons is not None:
                t.review_reasons = data.review_reasons
            if data.context_notes is not None:
                t.context_notes = data.context_notes
            if data.form_of_address is not None:
                t.form_of_address = data.form_of_address
            if data.dubbing_register is not None:
                t.dubbing_register = data.dubbing_register
            if data.status is not None:
                t.status = data.status

            if data.is_manually_edited is not None:
                t.is_manually_edited = data.is_manually_edited
            t.updated_at = datetime.now(timezone.utc)

            # Mark existing generated audios as stale if text was modified
            from app.models.voice import GeneratedAudioModel
            gen_stmt = select(GeneratedAudioModel).where(
                GeneratedAudioModel.project_id == project_id,
                GeneratedAudioModel.segment_id == t.segment_id
            )
            gen_res = await session.execute(gen_stmt)
            for gen in gen_res.scalars().all():
                gen.stale = True

            await session.commit()
            await session.refresh(t)
            return TranslationSegmentResponse.model_validate(t)

