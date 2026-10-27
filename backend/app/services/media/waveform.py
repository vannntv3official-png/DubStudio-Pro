import json
from pathlib import Path
import numpy as np
import soundfile as sf
from app.utils.file_io import atomic_write_json


def generate_audio_peaks(
    audio_path: Path,
    output_peaks_json: Path,
    num_peaks: int = 1200,
) -> list[float]:
    """
    Computes normalized peak values (0.0 to 1.0) across the entire audio file.
    Writes JSON array to output_peaks_json and returns the peak array.
    """
    output_peaks_json.parent.mkdir(parents=True, exist_ok=True)
    try:
        with sf.SoundFile(str(audio_path.resolve())) as f:
            total_frames = len(f)
            if total_frames == 0:
                peaks = [0.0] * num_peaks
                atomic_write_json(output_peaks_json, peaks)
                return peaks

            block_size = max(1, total_frames // num_peaks)
            peaks: list[float] = []

            for _ in range(num_peaks):
                data = f.read(block_size, dtype="float32", always_2d=True)
                if len(data) == 0:
                    peaks.append(0.0)
                    continue
                # Maximum absolute amplitude across all channels in this block
                peak = float(np.max(np.abs(data)))
                peaks.append(round(min(1.0, peak), 3))

            atomic_write_json(output_peaks_json, peaks)
            return peaks
    except Exception as e:
        # Fallback to zeroed array
        peaks = [0.0] * num_peaks
        atomic_write_json(output_peaks_json, peaks)
        return peaks
