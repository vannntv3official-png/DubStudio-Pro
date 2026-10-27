import os
import shutil
import asyncio
import json
import logging
import re
from pathlib import Path
from typing import Any, Callable
from app.core.errors import InvalidMediaError, UnsupportedCodecError, ExportError

logger = logging.getLogger("dubstudio.ffmpeg")


def find_executable(name: str) -> str:
    path = shutil.which(name)
    if path:
        return path
    # Check common Windows locations
    windows_defaults = [
        Path(r"C:\ffmpeg\bin") / f"{name}.exe",
        Path(os.environ.get("LOCALAPPDATA", "")) / "Programs" / "ffmpeg" / "bin" / f"{name}.exe",
    ]
    for candidate in windows_defaults:
        if candidate.exists():
            return str(candidate)
    return name  # fallback to name, let OS raise if not found


FFMPEG_BIN = find_executable("ffmpeg")
FFPROBE_BIN = find_executable("ffprobe")


async def run_ffprobe(file_path: Path) -> dict[str, Any]:
    """Runs ffprobe on the target media file and returns parsed JSON metadata."""
    if not file_path.exists():
        raise InvalidMediaError(f"File not found: {file_path}")

    cmd = [
        FFPROBE_BIN,
        "-v", "quiet",
        "-print_format", "json",
        "-show_format",
        "-show_streams",
        str(file_path.resolve()),
    ]

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate()
    except Exception as e:
        raise InvalidMediaError(f"Failed to execute ffprobe: {e}")

    if proc.returncode != 0:
        err_msg = stderr.decode("utf-8", errors="replace")
        raise InvalidMediaError(f"ffprobe failed to analyze file: {err_msg}")

    try:
        data = json.loads(stdout.decode("utf-8", errors="replace"))
        return data
    except Exception as e:
        raise InvalidMediaError(f"Failed to parse ffprobe JSON output: {e}")


async def extract_audio_wav(
    video_path: Path,
    output_wav_path: Path,
    sample_rate: int = 16000,
    channels: int = 1,
) -> None:
    """Extracts clean PCM WAV audio from video for transcription and speech processing."""
    output_wav_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        FFMPEG_BIN,
        "-y",
        "-i", str(video_path.resolve()),
        "-vn",
        "-acodec", "pcm_s16le",
        "-ar", str(sample_rate),
        "-ac", str(channels),
        str(output_wav_path.resolve()),
    ]
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    if proc.returncode != 0:
        raise InvalidMediaError(f"Audio extraction failed: {stderr.decode(errors='replace')}")


async def generate_thumbnail(
    video_path: Path,
    output_thumb_path: Path,
    timestamp_sec: float = 1.0,
    width: int = 480,
) -> None:
    """Extracts a video thumbnail at the specified timestamp."""
    output_thumb_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        FFMPEG_BIN,
        "-y",
        "-ss", str(timestamp_sec),
        "-i", str(video_path.resolve()),
        "-frames:v", "1",
        "-vf", f"scale={width}:-1",
        "-q:v", "3",
        str(output_thumb_path.resolve()),
    ]
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    await proc.communicate()


def build_atempo_filter(factor: float) -> str:
    """FFmpeg atempo filter accepts 0.5 to 2.0. Chaining allows higher/lower factors."""
    factor = max(0.25, min(4.0, factor))
    filters = []
    current = factor
    while current > 2.0:
        filters.append("atempo=2.0")
        current /= 2.0
    while current < 0.5:
        filters.append("atempo=0.5")
        current /= 0.5
    filters.append(f"atempo={current:.4f}")
    return ",".join(filters)


async def adjust_audio_speed_and_pad(
    input_audio_path: Path,
    output_audio_path: Path,
    speed_factor: float = 1.0,
    target_duration_ms: int | None = None,
    allow_truncation: bool = False,
) -> None:
    """Adjusts audio playback rate smoothly and pads with silence if needed without cutting off words."""
    output_audio_path.parent.mkdir(parents=True, exist_ok=True)
    filters: list[str] = []

    # 1. Pitch-preserving time stretch / compression
    if abs(speed_factor - 1.0) >= 0.01:
        filters.append(build_atempo_filter(speed_factor))

    # 2. Anti-pop micro fade-in
    filters.append("afade=t=in:ss=0:d=0.015")

    # 3. Target duration padding or optional strict trimming
    if target_duration_ms is not None:
        target_sec = target_duration_ms / 1000.0
        if allow_truncation:
            filters.append(f"apad=whole_dur={target_sec:.4f},atrim=0:{target_sec:.4f}")
        else:
            # Pad with silence if shorter, but never truncate voice mid-sentence
            filters.append(f"apad=whole_dur={target_sec:.4f}")

    filter_chain = ",".join(filters) if filters else "anull"

    cmd = [
        FFMPEG_BIN,
        "-y",
        "-i", str(input_audio_path.resolve()),
        "-filter:a", filter_chain,
        "-acodec", "pcm_s16le",
        "-ar", "24000",
        "-ac", "1",
        str(output_audio_path.resolve()),
    ]
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    if proc.returncode != 0:
        logger.error(f"Failed to adjust audio speed: {stderr.decode(errors='replace')}")
        shutil.copy2(input_audio_path, output_audio_path)


async def execute_ffmpeg_with_progress(
    cmd: list[str],
    total_duration_sec: float,
    on_progress: Callable[[float, str], None] | None = None,
    cancel_event: asyncio.Event | None = None,
) -> None:
    """Executes FFmpeg while parsing '-progress pipe:1' output to report actual progress."""
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    time_regex = re.compile(r"out_time_ms=(\d+)")

    async def read_stdout():
        while True:
            if cancel_event and cancel_event.is_set():
                proc.kill()
                break
            line = await proc.stdout.readline()
            if not line:
                break
            line_str = line.decode("utf-8", errors="replace").strip()
            match = time_regex.search(line_str)
            if match and total_duration_sec > 0 and on_progress:
                current_us = int(match.group(1))
                current_sec = current_us / 1_000_000.0
                pct = min(99.0, max(0.0, (current_sec / total_duration_sec) * 100.0))
                on_progress(pct, f"Rendering video... {pct:.1f}%")

    try:
        await asyncio.gather(read_stdout(), proc.wait())
    except Exception as e:
        proc.kill()
        raise ExportError(f"FFmpeg execution interrupted: {e}")

    if proc.returncode != 0 and not (cancel_event and cancel_event.is_set()):
        stderr_output = (await proc.stderr.read()).decode("utf-8", errors="replace")
        raise ExportError(f"FFmpeg render error: {stderr_output[-1000:]}")
