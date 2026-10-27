from pathlib import Path
from app.utils.ffmpeg import generate_thumbnail


async def generate_media_thumbnails(
    video_path: Path,
    output_dir: Path,
    duration_sec: float,
    count: int = 10,
) -> list[str]:
    output_dir.mkdir(parents=True, exist_ok=True)
    step = max(1.0, duration_sec / (count + 1))
    paths = []
    for i in range(1, count + 1):
        ts = i * step
        thumb_name = f"thumb_{i:03d}.jpg"
        thumb_path = output_dir / thumb_name
        await generate_thumbnail(video_path, thumb_path, timestamp_sec=ts, width=320)
        if thumb_path.exists():
            paths.append(str(thumb_path.resolve()))
    return paths
