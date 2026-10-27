import asyncio
import json
import logging
import shutil
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from sqlalchemy import select, delete, update
from app.database.session import get_project_engine, GlobalAsyncSessionLocal
from app.models.project import ProjectModel
from app.models.transcript import TranscriptSegmentModel
from app.models.translation import TranslationSegmentModel
from app.models.speaker import SpeakerModel
from app.models.voice import GeneratedAudioModel
from app.models.timeline import TimelineTrackModel, TimelineClipModel
from app.models.subtitle import SubtitleItemModel
from app.models.setting import SettingModel
from app.services.subtitles.service import deoverlap_subtitles
from app.services.khmer.pronunciation import prepare_khmer_pronunciation
from app.providers.edge_tts.provider import EdgeTTSProvider
from app.providers.gemini.provider import GeminiProvider
from app.providers.codecraft.provider import CodecraftProvider
from app.schemas.voice import GeneratedAudioResponse
from app.utils.ffmpeg import adjust_audio_speed_and_pad

logger = logging.getLogger("dubstudio.services.speech")

# Timing Policy Configuration per specification:
# Mode      | Max Pause Borrowing | Max Tempo Factor
# Natural   | 1000 ms             | 1.08x
# Balanced  | 500 ms              | 1.12x
# Strict    | 0 ms                | 1.18x
TIMING_POLICIES: dict[str, dict[str, float]] = {
    "natural": {"max_pause_ms": 1000, "max_tempo": 1.08},
    "balanced": {"max_pause_ms": 500, "max_tempo": 1.12},
    "strict": {"max_pause_ms": 0, "max_tempo": 1.18},
}


