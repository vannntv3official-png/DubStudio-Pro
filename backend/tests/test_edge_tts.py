import pytest
from pathlib import Path
from app.providers.edge_tts.provider import EdgeTTSProvider, clean_tts_text
from app.utils.ffmpeg import adjust_audio_speed_and_pad


@pytest.mark.asyncio
async def test_edge_tts_voice_discovery():
    voices = await EdgeTTSProvider.list_voices()
    assert len(voices) > 0
    # Verify voice structure
    sample = voices[0]
    assert "id" in sample
    assert "name" in sample
    assert "gender" in sample
    assert "locale" in sample

    # Check Khmer voice availability
    khmer_voices = [v for v in voices if "km" in v["locale"].lower()]
    assert len(khmer_voices) > 0, "Expected at least one Khmer voice in Edge TTS"

    # Check default voice helper
    default_km = await EdgeTTSProvider.get_default_voice_for_locale("km")
    assert "km" in default_km.lower() or "kh" in default_km.lower()


def test_clean_tts_text():
    # 1. Zero-width spaces and formatting stripped
    raw_khmer = "**សួស្តី**\u200bពិភពលោក\u200b! នេះជាការធ្វើតេស្ត???"
    cleaned = clean_tts_text(raw_khmer, "km-KH-PisethNeural")
    assert "\u200b" not in cleaned
    assert "*" not in cleaned
    assert "???" not in cleaned
    assert "!" in cleaned
    assert "?" in cleaned

    # 2. Terminal punctuation added for natural cadence
    unpunctuated = "សូមស្វាគមន៍មកកាន់ DubStudio AI"
    res = clean_tts_text(unpunctuated, "km-KH-SreymomNeural")
    assert res.endswith("។")


@pytest.mark.asyncio
async def test_audio_speed_adjustment_without_truncation(tmp_path: Path):
    # Create test 1.0s audio tone
    import asyncio
    from app.utils.ffmpeg import FFMPEG_BIN
    src_wav = tmp_path / "test_source.wav"
    cmd = [
        FFMPEG_BIN, "-y",
        "-f", "lavfi", "-i", "sine=frequency=440:duration=1.0",
        "-ar", "24000", "-ac", "1",
        str(src_wav),
    ]
    proc = await asyncio.create_subprocess_exec(*cmd)
    await proc.communicate()

    # Apply 1.0x with target_duration_ms=800ms but allow_truncation=False
    out_wav = tmp_path / "test_out.wav"
    await adjust_audio_speed_and_pad(
        input_audio_path=src_wav,
        output_audio_path=out_wav,
        speed_factor=1.0,
        target_duration_ms=800,
        allow_truncation=False,
    )
    dur_ms = EdgeTTSProvider.get_audio_duration_ms(out_wav)
    # The speech must NOT be truncated to 800ms! It must stay ~1000ms
    assert dur_ms >= 980.0

