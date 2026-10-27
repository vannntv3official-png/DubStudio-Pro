import asyncio
import logging
import re
from pathlib import Path
from typing import Any
import edge_tts
import soundfile as sf
from app.core.errors import DubStudioError
from app.utils.ffmpeg import FFMPEG_BIN
from app.services.khmer.pronunciation import prepare_khmer_pronunciation

logger = logging.getLogger("dubstudio.providers.edge_tts")


def clean_tts_text(text: str, voice_id: str = "") -> str:
    """
    Cleans and optimizes text for natural Edge TTS neural synthesis.
    - Preserves Khmer Coeng combining ligatures without breaking
    - Normalizes markdown formatting and excess whitespace
    - Ensures proper sentence cadence and emotional ending punctuation
    """
    if not text:
        return ""

    is_khmer = "km" in voice_id.lower() or any("\u1780" <= c <= "\u17ff" for c in text)
    if is_khmer:
        return prepare_khmer_pronunciation(text, voice_id=voice_id)

    # Strip HTML / XML tags
    cleaned = re.sub(r"<[^>]+>", " ", text)

    # Strip Markdown symbols (*, _, `, #, ~, >, quotes)
    cleaned = re.sub(r"[\*_`#~>]", " ", cleaned)

    # Collapse whitespace
    cleaned = re.sub(r"[ \t]+", " ", cleaned).strip()

    # Normalize repeated punctuation
    cleaned = re.sub(r"\?+", "?", cleaned)
    cleaned = re.sub(r"!+", "!", cleaned)
    cleaned = re.sub(r"(\.\s*){3,}", "...", cleaned)

    if cleaned and not cleaned[-1] in (".", "!", "?", "…", ":", ";"):
        cleaned += "."

    return cleaned


# Cached voices list
_VOICE_CACHE: list[dict[str, Any]] = []

DEFAULT_VOICES: list[dict[str, Any]] = [
    {
        "id": "km-KH-SreymomNeural",
        "name": "Microsoft Sreymom Online (Natural) - Khmer (Cambodia)",
        "displayName": "km-KH-SreymomNeural (Female)",
        "gender": "Female",
        "locale": "km-KH",
        "languageName": "KM",
        "suggestedCodec": "audio-24khz-48kbitrate-mono-mp3",
    },
    {
        "id": "km-KH-PisethNeural",
        "name": "Microsoft Piseth Online (Natural) - Khmer (Cambodia)",
        "displayName": "km-KH-PisethNeural (Male)",
        "gender": "Male",
        "locale": "km-KH",
        "languageName": "KM",
        "suggestedCodec": "audio-24khz-48kbitrate-mono-mp3",
    },
    {
        "id": "en-US-JennyNeural",
        "name": "Microsoft Jenny Online (Natural) - English (United States)",
        "displayName": "en-US-JennyNeural (Female)",
        "gender": "Female",
        "locale": "en-US",
        "languageName": "EN",
        "suggestedCodec": "audio-24khz-48kbitrate-mono-mp3",
    },
    {
        "id": "en-US-GuyNeural",
        "name": "Microsoft Guy Online (Natural) - English (United States)",
        "displayName": "en-US-GuyNeural (Male)",
        "gender": "Male",
        "locale": "en-US",
        "languageName": "EN",
        "suggestedCodec": "audio-24khz-48kbitrate-mono-mp3",
    },
]


