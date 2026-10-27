import json
import logging
from typing import Any
import httpx
from app.core.errors import MissingApiKeyError, ProviderAuthError, ProviderRateLimitError, DubStudioError
from app.providers.base import TranscriptResultItem, TranslationResultItem

logger = logging.getLogger("dubstudio.providers.codecraft")


class CodecraftProvider:
    def __init__(
        self,
        api_key: str | None = None,
        base_url: str = "https://codecraftapi.com/v1",
        model: str = "deepseek-chat",
        timeout: float = 60.0,
    ):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.timeout = timeout

    def _get_headers(self) -> dict[str, str]:
        if not self.api_key:
            raise MissingApiKeyError("Codecraft")
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    async def test_connection(self) -> list[str]:
        headers = self._get_headers()
        url = f"{self.base_url}/models"
        async with httpx.AsyncClient(timeout=15.0) as client:
            try:
                resp = await client.get(url, headers=headers)
                if resp.status_code == 401:
                    raise ProviderAuthError("Codecraft", details="Invalid Codecraft API token")
                resp.raise_for_status()
                data = resp.json()
                models = [m.get("id", "") for m in data.get("data", []) if "id" in m]
                return models or [self.model]
            except httpx.HTTPStatusError as e:
                if e.response.status_code == 401:
                    raise ProviderAuthError("Codecraft", details=e.response.text)
                raise DubStudioError("CODECRAFT_CONN_FAILED", f"Codecraft connection check failed: {e}")
            except Exception as e:
                # If models endpoint is not exposed, verify with test completion
                return await self._test_fallback_completion()

    async def _test_fallback_completion(self) -> list[str]:
        headers = self._get_headers()
        url = f"{self.base_url}/chat/completions"
        payload = {
            "model": self.model,
            "messages": [{"role": "user", "content": "ping"}],
            "max_tokens": 5,
        }
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(url, headers=headers, json=payload)
            if resp.status_code == 401:
                raise ProviderAuthError("Codecraft", details="Invalid API key")
            resp.raise_for_status()
            return [self.model]

    async def translate(
        self,
        segments: list[dict[str, Any]],
        source_language: str,
        target_language: str,
        options: dict[str, Any] | None = None,
    ) -> list[TranslationResultItem]:
        headers = self._get_headers()
        options = options or {}
        glossary = options.get("glossary", {})
        is_khmer = target_language.lower() in ("km", "khmer", "km-kh")

        if is_khmer:
            system_prompt = (
                "You are an award-winning Cambodian film director and elite voice-over dubbing scriptwriter (អ្នកដឹកនាំរឿង និងអ្នកនិពន្ធសេណារីយ៉ូបញ្ចូលសំឡេងភាពយន្តខ្មែរអាជីព).\n"
                "Your mission is to adapt dialogue into authentic, emotional, lip-sync-ready spoken Khmer (ភាសានិយាយបញ្ចូលសំឡេងភាពយន្ត).\n\n"
                "RULES:\n"
                "1. NEVER use 'តើ...?' in questions. Use natural spoken endings: '...មែនអត់?', '...ទេ?', 'យ៉ាងម៉េចហើយ?'.\n"
                "2. Keep phrases concise to match duration_sec (rate: ~4 syllables per second).\n"
                "3. Use spoken particles: 'ណា៎', 'ហ្នឹងហើយ', 'តោះ', 'អ្ហេ៎', 'មែនតើ'.\n"
                "4. Use proper punctuation ('។', '?', '!', ',') for natural speech breathing."
            )
        else:
            system_prompt = (
                f"You are an expert video dubbing and subtitle translator from {source_language} to {target_language}.\n"
                "Produce concise, spoken-dialogue translations suitable for voice synchronization.\n"
                "Preserve names and emotional cadence. Respond ONLY with valid JSON array."
            )
        if glossary:
            system_prompt += f"\nGlossary: {json.dumps(glossary, ensure_ascii=False)}"

        payload_items = [
            {
                "id": s["id"],
                "text": s["text"],
                "speaker": s.get("speaker_id", "speaker_1"),
                **({"duration_sec": s.get("duration_sec")} if s.get("duration_sec") else {}),
            }
            for s in segments
        ]

        user_prompt = (
            f"Translate these segments to {target_language}.\n"
            "Format: JSON array of objects with keys 'id' and 'translated_text'.\n"
            f"Segments:\n{json.dumps(payload_items, ensure_ascii=False)}"
        )

        req_body = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0.3,
        }

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                resp = await client.post(f"{self.base_url}/chat/completions", headers=headers, json=req_body)
                if resp.status_code == 401:
                    raise ProviderAuthError("Codecraft", details=resp.text)
                if resp.status_code == 429:
                    raise ProviderRateLimitError("Codecraft", details=resp.text)
                resp.raise_for_status()
                data = resp.json()
                content = data["choices"][0]["message"]["content"]

                parsed = json.loads(content)
                if isinstance(parsed, dict):
                    # In case returned as {"translations": [...]} or {"segments": [...]}
                    for k in ["translations", "segments", "data"]:
                        if k in parsed and isinstance(parsed[k], list):
                            parsed = parsed[k]
                            break
                    if isinstance(parsed, dict) and not isinstance(parsed, list):
                        # Key-value map id -> text
                        parsed = [{"id": k, "translated_text": v} for k, v in parsed.items()]

                lookup = {item["id"]: str(item.get("translated_text", "")).strip() for item in parsed if "id" in item}

                results: list[TranslationResultItem] = []
                for s in segments:
                    results.append(
                        TranslationResultItem(
                            segment_id=s["id"],
                            source_text=s["text"],
                            translated_text=lookup.get(s["id"], s["text"]),
                            source_language=source_language,
                            target_language=target_language,
                        )
                    )
                return results
            except httpx.HTTPStatusError as e:
                raise DubStudioError("CODECRAFT_API_ERROR", f"Codecraft HTTP error: {e.response.status_code} - {e.response.text}")
            except Exception as e:
                raise DubStudioError("CODECRAFT_TRANSLATION_FAILED", f"Codecraft translation failed: {e}")

    async def transcribe(
        self,
        audio_path: str,
        source_language: str | None = None,
        options: dict[str, Any] | None = None,
    ) -> list[TranscriptResultItem]:
        """
        Codecraft audio transcription adapter.
        Uses OpenAI-compatible /audio/transcriptions if supported, or structured prompt.
        """
        headers = self._get_headers()
        url = f"{self.base_url}/audio/transcriptions"
        
        async with httpx.AsyncClient(timeout=self.timeout * 2) as client:
            try:
                with open(audio_path, "rb") as f:
                    files = {"file": (Path(audio_path).name, f, "audio/wav")}
                    data = {"model": "whisper-1", "response_format": "verbose_json"}
                    if source_language:
                        data["language"] = source_language

                    resp = await client.post(url, headers={"Authorization": headers["Authorization"]}, files=files, data=data)
                    if resp.status_code == 404:
                        # Fallback: transcribe is not supported on this endpoint
                        raise DubStudioError(
                            "CODECRAFT_TRANSCRIPTION_UNSUPPORTED",
                            "This Codecraft model endpoint does not support audio transcription. Please select Gemini for transcription."
                        )
                    resp.raise_for_status()
                    res_json = resp.json()

                    results: list[TranscriptResultItem] = []
                    segments = res_json.get("segments", [])
                    if segments:
                        for s in segments:
                            results.append(
                                TranscriptResultItem(
                                    start_ms=int(float(s.get("start", 0)) * 1000),
                                    end_ms=int(float(s.get("end", 0)) * 1000),
                                    text=str(s.get("text", "")).strip(),
                                    speaker_id="speaker_1",
                                    language=source_language or "en",
                                    confidence=None,
                                )
                            )
                    else:
                        full_text = res_json.get("text", "")
                        results.append(
                            TranscriptResultItem(
                                start_ms=0,
                                end_ms=5000,
                                text=full_text,
                                speaker_id="speaker_1",
                                language=source_language or "en",
                            )
                        )
                    return results
            except DubStudioError:
                raise
            except Exception as e:
                raise DubStudioError("CODECRAFT_TRANSCRIPTION_FAILED", f"Codecraft transcription failed: {e}")