class SpeechAndAlignmentService:
    @staticmethod
    async def _revise_spoken_script_with_llm(
        current_script: str,
        target_window_sec: float,
        measured_sec: float,
        source_text: str,
        g_session,
    ) -> str | None:
        """
        Asks LLM to revise spoken Khmer script to be more concise to fit within the target window,
        preserving facts, negation, names, and communicative intent.
        """
        try:
            gemini_key = await g_session.get(SettingModel, "gemini_api_key")
            gemini_keys_setting = await g_session.get(SettingModel, "gemini_api_keys")
            gemini_model = await g_session.get(SettingModel, "gemini_model")
            codecraft_key = await g_session.get(SettingModel, "codecraft_api_key")
            codecraft_base = await g_session.get(SettingModel, "codecraft_base_url")
            codecraft_model = await g_session.get(SettingModel, "codecraft_model")

            has_gemini = bool(
                (gemini_key and gemini_key.value and gemini_key.value.strip()) or
                (gemini_keys_setting and gemini_keys_setting.value and gemini_keys_setting.value.strip())
            )
            has_codecraft = bool(codecraft_key and codecraft_key.value and codecraft_key.value.strip())

            if not has_gemini and not has_codecraft:
                return None

            prompt = (
                f"You are an expert film dubbing director revising dialogue timing.\n"
                f"Original dialogue: \"{source_text}\"\n"
                f"Current spoken Khmer script: \"{current_script}\"\n"
                f"The spoken script takes {measured_sec:.2f} seconds to speak, but the maximum available window is {target_window_sec:.2f} seconds.\n"
                f"Please revise the spoken Khmer script to be more concise (~{round(target_window_sec * 3.8)} syllables) so it fits without rushing.\n"
                f"Rules: Preserve meaning, negation, and character names. Do not truncate dialogue.\n"
                f"Return JSON strictly: {{\"revised_script\": \"...\"}}"
            )

            if has_gemini:
                provider = GeminiProvider(
                    api_key=gemini_key.value if (gemini_key and gemini_key.value) else None,
                    api_keys=gemini_keys_setting.value if (gemini_keys_setting and gemini_keys_setting.value) else None,
                    model=gemini_model.value if (gemini_model and gemini_model.value) else "gemini-3.5-flash",
                )
                if not provider.api_keys:
                    return None
                from google.genai import types
                resp = await provider._generate_content_resilient(
                    contents=[prompt],
                    config=types.GenerateContentConfig(response_mime_type="application/json", temperature=0.2),
                    task_name="timing_revision",
                )
                raw = resp.text or "{}"
                data = json.loads(raw)
                revised = str(data.get("revised_script", "")).strip()
                if revised and revised != current_script:
                    return revised
            elif has_codecraft:
                provider = CodecraftProvider(
                    api_key=codecraft_key.value,
                    base_url=codecraft_base.value if (codecraft_base and codecraft_base.value) else "https://codecraftapi.com/v1",
                    model=codecraft_model.value if (codecraft_model and codecraft_model.value) else "deepseek-chat",
                )
                if not provider.api_key:
                    return None
                import httpx
                headers = provider._get_headers()
                req_body = {
                    "model": provider.model,
                    "messages": [{"role": "user", "content": prompt}],
                    "response_format": {"type": "json_object"},
                    "temperature": 0.2,
                }
                async with httpx.AsyncClient(timeout=10.0) as client:
                    resp = await client.post(f"{provider.base_url}/chat/completions", headers=headers, json=req_body)
                    resp.raise_for_status()
                    data = resp.json()
                    parsed = json.loads(data["choices"][0]["message"]["content"])
                    revised = str(parsed.get("revised_script", "")).strip()
                    if revised and revised != current_script:
                        return revised

        except Exception as e:
            logger.warning(f"Script revision attempt failed: {e}")
        return None

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
        cancel_event: asyncio.Event | None = None,
    ) -> list[GeneratedAudioResponse]:
        async with GlobalAsyncSessionLocal() as g_session:
            project = await g_session.get(ProjectModel, project_id)
            if not project:
                raise ValueError("Project not found")
            project_dir_str = project.project_dir
            target_lang = project.target_language or "km"
            proj_sync_mode = project.sync_mode or "balanced"

        project_dir = Path(project_dir_str)
        takes_dir = project_dir / "media" / "takes"
        takes_dir.mkdir(parents=True, exist_ok=True)
        _, session_maker = get_project_engine(project_dir)

        # Determine target voice
        if not voice_id:
            voice_id = await EdgeTTSProvider.get_default_voice_for_locale(target_lang)

        chosen_sync_mode = (sync_mode or proj_sync_mode).lower()
        policy = TIMING_POLICIES.get(chosen_sync_mode, TIMING_POLICIES["balanced"])
        max_pause_ms = policy["max_pause_ms"]
        max_tempo = policy["max_tempo"]

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

            # Pre-load all existing takes for the project
            ex_takes_stmt = select(GeneratedAudioModel).where(
                GeneratedAudioModel.project_id == project_id
            )
            ex_takes_res = await session.execute(ex_takes_stmt)
            all_existing_takes = ex_takes_res.scalars().all()
            existing_takes_by_seg: dict[str, list[GeneratedAudioModel]] = defaultdict(list)
            for et in all_existing_takes:
                existing_takes_by_seg[et.segment_id].append(et)

            # Target segments
            target_t_ids = segment_ids if segment_ids else list(transcripts.keys())
            total = len(target_t_ids)

            # Run synthesis, revision, and audio processing concurrently (4 parallel workers)
            concurrency = 4
            semaphore = asyncio.Semaphore(concurrency)
            completed_count = 0
            progress_lock = asyncio.Lock()

            async def process_single_segment(seg_id: str):
                nonlocal completed_count
                if cancel_event and cancel_event.is_set():
                    return None
                t_seg = transcripts.get(seg_id)
                tr_seg = translations.get(seg_id)
                if not t_seg or not tr_seg:
                    return None

                raw_take_path = None
                aligned_take_path = None

                async with semaphore:
                    if cancel_event and cancel_event.is_set():
                        return None
                    # Resolve speaker voice
                    sp = speakers.get(t_seg.speaker_id)
                    seg_voice = (sp.voice_id if sp and sp.voice_id else voice_id) or voice_id
                    seg_rate = (sp.rate if sp and sp.rate else rate) or rate
                    seg_pitch = (sp.pitch if sp and sp.pitch else pitch) or pitch
                    seg_volume = (sp.volume if sp and sp.volume else volume) or volume

                    target_dur_ms = max(400, t_seg.end_ms - t_seg.start_ms)

                    # Step 4: Calculate verified available speech window
                    curr_idx = seg_id_to_idx.get(t_seg.id, -1)
                    next_t_seg = ordered_transcripts[curr_idx + 1] if 0 <= curr_idx < len(ordered_transcripts) - 1 else None

                    if next_t_seg:
                        gap_ms = max(0, next_t_seg.start_ms - t_seg.end_ms)
                        allowed_pause = min(max_pause_ms, max(0, gap_ms - 80))
                    else:
                        allowed_pause = max_pause_ms

                    available_window_ms = target_dur_ms + allowed_pause

                    # Resolve text representations
                    spoken_script = tr_seg.spoken_script or tr_seg.translated_text
                    pron_text = tr_seg.pronunciation_text or prepare_khmer_pronunciation(spoken_script, voice_id=seg_voice)

                    existing_takes = existing_takes_by_seg.get(t_seg.id, [])
                    take_number = len(existing_takes) + 1

                    take_uuid = str(uuid.uuid4())[:8]
                    raw_take_path = takes_dir / f"take_{t_seg.id}_t{take_number}_{take_uuid}_raw.wav"
                    aligned_take_path = takes_dir / f"take_{t_seg.id}_t{take_number}_{take_uuid}_aligned.wav"

                    revision_attempts = 0
                    review_reasons: list[str] = list(tr_seg.review_reasons or [])

                    try:
                        # Step 1 & 2: Synthesize using voice and supported controls
                        measured_dur_ms = await EdgeTTSProvider.generate_speech(
                            text=pron_text,
                            output_path=raw_take_path,
                            voice_id=seg_voice,
                            rate=seg_rate,
                            pitch=seg_pitch,
                            volume=seg_volume,
                        )
                        measured_dur_ms = max(100.0, measured_dur_ms)

                        # Step 5 & 6: Bounded Script Revision Loop (Max 2 attempts)
                        if (
                            measured_dur_ms > available_window_ms * max_tempo
                            and not tr_seg.is_manually_edited
                            and tr_seg.approval_status != "approved"
                        ):
                            for attempt in range(1, 3):
                                revision_attempts = attempt
                                async with GlobalAsyncSessionLocal() as g_sess:
                                    revised = await SpeechAndAlignmentService._revise_spoken_script_with_llm(
                                        current_script=spoken_script,
                                        target_window_sec=available_window_ms / 1000.0,
                                        measured_sec=measured_dur_ms / 1000.0,
                                        source_text=t_seg.text,
                                        g_session=g_sess,
                                    )

                                if revised and revised != spoken_script:
                                    rev_pron = prepare_khmer_pronunciation(revised, voice_id=seg_voice)
                                    candidate_path = takes_dir / f"take_{t_seg.id}_t{take_number}_rev{attempt}_{take_uuid}.wav"
                                    candidate_dur = await EdgeTTSProvider.generate_speech(
                                        text=rev_pron,
                                        output_path=candidate_path,
                                        voice_id=seg_voice,
                                        rate=seg_rate,
                                        pitch=seg_pitch,
                                        volume=seg_volume,
                                    )
                                    # Step 7: Retain candidate only if measured timing improves
                                    if candidate_dur < measured_dur_ms:
                                        spoken_script = revised
                                        pron_text = rev_pron
                                        raw_take_path = candidate_path
                                        measured_dur_ms = candidate_dur
                                        if measured_dur_ms <= available_window_ms * max_tempo:
                                            break

                        # Step 8: Apply bounded pitch-preserving tempo adjustment (atempo)
                        if measured_dur_ms <= available_window_ms:
                            tempo_factor = 1.0
                        else:
                            tempo_factor = min(max_tempo, measured_dur_ms / available_window_ms)

                        # Fast-path: if tempo_factor is 1.0, bypass secondary FFmpeg process and copy directly
                        if abs(tempo_factor - 1.0) < 0.01:
                            shutil.copy2(raw_take_path, aligned_take_path)
                        else:
                            await adjust_audio_speed_and_pad(
                                input_audio_path=raw_take_path,
                                output_audio_path=aligned_take_path,
                                speed_factor=round(tempo_factor, 2),
                                target_duration_ms=None,  # NEVER truncate dialogue
                                allow_truncation=False,
                            )

                        # Step 9: Measure processed output again
                        final_dur_ms = EdgeTTSProvider.get_audio_duration_ms(aligned_take_path)

                        # Step 10: Flag unresolved problems for review
                        review_status = "generated"
                        if final_dur_ms > available_window_ms + 60:
                            if "timing_overrun" not in review_reasons:
                                review_reasons.append("timing_overrun")
                            review_status = "needs_review"
                        elif final_dur_ms < target_dur_ms * 0.55 and target_dur_ms > 2000:
                            if "timing_underrun" not in review_reasons:
                                review_reasons.append("timing_underrun")
                            review_status = "needs_review"

                    except Exception as seg_err:
                        logger.exception(f"Error processing audio synthesis for segment {t_seg.id}: {seg_err}")
                        if aligned_take_path and not aligned_take_path.exists():
                            await EdgeTTSProvider._generate_silence(aligned_take_path, target_dur_ms)
                        final_dur_ms = float(target_dur_ms)
                        measured_dur_ms = float(target_dur_ms)
                        tempo_factor = 1.0
                        review_status = "needs_review"
                        if "synthesis_error" not in review_reasons:
                            review_reasons.append("synthesis_error")

                    async with progress_lock:
                        completed_count += 1
                        if on_progress:
                            pct = 10.0 + (completed_count / max(1, total)) * 80.0
                            on_progress(pct, f"Synthesized speech ({completed_count}/{total})...")

                    return {
                        "t_seg": t_seg,
                        "tr_seg": tr_seg,
                        "next_t_seg": next_t_seg,
                        "existing_takes": existing_takes,
                        "target_dur_ms": target_dur_ms,
                        "available_window_ms": available_window_ms,
                        "measured_dur_ms": measured_dur_ms,
                        "final_dur_ms": final_dur_ms,
                        "tempo_factor": tempo_factor,
                        "spoken_script": spoken_script,
                        "pron_text": pron_text,
                        "raw_take_path": raw_take_path,
                        "aligned_take_path": aligned_take_path,
                        "take_number": take_number,
                        "review_status": review_status,
                        "review_reasons": review_reasons,
                        "revision_attempts": revision_attempts,
                        "seg_voice": seg_voice,
                    }

            # Execute all segment audio generation in parallel with bounded concurrency
            raw_results = await asyncio.gather(*(process_single_segment(sid) for sid in target_t_ids), return_exceptions=True)
            for r in raw_results:
                if isinstance(r, Exception):
                    logger.error(f"Speech synthesis worker error: {r}")
            results = [r for r in raw_results if isinstance(r, dict)]

            generated_list: list[GeneratedAudioModel] = []
            now = datetime.now(timezone.utc)

            # Apply batch database updates in chronological order
            for res in results:
                t_seg = res["t_seg"]
                tr_seg = res["tr_seg"]
                next_t_seg = res["next_t_seg"]
                final_dur_ms = res["final_dur_ms"]
                spoken_script = res["spoken_script"]
                pron_text = res["pron_text"]
                review_status = res["review_status"]
                review_reasons = res["review_reasons"]

                # Update translation segment
                tr_seg.spoken_script = spoken_script
                tr_seg.pronunciation_text = pron_text
                tr_seg.approval_status = review_status if tr_seg.approval_status != "approved" else "approved"
                tr_seg.review_reasons = review_reasons

                # Preserve takes: mark older takes as not current
                for ex_take in res["existing_takes"]:
                    ex_take.is_current = False

                gen_model = GeneratedAudioModel(
                    id=str(uuid.uuid4()),
                    project_id=project_id,
                    segment_id=t_seg.id,
                    translation_id=tr_seg.id,
                    voice_id=res["seg_voice"],
                    original_duration_ms=res["target_dur_ms"],
                    raw_duration_ms=int(res["measured_dur_ms"]),
                    measured_duration_ms=int(res["measured_dur_ms"]),
                    aligned_duration_ms=int(final_dur_ms),
                    timing_budget_ms=int(res["available_window_ms"]),
                    speed_factor=round(res["tempo_factor"], 2),
                    tempo_factor=round(res["tempo_factor"], 2),
                    audio_path=str(res["raw_take_path"].resolve()),
                    aligned_audio_path=str(res["aligned_take_path"].resolve()),
                    sync_mode=chosen_sync_mode,
                    status="aligned",
                    take_number=res["take_number"],
                    is_current=True,
                    review_status=review_status,
                    review_reasons=review_reasons,
                    revision_attempts=res["revision_attempts"],
                    pronunciation_text_used=pron_text,
                    stale=False,
                    created_at=now,
                )
                session.add(gen_model)
                generated_list.append(gen_model)

                # Update dubbed_voice timeline track (strictly purge all prior takes/clips for this segment)
                if dub_track:
                    old_take_ids = [ex.id for ex in res["existing_takes"]]
                    if old_take_ids:
                        await session.execute(
                            delete(TimelineClipModel).where(
                                TimelineClipModel.track_id == dub_track.id,
                                TimelineClipModel.source_id.in_(old_take_ids),
                            )
                        )
                    await session.execute(
                        delete(TimelineClipModel).where(
                            TimelineClipModel.track_id == dub_track.id,
                            TimelineClipModel.start_ms == t_seg.start_ms,
                        )
                    )

                    clip_color = "#3B82F6"
                    if "synthesis_error" in review_reasons:
                        clip_color = "#EF4444"
                    elif "timing_overrun" in review_reasons:
                        clip_color = "#F59E0B"

                    clean_label = spoken_script.strip()
                    if len(clean_label) > 180:
                        clean_label = clean_label[:180] + "…"

                    clip = TimelineClipModel(
                        id=str(uuid.uuid4()),
                        track_id=dub_track.id,
                        project_id=project_id,
                        source_id=gen_model.id,
                        label=clean_label,
                        start_ms=t_seg.start_ms,
                        duration_ms=int(final_dur_ms),
                        playback_rate=1.0,
                        volume=1.0,
                        color=clip_color,
                        metadata_json={
                            "segmentId": t_seg.id,
                            "reviewStatus": review_status,
                            "reviewReasons": review_reasons,
                            "tempoFactor": round(res["tempo_factor"], 2),
                            "targetDurationMs": res["target_dur_ms"],
                            "availableWindowMs": res["available_window_ms"],
                        },
                    )
                    session.add(clip)

                # Synchronize subtitle item (strictly clamped to avoid overlapping next segment)
                sub_display_text = tr_seg.subtitle_text or tr_seg.translated_text
                if next_t_seg:
                    sub_end_ms = min(t_seg.start_ms + int(final_dur_ms), max(t_seg.start_ms + 200, next_t_seg.start_ms - 40))
                    range_end = next_t_seg.start_ms
                else:
                    sub_end_ms = t_seg.start_ms + int(final_dur_ms)
                    range_end = t_seg.start_ms + int(final_dur_ms) + 1000

                await session.execute(
                    delete(SubtitleItemModel).where(
                        SubtitleItemModel.project_id == project_id,
                        SubtitleItemModel.start_ms >= t_seg.start_ms,
                        SubtitleItemModel.start_ms < range_end,
                    )
                )
                sub_item = SubtitleItemModel(
                    id=str(uuid.uuid4()),
                    project_id=project_id,
                    start_ms=t_seg.start_ms,
                    end_ms=sub_end_ms,
                    text=sub_display_text,
                    speaker_id=t_seg.speaker_id,
                )
                session.add(sub_item)

            # Auto-deoverlap all subtitle items in the project
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
                on_progress(100.0, f"Speech generation completed for {len(generated_list)} segments.")

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
            stmt = select(GeneratedAudioModel).where(
                GeneratedAudioModel.project_id == project_id,
                GeneratedAudioModel.is_current == True,
            )
            res = await session.execute(stmt)
            return [GeneratedAudioResponse.model_validate(g) for g in res.scalars().all()]

    @staticmethod
    async def regenerate_single_segment(
        project_id: str,
        segment_id: str,
        voice_id: str | None = None,
        rate: str = "+0%",
        pitch: str = "+0Hz",
        volume: str = "+0%",
        sync_mode: str | None = None,
    ) -> GeneratedAudioResponse:
        results = await SpeechAndAlignmentService.run_batch_speech_and_alignment(
            project_id=project_id,
            voice_id=voice_id,
            rate=rate,
            pitch=pitch,
            volume=volume,
            segment_ids=[segment_id],
            sync_mode=sync_mode,
        )
        if not results:
            raise ValueError(f"Failed to generate speech for segment {segment_id}")
        return results[0]

