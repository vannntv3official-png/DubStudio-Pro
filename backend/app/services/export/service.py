import os
import asyncio
from pathlib import Path
import numpy as np
import soundfile as sf
from sqlalchemy import select
from app.core.errors import ExportError, InvalidMediaError
from app.database.session import get_project_engine, GlobalAsyncSessionLocal
from app.models.project import ProjectModel
from app.models.media import MediaAssetModel
from app.models.voice import GeneratedAudioModel
from app.models.timeline import TimelineTrackModel, TimelineClipModel
from app.schemas.export import ExportConfigSchema
from app.services.subtitles.service import SubtitleService
from app.utils.ffmpeg import FFMPEG_BIN, execute_ffmpeg_with_progress


def hex_to_ass_color(hex_str: str, default: str = "&H00FFFFFF&") -> str:
    hex_clean = hex_str.strip().lstrip("#")
    if len(hex_clean) == 6:
        r, g, b = hex_clean[0:2], hex_clean[2:4], hex_clean[4:6]
        return f"&H00{b}{g}{r}&"
    return default


class ExportService:
    @staticmethod
    async def render_video(
        config: ExportConfigSchema,
        on_progress=None,
        cancel_event: asyncio.Event | None = None,
    ) -> str:
        project_id = config.project_id
        async with GlobalAsyncSessionLocal() as g_session:
            project = await g_session.get(ProjectModel, project_id)
            if not project:
                raise ExportError("Project not found")
            project_dir_str = project.project_dir
            proj_duration_ms = project.duration_ms or 5000

        project_dir = Path(project_dir_str)
        _, session_maker = get_project_engine(project_dir)

        output_path = Path(config.output_file_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        async with session_maker() as session:
            # 1. Locate media asset
            stmt = select(MediaAssetModel).where(MediaAssetModel.project_id == project_id)
            res = await session.execute(stmt)
            media = res.scalars().first()
            if not media:
                raise ExportError("No source video found in project")

            video_path = Path(media.file_path)
            if not video_path.exists():
                raise ExportError(f"Source video file not found at {video_path}")

            total_duration_sec = (media.duration_ms or proj_duration_ms) / 1000.0

            res_map = {
                "720p": (1280, 720),
                "1080p": (1920, 1080),
                "1440p": (2560, 1440),
                "4k": (3840, 2160),
            }
            target_width, target_height = res_map.get(config.resolution, (1920, 1080))

            if on_progress:
                on_progress(5.0, "Preparing multitrack audio composition and subtitles...")

            # 2. Locate dubbed speech clips
            c_stmt = select(TimelineClipModel, GeneratedAudioModel).join(
                GeneratedAudioModel, TimelineClipModel.source_id == GeneratedAudioModel.id
            ).where(
                TimelineClipModel.project_id == project_id,
                GeneratedAudioModel.is_current == True,
            ).order_by(TimelineClipModel.start_ms)
            c_res = await session.execute(c_stmt)
            dub_rows = c_res.all()

            # Resilient fallback: Query GeneratedAudioModel directly if TimelineClipModel was not populated
            clip_audio_pairs: list[tuple[int, GeneratedAudioModel]] = []
            if dub_rows:
                clip_audio_pairs = [(clip.start_ms, gen) for clip, gen in dub_rows]
            else:
                from app.models.transcript import TranscriptSegmentModel
                g_stmt = select(GeneratedAudioModel, TranscriptSegmentModel).join(
                    TranscriptSegmentModel, GeneratedAudioModel.segment_id == TranscriptSegmentModel.id
                ).where(
                    GeneratedAudioModel.project_id == project_id,
                    GeneratedAudioModel.is_current == True,
                ).order_by(TranscriptSegmentModel.start_ms)
                g_res = await session.execute(g_stmt)
                clip_audio_pairs = [(t_seg.start_ms, gen) for gen, t_seg in g_res.all()]

            # 3. Compose unified dubbed audio track with exact timeline synchronization
            sr = 44100
            total_samples = int(total_duration_sec * sr) + (sr * 2)
            dubbed_track = np.zeros((total_samples, 2), dtype=np.float32)
            has_dubbed_audio = False

            for clip_start_ms, gen in clip_audio_pairs:
                c_path = Path(gen.aligned_audio_path)
                if not c_path.exists():
                    c_path = project_dir / "media" / "generated" / c_path.name
                if not c_path.exists():
                    c_path = Path(gen.audio_path)
                if not c_path.exists():
                    continue

                temp_clip_wav = project_dir / "media" / "generated" / f"exp_clip_{c_path.stem}.wav"
                c_proc = await asyncio.create_subprocess_exec(
                    FFMPEG_BIN, "-y",
                    "-i", str(c_path.resolve()),
                    "-ar", str(sr),
                    "-ac", "2",
                    str(temp_clip_wav.resolve()),
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
                await c_proc.communicate()

                if temp_clip_wav.exists():
                    try:
                        c_data, _ = sf.read(str(temp_clip_wav))
                        start_idx = int((max(0, clip_start_ms) / 1000.0) * sr)
                        end_idx = min(total_samples, start_idx + len(c_data))
                        clip_len = end_idx - start_idx
                        if clip_len > 0:
                            # Apply dubbed audio volume boost (1.35x foreground clarity)
                            dub_gain = max(0.1, float(config.dubbed_audio_volume)) * 1.35
                            dubbed_track[start_idx:end_idx] += (c_data[:clip_len] * dub_gain)
                            has_dubbed_audio = True
                    except Exception:
                        pass
                    finally:
                        temp_clip_wav.unlink(missing_ok=True)

            master_dubbed_wav = project_dir / "media" / "generated" / "master_dubbed_export.wav"
            if has_dubbed_audio:
                max_peak = np.max(np.abs(dubbed_track))
                if max_peak > 0.95:
                    dubbed_track = (dubbed_track / max_peak) * 0.92
                sf.write(str(master_dubbed_wav), dubbed_track[:int(total_duration_sec * sr)], sr)

            # 4. Generate subtitles (ASS with HarfBuzz complex shaping + SRT sidecar)
            ass_path = project_dir / "subtitles" / "export.ass"
            srt_path = project_dir / "subtitles" / "export.srt"
            await SubtitleService.export_ass(project_id, ass_path, video_width=target_width, video_height=target_height)
            await SubtitleService.export_srt(project_id, srt_path)

            if config.export_subtitles_sidecar:
                sidecar_path = output_path.with_suffix(".srt" if config.subtitles_sidecar_format == "srt" else ".vtt")
                if config.subtitles_sidecar_format == "vtt":
                    await SubtitleService.export_vtt(project_id, sidecar_path)
                else:
                    await SubtitleService.export_srt(project_id, sidecar_path)

            # 5. Construct resilient FFmpeg command
            cmd = [
                FFMPEG_BIN,
                "-y",
                "-i", str(video_path.resolve()),
            ]
            if has_dubbed_audio and master_dubbed_wav.exists():
                cmd.extend(["-i", str(master_dubbed_wav.resolve())])

            filter_complex = []
            video_filters = []

            if config.resolution == "720p":
                video_filters.append("scale=-2:720")
            elif config.resolution == "1080p":
                video_filters.append("scale=-2:1080")
            elif config.resolution == "1440p":
                video_filters.append("scale=-2:1440")
            elif config.resolution == "4k":
                video_filters.append("scale=-2:2160")

            # Burn-in Subtitles with HarfBuzz complex shaping (fixes detached foot/subscripts)
            if config.burn_in_subtitles and ass_path.exists():
                escaped_ass = str(ass_path.resolve()).replace("\\", "/").replace(":", "\\:")
                video_filters.append(f"ass='{escaped_ass}':shaping=complex")

            if video_filters:
                filter_complex.append(f"[0:v]{','.join(video_filters)}[v_out]")
                final_video_map = "[v_out]"
            else:
                final_video_map = "0:v"

            # Audio Mixing with Film-grade Auto-Ducking
            if has_dubbed_audio and master_dubbed_wav.exists():
                if config.include_original_audio:
                    orig_vol = max(0.0, float(config.original_audio_volume))
                    # Professional Broadcast Ducking: smoothly ducks original background by ~12dB when dubbed voice speaks
                    filter_complex.append(
                        f"[0:a]volume={orig_vol:.2f}[a_orig_vol];"
                        f"[1:a]asplit=2[a_dub_main][a_dub_sc];"
                        f"[a_orig_vol][a_dub_sc]sidechaincompress=threshold=0.08:ratio=4:attack=20:release=250[a_orig_ducked];"
                        f"[a_orig_ducked][a_dub_main]amix=inputs=2:duration=first:dropout_transition=2:normalize=0[a_mixed]"
                    )
                    final_audio_map = "[a_mixed]"
                else:
                    filter_complex.append("[1:a]volume=1.0[a_dub_pure]")
                    final_audio_map = "[a_dub_pure]"
            else:
                if config.include_original_audio:
                    orig_vol = max(0.0, float(config.original_audio_volume))
                    filter_complex.append(f"[0:a]volume={orig_vol:.2f}[a_orig]")
                    final_audio_map = "[a_orig]"
                else:
                    final_audio_map = None

            if filter_complex:
                cmd.extend(["-filter_complex", ";".join(filter_complex)])
                cmd.extend(["-map", final_video_map])
                if final_audio_map:
                    cmd.extend(["-map", final_audio_map])
                else:
                    cmd.append("-an")
            else:
                cmd.extend(["-map", "0:v"])
                if config.include_original_audio:
                    cmd.extend(["-map", "0:a"])
                else:
                    cmd.append("-an")

            codec_flag = "libx264" if config.video_codec == "h264" else "libx265"
            cmd.extend([
                "-c:v", codec_flag,
                "-preset", "fast",
                "-b:v", config.video_bitrate,
                "-c:a", "aac",
                "-b:a", config.audio_bitrate,
                "-progress", "pipe:1",
                "-shortest",
                str(output_path.resolve()),
            ])

            if on_progress:
                on_progress(10.0, "Rendering and encoding final video...")

            await execute_ffmpeg_with_progress(
                cmd=cmd,
                total_duration_sec=total_duration_sec,
                on_progress=on_progress,
                cancel_event=cancel_event,
            )

            if not output_path.exists() or output_path.stat().st_size == 0:
                raise ExportError("Export finished but output file is missing or empty.")

            if on_progress:
                on_progress(100.0, f"Video exported successfully: {output_path.name}")

            return str(output_path.resolve())
