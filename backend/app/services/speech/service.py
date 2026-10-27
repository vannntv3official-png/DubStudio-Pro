import uuid
from datetime import datetime
from pathlib import Path
from sqlalchemy import select, delete
from app.database.session import get_project_engine, GlobalAsyncSessionLocal
from app.models.project import ProjectModel
from app.models.transcript import TranscriptSegmentModel
from app.models.translation import TranslationSegmentModel
from app.models.speaker import SpeakerModel
from app.models.voice import GeneratedAudioModel
from app.models.timeline import TimelineTrackModel, TimelineClipModel
from app.models.subtitle import SubtitleItemModel
from app.services.subtitles.service import deoverlap_subtitles
from app.providers.edge_tts.provider import EdgeTTSProvider
from app.schemas.voice import GeneratedAudioResponse
from app.utils.ffmpeg import adjust_audio_speed_and_pad


class SpeechAndAlignmentService:
    @staticmethod
    async def run_batch_speech_and_alignment(
        project_id: str,
        voice_id: str | None = None,
        rate: str = "+0%",
        pitch: str = "+0Hz",
        volume: str = "+0%",
        segment_ids: list[str] | None = None,
        sync_mode: str | None = None,
        on_progress=None,
    ) -> list[GeneratedAudioResponse]:
        async with GlobalAsyncSessionLocal() as g_session:
            project = await g_session.get(ProjectModel, project_id)
            if not project:
                raise ValueError("Project not found")

        project_dir = Path(project.project_dir)
        _, session_maker = get_project_engine(project_dir)

        # Determine target voice
        target_lang = project.target_language or "km"
        if not voice_id:
            voice_id = await EdgeTTSProvider.get_default_voice_for_locale(target_lang)

        chosen_sync_mode = sync_mode or project.sync_mode or "balanced"

        async with session_maker() as session:
            # Load transcript segments sorted chronologically
            t_stmt = select(TranscriptSegmentModel).where(TranscriptSegmentModel.project_id == project_id).order_by(TranscriptSegmentModel.start_ms)
            t_res = await session.execute(t_stmt)
            ordered_transcripts = t_res.scalars().all()
            transcripts = {t.id: t for t in ordered_transcripts}
            seg_id_to_idx = {t.id: i for i, t in enumerate(ordered_transcripts)}

            # Load translations
            tr_stmt = select(TranslationSegmentModel).where(TranslationSegmentModel.project_id == project_id)
            tr_res = await session.execute(tr_stmt)
            translations = {tr.segment_id: tr for tr in tr_res.scalars().all()}

            if not translations:
                raise ValueError("No translations found. Please translate transcript first.")

            # Load speaker profiles
            sp_stmt = select(SpeakerModel).where(SpeakerModel.project_id == project_id)
            sp_res = await session.execute(sp_stmt)
            speakers = {s.id: s for s in sp_res.scalars().all()}

            # Dubbed voice timeline track
            trk_stmt = select(TimelineTrackModel).where(
                TimelineTrackModel.project_id == project_id,
                TimelineTrackModel.type == "dubbed_voice"
            )
            trk_res = await session.execute(trk_stmt)
            dub_track = trk_res.scalar_one_or_none()

            # Target segments
            target_t_ids = segment_ids if segment_ids else list(transcripts.keys())
            total = len(target_t_ids)

            generated_list: list[GeneratedAudioModel] = []
            now = datetime.utcnow()

            for idx, seg_id in enumerate(target_t_ids):
                t_seg = transcripts.get(seg_id)
                tr_seg = translations.get(seg_id)
                if not t_seg or not tr_seg:
                    continue

                if on_progress:
                    pct = 10.0 + (idx / max(1, total)) * 80.0
                    on_progress(pct, f"Generating & synchronizing speech ({idx + 1}/{total})...")

                # Resolve speaker voice
                sp = speakers.get(t_seg.speaker_id)
                seg_voice = (sp.voice_id if sp and sp.voice_id else voice_id) or voice_id
                seg_rate = (sp.rate if sp and sp.rate else rate) or rate
                seg_pitch = (sp.pitch if sp and sp.pitch else pitch) or pitch
                seg_volume = (sp.volume if sp and sp.volume else volume) or volume

                target_dur_ms = max(400, t_seg.end_ms - t_seg.start_ms)
                raw_audio_path = project_dir / "media" / "generated" / f"raw_{t_seg.id}.wav"
                aligned_audio_path = project_dir / "media" / "generated" / f"aligned_{t_seg.id}.wav"

                # 1. Synthesize Speech with text optimization & audio normalization
                raw_dur_ms = await EdgeTTSProvider.generate_speech(
                    text=tr_seg.translated_text,
                    output_path=raw_audio_path,
                    voice_id=seg_voice,
                    rate=seg_rate,
                    pitch=seg_pitch,
                    volume=seg_volume,
                )

                # 2. Timing Alignment & Breath Gap Utilization
                raw_dur_ms = max(100.0, raw_dur_ms)
                curr_idx = seg_id_to_idx.get(t_seg.id, -1)
                next_t_seg = ordered_transcripts[curr_idx + 1] if 0 <= curr_idx < len(ordered_transcripts) - 1 else None

                # Compute maximum window before the next speaker starts (leaving 80ms breathing space)
                if next_t_seg:
                    available_gap_ms = max(target_dur_ms, next_t_seg.start_ms - t_seg.start_ms - 80)
                else:
                    available_gap_ms = max(target_dur_ms, int(raw_dur_ms) + 800)

                if chosen_sync_mode == "natural":
                    # Natural mode preserves 1.0x speed when speech fits in pause
                    if raw_dur_ms <= available_gap_ms:
                        speed_factor = 1.0
                    else:
                        speed_factor = min(1.25, max(1.0, raw_dur_ms / available_gap_ms))
                elif chosen_sync_mode == "strict":
                    ratio = raw_dur_ms / target_dur_ms
                    speed_factor = max(0.80, min(1.40, ratio))
                else:  # "balanced" (Default & optimal)
                    if raw_dur_ms <= target_dur_ms:
                        speed_factor = 1.0
                    elif raw_dur_ms <= available_gap_ms:
                        # Fits in natural breath pause between dialogue: gentle speed up at most 1.10x
                        speed_factor = min(1.10, raw_dur_ms / target_dur_ms)
                    else:
                        # Exceeds pause: speed up smoothly to fit without overlapping next dialogue
                        speed_factor = min(1.28, max(1.0, raw_dur_ms / available_gap_ms))

                await adjust_audio_speed_and_pad(
                    input_audio_path=raw_audio_path,
                    output_audio_path=aligned_audio_path,
                    speed_factor=speed_factor,
                    target_duration_ms=None,  # Never truncate dialogue
                    allow_truncation=False,
                )

                final_dur_ms = EdgeTTSProvider.get_audio_duration_ms(aligned_audio_path)

                # 3. Save GeneratedAudio Record
                # Remove existing if any
                await session.execute(
                    delete(GeneratedAudioModel).where(
                        GeneratedAudioModel.project_id == project_id,
                        GeneratedAudioModel.segment_id == t_seg.id
                    )
                )

                gen_model = GeneratedAudioModel(
                    id=str(uuid.uuid4()),
                    project_id=project_id,
                    segment_id=t_seg.id,
                    translation_id=tr_seg.id,
                    voice_id=seg_voice,
                    original_duration_ms=target_dur_ms,
                    raw_duration_ms=int(raw_dur_ms),
                    aligned_duration_ms=int(final_dur_ms),
                    speed_factor=round(speed_factor, 2),
                    audio_path=str(raw_audio_path.resolve()),
                    aligned_audio_path=str(aligned_audio_path.resolve()),
                    sync_mode=chosen_sync_mode,
                    status="aligned",
                    created_at=now,
                )
                session.add(gen_model)
                generated_list.append(gen_model)

                # 4. Place or update clip in dubbed_voice track
                if dub_track:
                    await session.execute(
                        delete(TimelineClipModel).where(
                            TimelineClipModel.track_id == dub_track.id,
                            TimelineClipModel.source_id == gen_model.id
                        )
                    )
                    clip = TimelineClipModel(
                        id=str(uuid.uuid4()),
                        track_id=dub_track.id,
                        project_id=project_id,
                        source_id=gen_model.id,
                        label=tr_seg.translated_text[:30],
                        start_ms=t_seg.start_ms,
                        duration_ms=int(final_dur_ms),
                        playback_rate=1.0,
                        volume=1.0,
                        color="#3B82F6",
                    )
                    session.add(clip)

                # 5. Synchronize subtitle item (strictly clamped to avoid overlapping next segment)
                if next_t_seg:
                    sub_end_ms = min(t_seg.start_ms + int(final_dur_ms), max(t_seg.start_ms + 200, next_t_seg.start_ms - 40))
                    range_end = next_t_seg.start_ms
                else:
                    sub_end_ms = t_seg.start_ms + int(final_dur_ms)
                    range_end = t_seg.start_ms + int(final_dur_ms) + 1000

                await session.execute(
                    delete(SubtitleItemModel).where(
                        SubtitleItemModel.project_id == project_id,
                        SubtitleItemModel.start_ms >= t_seg.start_ms - 30,
                        SubtitleItemModel.start_ms < range_end
                    )
                )
                sub_item = SubtitleItemModel(
                    id=str(uuid.uuid4()),
                    project_id=project_id,
                    start_ms=t_seg.start_ms,
                    end_ms=sub_end_ms,
                    text=tr_seg.translated_text,
                    speaker_id=t_seg.speaker_id,
                )
                session.add(sub_item)

            # Auto-deoverlap all subtitle items in the project after batch generation
            all_subs_stmt = select(SubtitleItemModel).where(SubtitleItemModel.project_id == project_id).order_by(SubtitleItemModel.start_ms)
            all_subs_res = await session.execute(all_subs_stmt)
            curr_subs = list(all_subs_res.scalars().all())
            if curr_subs:
                cleaned_subs = deoverlap_subtitles(curr_subs)
                await session.execute(delete(SubtitleItemModel).where(SubtitleItemModel.project_id == project_id))
                for cs in cleaned_subs:
                    session.add(
                        SubtitleItemModel(
                            id=cs.id,
                            project_id=project_id,
                            start_ms=cs.start_ms,
                            end_ms=cs.end_ms,
                            text=cs.text,
                            speaker_id=cs.speaker_id,
                        )
                    )

            await session.commit()
            for g in generated_list:
                await session.refresh(g)

            if on_progress:
                on_progress(100.0, f"Speech generation and alignment completed for {len(generated_list)} segments.")

            return [GeneratedAudioResponse.model_validate(g) for g in generated_list]

    @staticmethod
    async def get_generated_audios(project_id: str) -> list[GeneratedAudioResponse]:
        async with GlobalAsyncSessionLocal() as g_session:
            project = await g_session.get(ProjectModel, project_id)
            if not project:
                return []

        project_dir = Path(project.project_dir)
        _, session_maker = get_project_engine(project_dir)
        async with session_maker() as session:
            stmt = select(GeneratedAudioModel).where(GeneratedAudioModel.project_id == project_id)
            res = await session.execute(stmt)
            return [GeneratedAudioResponse.model_validate(g) for g in res.scalars().all()]
