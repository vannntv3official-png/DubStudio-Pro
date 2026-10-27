import asyncio
import logging
import re
from pathlib import Path
from typing import Any
from app.core.errors import DubStudioError
from app.providers.base import TranscriptResultItem

logger = logging.getLogger("dubstudio.providers.local_asr")

_SENSEVOICE_MODEL_INSTANCE: Any = None
_PARAFORMER_MODEL_INSTANCE: Any = None
_MODEL_LOCK = asyncio.Lock()


def strip_sensevoice_tags(raw_text: str) -> tuple[str, str | None, str | None]:
    """
    Strips SenseVoice special tags (<|zh|>, <|NEUTRAL|>, <|Speech|>, etc.) while
    extracting detected language and emotion if present.
    """
    if not raw_text:
        return "", None, None

    detected_lang = None
    lang_match = re.search(r"<\|(zh|en|yue|ja|ko)\|>", raw_text)
    if lang_match:
        detected_lang = lang_match.group(1)

    detected_emotion = None
    emotion_match = re.search(r"<\|(NEUTRAL|HAPPY|SAD|ANGRY|FEARFUL|DISGUSTED|SURPRISED)\|>", raw_text, re.IGNORECASE)
    if emotion_match:
        detected_emotion = emotion_match.group(1).lower()

    # Strip all special tokens enclosed in <|...|>
    clean_text = re.sub(r"<\|[^|>]+(?:\|>)?", "", raw_text)
    clean_text = re.sub(r"\s+", " ", clean_text).strip()
    return clean_text, detected_lang, detected_emotion


