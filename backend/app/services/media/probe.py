from pathlib import Path
from app.core.errors import InvalidMediaError
from app.schemas.media import MediaMetadata, VideoStreamMeta, AudioStreamMeta
from app.utils.ffmpeg import run_ffprobe


async def probe_media_file(file_path: Path) -> MediaMetadata:
    data = await run_ffprobe(file_path)

    format_info = data.get("format", {})
    streams = data.get("streams", [])

    duration_sec = float(format_info.get("duration", 0))
    duration_ms = int(duration_sec * 1000)
    size_bytes = int(format_info.get("size", file_path.stat().st_size if file_path.exists() else 0))
    bitrate = int(format_info.get("bit_rate", 0))

    video_meta: VideoStreamMeta | None = None
    audio_meta: AudioStreamMeta | None = None

    for s in streams:
        codec_type = s.get("codec_type")
        if codec_type == "video" and not video_meta:
            fps_str = s.get("r_frame_rate", "30/1")
            fps = 30.0
            if "/" in fps_str:
                num, den = fps_str.split("/")
                fps = float(num) / float(den) if float(den) > 0 else 30.0
            else:
                fps = float(fps_str)

            v_dur = float(s.get("duration", duration_sec))
            video_meta = VideoStreamMeta(
                index=int(s.get("index", 0)),
                codec=s.get("codec_name", "unknown"),
                width=int(s.get("width", 1920)),
                height=int(s.get("height", 1080)),
                fps=round(fps, 3),
                durationMs=int(v_dur * 1000),
                bitrate=int(s.get("bit_rate")) if s.get("bit_rate") else None,
                aspectRatio=s.get("display_aspect_ratio"),
            )
        elif codec_type == "audio" and not audio_meta:
            a_dur = float(s.get("duration", duration_sec))
            audio_meta = AudioStreamMeta(
                index=int(s.get("index", 1)),
                codec=s.get("codec_name", "unknown"),
                channels=int(s.get("channels", 2)),
                sampleRate=int(s.get("sample_rate", 44100)),
                durationMs=int(a_dur * 1000),
                bitrate=int(s.get("bit_rate")) if s.get("bit_rate") else None,
            )

    return MediaMetadata(
        formatName=format_info.get("format_name", "mp4"),
        durationMs=duration_ms,
        sizeBytes=size_bytes,
        bitrate=bitrate,
        video=video_meta,
        audio=audio_meta,
    )