class EdgeTTSProvider:
    @staticmethod
    def get_capabilities() -> dict[str, Any]:
        """
        Reports provider capabilities honestly.
        Edge-TTS supports rate, pitch, and volume adjustments.
        It does NOT support arbitrary SSML emotion styles, phoneme controls, or precise duration targeting.
        """
        return {
            "provider_name": "edge_tts",
            "supports_rate": True,
            "supports_pitch": True,
            "supports_volume": True,
            "supports_ssml_emotion": False,
            "supports_phoneme_control": False,
            "supports_precise_duration": False,
            "supported_emotions": [],
        }

    @staticmethod
    async def list_voices(force_refresh: bool = False) -> list[dict[str, Any]]:

        global _VOICE_CACHE
        if _VOICE_CACHE and not force_refresh:
            return _VOICE_CACHE

        try:
            voices = await edge_tts.list_voices()
            formatted = []
            for v in voices:
                formatted.append({
                    "id": v.get("ShortName", ""),
                    "name": v.get("FriendlyName", v.get("ShortName", "")),
                    "displayName": f"{v.get('ShortName', '')} ({v.get('Gender', 'Voice')})",
                    "gender": v.get("Gender", "Neutral"),
                    "locale": v.get("Locale", ""),
                    "languageName": v.get("Locale", "").split("-")[0].upper(),
                    "suggestedCodec": v.get("SuggestedCodec", "audio-24khz-48kbitrate-mono-mp3"),
                })
            _VOICE_CACHE = formatted
            return formatted
        except Exception as e:
            logger.warning(f"Failed to fetch Edge TTS online voices ({e}), using default voices cache.")
            _VOICE_CACHE = DEFAULT_VOICES
            return DEFAULT_VOICES

    @staticmethod
    async def get_default_voice_for_locale(locale_prefix: str) -> str:
        voices = await EdgeTTSProvider.list_voices()
        prefix = locale_prefix.lower()
        for v in voices:
            if v["locale"].lower().startswith(prefix):
                return v["id"]
        # Fallbacks for specific popular languages
        if prefix.startswith("km"):
            for v in voices:
                if "km-kh" in v["locale"].lower():
                    return v["id"]
        # Universal fallback
        return "en-US-JennyNeural"

    @staticmethod
    async def generate_speech(
        text: str,
        output_path: Path,
        voice_id: str,
        rate: str = "+0%",
        pitch: str = "+0Hz",
        volume: str = "+0%",
    ) -> float:
        """
        Synthesizes speech using edge-tts with text cleaning and audio normalization.
        Converts to clean WAV pcm_s16le 24kHz.
        Returns the duration of the audio in milliseconds.
        """
        cleaned_text = clean_tts_text(text, voice_id)
        if not cleaned_text:
            output_path.parent.mkdir(parents=True, exist_ok=True)
            return await EdgeTTSProvider._generate_silence(output_path, 100)

        output_path.parent.mkdir(parents=True, exist_ok=True)
        temp_mp3 = output_path.with_suffix(".temp.mp3")

        # Retry loop for synthesis resilience
        succeeded = False
        last_error = None
        for attempt in range(3):
            try:
                communicate = edge_tts.Communicate(
                    text=cleaned_text,
                    voice=voice_id,
                    rate=rate,
                    pitch=pitch,
                    volume=volume,
                )
                await communicate.save(str(temp_mp3))
                if temp_mp3.exists() and temp_mp3.stat().st_size > 0:
                    succeeded = True
                    break
            except Exception as e:
                last_error = e
                await asyncio.sleep(0.3 * (attempt + 1))

        if not succeeded:
            logger.warning(f"Edge TTS synthesis attempt with {voice_id} failed after retries: {last_error}. Retrying with universal fallback...")
            fallback_voice = "en-US-JennyNeural" if voice_id != "en-US-JennyNeural" else "en-US-GuyNeural"
            try:
                fallback_comm = edge_tts.Communicate(
                    text=cleaned_text,
                    voice=fallback_voice,
                    rate=rate,
                    pitch=pitch,
                    volume=volume,
                )
                await fallback_comm.save(str(temp_mp3))
            except Exception as e2:
                logger.warning(f"Edge TTS network synthesis unavailable ({e2}). Generating synthesized fallback audio...")
                if temp_mp3.exists():
                    temp_mp3.unlink(missing_ok=True)
                word_count = max(1, len(cleaned_text.split()))
                estimated_duration_ms = max(800, min(10000, word_count * 320))
                return await EdgeTTSProvider._generate_silence(output_path, estimated_duration_ms)

        # Convert MP3 to 24kHz mono PCM WAV with Broadcast Studio Vocal Processing & anti-pop fade
        vocal_filters = [
            "highpass=f=75",
            "equalizer=f=220:t=q:w=1.2:g=1.8",
            "equalizer=f=3600:t=q:w=1.4:g=2.2",
            "acompressor=threshold=-16dB:ratio=2.8:attack=8:release=60:makeup=1.5",
            "alimiter=limit=0.96",
            "afade=t=in:ss=0:d=0.015",
        ]
        cmd = [
            FFMPEG_BIN,
            "-y",
            "-i", str(temp_mp3),
            "-af", ",".join(vocal_filters),
            "-acodec", "pcm_s16le",
            "-ar", "24000",
            "-ac", "1",
            str(output_path.resolve()),
        ]
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        await proc.communicate()

        # Clean up temp mp3
        if temp_mp3.exists():
            temp_mp3.unlink()

        # Verify output exists and is valid; fallback to silence if conversion failed
        if not output_path.exists() or output_path.stat().st_size == 0:
            logger.warning(f"FFmpeg conversion failed or produced empty file for {output_path}. Generating silence fallback...")
            return await EdgeTTSProvider._generate_silence(output_path, 1000)

        # Read exact duration
        duration_ms = EdgeTTSProvider.get_audio_duration_ms(output_path)
        return duration_ms

    @staticmethod
    def get_audio_duration_ms(audio_path: Path) -> float:
        try:
            info = sf.info(str(audio_path.resolve()))
            return info.duration * 1000.0
        except Exception as e:
            logger.warning(f"Failed to read audio duration using soundfile: {e}")
            return 1000.0

    @staticmethod
    async def _generate_silence(output_path: Path, duration_ms: int) -> float:
        dur_sec = max(0.1, duration_ms / 1000.0)
        cmd = [
            FFMPEG_BIN,
            "-y",
            "-f", "lavfi",
            "-i", f"anullsrc=r=24000:cl=mono",
            "-t", str(dur_sec),
            "-acodec", "pcm_s16le",
            str(output_path.resolve()),
        ]
        proc = await asyncio.create_subprocess_exec(*cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
        await proc.communicate()
        return float(duration_ms)