class SenseVoiceProvider:
    """
    Local transcription provider using Alibaba's SenseVoice-Small.
    Supports multi-lingual speech recognition (Chinese, English, Cantonese, Japanese, Korean)
    with high-speed inference, rich emotion detection, and sentence timestamps.
    """

    def __init__(self, model: str = "SenseVoice-Small", local_url: str | None = None):
        self.model = model or "SenseVoice-Small"
        self.local_url = local_url.strip() if local_url and local_url.strip() else None

    async def transcribe(
        self,
        audio_path: str,
        source_language: str | None = None,
        options: dict[str, Any] | None = None,
    ) -> list[TranscriptResultItem]:
        path = Path(audio_path)
        if not path.exists():
            raise DubStudioError("AUDIO_FILE_NOT_FOUND", f"Audio file not found: {audio_path}")

        # If a local HTTP server URL is specified and not empty, use remote HTTP endpoint
        if self.local_url and self.local_url.startswith("http"):
            try:
                import httpx
                async with httpx.AsyncClient(timeout=300.0) as client:
                    with open(path, "rb") as f:
                        files = {"file": (path.name, f, "audio/wav")}
                        data = {"model": "SenseVoice-Small", "language": source_language or "auto"}
                        # Check endpoint
                        target_url = self.local_url.rstrip("/")
                        if not target_url.endswith("/transcribe") and not target_url.endswith("/v1/audio/transcriptions"):
                            target_url += "/transcribe"
                        resp = await client.post(target_url, files=files, data=data)
                        if resp.status_code == 200:
                            res_json = resp.json()
                            return self._parse_api_response(res_json, source_language)
            except Exception as e:
                logger.warning(f"SenseVoice local HTTP server request failed ({e}), falling back to in-process model...")

        # In-process local inference using FunASR
        return await self._run_in_process_inference(path, source_language)

    async def _run_in_process_inference(self, audio_path: Path, source_language: str | None) -> list[TranscriptResultItem]:
        global _SENSEVOICE_MODEL_INSTANCE

        try:
            import torch
            from funasr import AutoModel
        except ImportError as e:
            raise DubStudioError(
                "SENSEVOICE_NOT_INSTALLED",
                f"FunASR / PyTorch is not yet ready in the local environment ({e}). "
                "Please run 'uv pip install funasr modelscope torch' or verify your local Python environment.",
            )

        async with _MODEL_LOCK:
            if _SENSEVOICE_MODEL_INSTANCE is None:
                logger.info("Loading SenseVoice-Small model into memory...")
                device = "cuda:0" if torch.cuda.is_available() else "cpu"
                _SENSEVOICE_MODEL_INSTANCE = await asyncio.to_thread(
                    AutoModel,
                    model="iic/SenseVoiceSmall",
                    vad_model="iic/speech_fsmn_vad_zh-cn-16k-common-pytorch",
                    vad_kwargs={"max_single_segment_time": 30000},
                    device=device,
                    disable_update=True,
                )

        model = _SENSEVOICE_MODEL_INSTANCE

        # Map language parameter
        lang_param = "auto"
        if source_language:
            sl = source_language.lower()
            if sl in ("zh", "chinese", "mandarin", "cmn"):
                lang_param = "zh"
            elif sl in ("en", "english"):
                lang_param = "en"
            elif sl in ("yue", "cantonese"):
                lang_param = "yue"
            elif sl in ("ja", "japanese"):
                lang_param = "ja"
            elif sl in ("ko", "korean"):
                lang_param = "ko"

        logger.info(f"SenseVoice-Small running inference on {audio_path.name} (language={lang_param})...")
        try:
            res = await asyncio.to_thread(
                model.generate,
                input=str(audio_path.resolve()),
                cache={},
                language=lang_param,
                use_itn=True,
                batch_size_s=60,
                merge_vad=True,
                merge_length_s=15,
            )
        except Exception as gen_err:
            logger.error(f"SenseVoice inference error: {gen_err}")
            raise DubStudioError("SENSEVOICE_INFERENCE_FAILED", f"SenseVoice transcription failed: {gen_err}")

        return self._format_funasr_results(res, fallback_lang=source_language or "zh")

    def _format_funasr_results(self, funasr_output: Any, fallback_lang: str) -> list[TranscriptResultItem]:
        results: list[TranscriptResultItem] = []
        if not funasr_output or not isinstance(funasr_output, list):
            return results

        for item in funasr_output:
            if not isinstance(item, dict):
                continue

            raw_text = item.get("text", "")
            clean_text, detected_lang, emotion = strip_sensevoice_tags(raw_text)
            lang = detected_lang or fallback_lang

            # If sentence_info is provided by VAD
            sentence_info = item.get("sentence_info", [])
            if sentence_info and isinstance(sentence_info, list):
                for s in sentence_info:
                    s_raw = s.get("text", "")
                    s_clean, s_lang, s_emo = strip_sensevoice_tags(s_raw)
                    if not s_clean:
                        continue
                    start_ms = int(s.get("start", 0))
                    end_ms = int(s.get("end", start_ms + 1000))

                    # Parse word timings if present
                    word_list = []
                    raw_words = s.get("words", [])
                    if isinstance(raw_words, list):
                        for w in raw_words:
                            if isinstance(w, dict):
                                word_list.append({
                                    "word": str(w.get("word", "")),
                                    "start_ms": int(w.get("start", start_ms)),
                                    "end_ms": int(w.get("end", end_ms)),
                                })

                    results.append(
                        TranscriptResultItem(
                            start_ms=start_ms,
                            end_ms=max(start_ms + 200, end_ms),
                            text=s_clean,
                            speaker_id=str(s.get("spk", "speaker_1")),
                            language=s_lang or lang,
                            confidence=float(s.get("confidence", 0.95)),
                            words=word_list,
                        )
                    )
            elif clean_text:
                # If only raw text and global timestamps are available
                timestamp = item.get("timestamp", [])
                start_ms = 0
                end_ms = 3000
                if timestamp and isinstance(timestamp, list) and len(timestamp) > 0:
                    start_ms = int(timestamp[0][0])
                    end_ms = int(timestamp[-1][1])

                results.append(
                    TranscriptResultItem(
                        start_ms=start_ms,
                        end_ms=max(start_ms + 200, end_ms),
                        text=clean_text,
                        speaker_id="speaker_1",
                        language=lang,
                        confidence=0.95,
                        words=[],
                    )
                )

        return results

    def _parse_api_response(self, data: Any, fallback_lang: str | None) -> list[TranscriptResultItem]:
        results: list[TranscriptResultItem] = []
        segments = data.get("segments") or data.get("data") or (data if isinstance(data, list) else [])
        for s in segments:
            clean_text, detected_lang, _ = strip_sensevoice_tags(str(s.get("text", "")))
            if not clean_text:
                continue
            results.append(
                TranscriptResultItem(
                    start_ms=int(s.get("start_ms", s.get("start", 0) * 1000 if isinstance(s.get("start"), float) else s.get("start", 0))),
                    end_ms=int(s.get("end_ms", s.get("end", 1) * 1000 if isinstance(s.get("end"), float) else s.get("end", 1000))),
                    text=clean_text,
                    speaker_id=str(s.get("speaker_id", "speaker_1")),
                    language=detected_lang or str(s.get("language", fallback_lang or "zh")),
                    confidence=s.get("confidence"),
                    words=s.get("words", []),
                )
            )
        return results


class ParaformerProvider:
    """
    Local transcription provider using Alibaba's Paraformer-zh.
    High-accuracy non-autoregressive Chinese speech recognition model with
    integrated Voice Activity Detection (FSMN-VAD) and Punctuation Restoration (CT-Transformer).
    """

    def __init__(self, model: str = "Paraformer-zh", local_url: str | None = None):
        self.model = model or "Paraformer-zh"
        self.local_url = local_url.strip() if local_url and local_url.strip() else None

    async def transcribe(
        self,
        audio_path: str,
        source_language: str | None = None,
        options: dict[str, Any] | None = None,
    ) -> list[TranscriptResultItem]:
        path = Path(audio_path)
        if not path.exists():
            raise DubStudioError("AUDIO_FILE_NOT_FOUND", f"Audio file not found: {audio_path}")

        # If a local HTTP server URL is specified and not empty, use remote HTTP endpoint
        if self.local_url and self.local_url.startswith("http"):
            try:
                import httpx
                async with httpx.AsyncClient(timeout=300.0) as client:
                    with open(path, "rb") as f:
                        files = {"file": (path.name, f, "audio/wav")}
                        data = {"model": "Paraformer-zh", "language": "zh"}
                        target_url = self.local_url.rstrip("/")
                        if not target_url.endswith("/transcribe") and not target_url.endswith("/v1/audio/transcriptions"):
                            target_url += "/transcribe"
                        resp = await client.post(target_url, files=files, data=data)
                        if resp.status_code == 200:
                            return self._parse_api_response(resp.json())
            except Exception as e:
                logger.warning(f"Paraformer local HTTP server request failed ({e}), falling back to in-process model...")

        # In-process local inference using FunASR
        return await self._run_in_process_inference(path)

    async def _run_in_process_inference(self, audio_path: Path) -> list[TranscriptResultItem]:
        global _PARAFORMER_MODEL_INSTANCE

        try:
            import torch
            from funasr import AutoModel
        except ImportError as e:
            raise DubStudioError(
                "PARAFORMER_NOT_INSTALLED",
                f"FunASR / PyTorch is not yet ready in the local environment ({e}). "
                "Please run 'uv pip install funasr modelscope torch' or verify your local Python environment.",
            )

        async with _MODEL_LOCK:
            if _PARAFORMER_MODEL_INSTANCE is None:
                logger.info("Loading Paraformer-zh model into memory (with VAD and Punc)...")
                device = "cuda:0" if torch.cuda.is_available() else "cpu"
                _PARAFORMER_MODEL_INSTANCE = await asyncio.to_thread(
                    AutoModel,
                    model="iic/speech_paraformer-large-vad-punc_asr_nat-zh-cn-16k-common-vocab8404-pytorch",
                    vad_model="iic/speech_fsmn_vad_zh-cn-16k-common-pytorch",
                    punc_model="iic/punc_ct-transformer_zh-cn-common-vocab272727-pytorch",
                    device=device,
                    disable_update=True,
                )

        model = _PARAFORMER_MODEL_INSTANCE

        logger.info(f"Paraformer-zh running Chinese ASR inference on {audio_path.name}...")
        try:
            res = await asyncio.to_thread(
                model.generate,
                input=str(audio_path.resolve()),
                batch_size_s=300,
            )
        except Exception as gen_err:
            logger.error(f"Paraformer inference error: {gen_err}")
            raise DubStudioError("PARAFORMER_INFERENCE_FAILED", f"Paraformer transcription failed: {gen_err}")

        return self._format_funasr_results(res)

    def _format_funasr_results(self, funasr_output: Any) -> list[TranscriptResultItem]:
        results: list[TranscriptResultItem] = []
        if not funasr_output or not isinstance(funasr_output, list):
            return results

        for item in funasr_output:
            if not isinstance(item, dict):
                continue

            sentence_info = item.get("sentence_info", [])
            if sentence_info and isinstance(sentence_info, list):
                for s in sentence_info:
                    text = str(s.get("text", "")).strip()
                    if not text:
                        continue
                    start_ms = int(s.get("start", 0))
                    end_ms = int(s.get("end", start_ms + 1000))
                    results.append(
                        TranscriptResultItem(
                            start_ms=start_ms,
                            end_ms=max(start_ms + 200, end_ms),
                            text=text,
                            speaker_id=str(s.get("spk", "speaker_1")),
                            language="zh",
                            confidence=0.98,
                            words=[],
                        )
                    )
            else:
                raw_text = str(item.get("text", "")).strip()
                if raw_text:
                    timestamp = item.get("timestamp", [])
                    start_ms = int(timestamp[0][0]) if timestamp else 0
                    end_ms = int(timestamp[-1][1]) if timestamp else 3000
                    results.append(
                        TranscriptResultItem(
                            start_ms=start_ms,
                            end_ms=max(start_ms + 200, end_ms),
                            text=raw_text,
                            speaker_id="speaker_1",
                            language="zh",
                            confidence=0.98,
                            words=[],
                        )
                    )

        return results

    def _parse_api_response(self, data: Any) -> list[TranscriptResultItem]:
        results: list[TranscriptResultItem] = []
        segments = data.get("segments") or data.get("data") or (data if isinstance(data, list) else [])
        for s in segments:
            text = str(s.get("text", "")).strip()
            if not text:
                continue
            results.append(
                TranscriptResultItem(
                    start_ms=int(s.get("start_ms", s.get("start", 0) * 1000 if isinstance(s.get("start"), float) else s.get("start", 0))),
                    end_ms=int(s.get("end_ms", s.get("end", 1) * 1000 if isinstance(s.get("end"), float) else s.get("end", 1000))),
                    text=text,
                    speaker_id=str(s.get("speaker_id", "speaker_1")),
                    language="zh",
                    confidence=s.get("confidence", 0.98),
                    words=s.get("words", []),
                )
            )
        return results
