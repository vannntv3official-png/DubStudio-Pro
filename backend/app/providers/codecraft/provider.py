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
        from app.services.translation.validator import TranslationBatchValidator
        from app.services.khmer.localization_guard import (
            build_khmer_system_instruction,
            detect_text_language,
            get_language_display_name,
            sanitize_khmer_dubbing_text,
        )

        headers = self._get_headers()
        options = options or {}
        glossary = options.get("glossary", {})
        character_memory = options.get("character_memory", {})
        dubbing_register = options.get("dubbing_register", "natural")
        is_khmer = target_language.lower() in ("km", "khmer", "km-kh")

        # Auto-detect actual source language script from segments if set to 'en' or 'auto'
        actual_source_lang = source_language
        if not actual_source_lang or actual_source_lang.lower() in ("auto", "detect", "auto-detect", "en"):
            detected = detect_text_language(segments, fallback=source_language or "en")
            if detected != "en" or actual_source_lang.lower() in ("auto", "detect", "auto-detect"):
                actual_source_lang = detected

        if is_khmer:
            system_prompt = build_khmer_system_instruction()
        else:
            system_prompt = (
                f"You are a professional video dubbing translator from {get_language_display_name(actual_source_lang)} to {get_language_display_name(target_language)}.\n"
                "Produce three separated representations per segment:\n"
                "- 'translated_text': Faithful translation.\n"
                "- 'spoken_script': Natural dialogue adapted to duration_sec.\n"
                "- 'subtitle_text': Concise on-screen subtitle.\n"
            )

        if glossary:
            system_prompt += f"\nGlossary: {json.dumps(glossary, ensure_ascii=False)}"
        if character_memory:
            system_prompt += f"\nCharacter Context: {json.dumps(character_memory, ensure_ascii=False)}"

        # Build alias map so LLM sees clean short IDs ("seg_1", "seg_2")
        id_alias_map: dict[str, str] = {}
        payload_items = []
        for i, s in enumerate(segments):
            short_id = f"seg_{i + 1}"
            id_alias_map[short_id] = s["id"]
            id_alias_map[str(i + 1)] = s["id"]
            id_alias_map[s["id"]] = s["id"]
            payload_items.append({
                "id": short_id,
                "text": s["text"],
                "speaker": s.get("speaker_name") or s.get("speaker_id", "speaker_1"),
                "duration_sec": s.get("duration_sec", 2.0),
                **({"preceding": s.get("preceding")} if s.get("preceding") else {}),
                **({"following": s.get("following")} if s.get("following") else {}),
                **({"preferred_address": s.get("preferred_address")} if s.get("preferred_address") else {}),
            })

        src_desc = get_language_display_name(actual_source_lang)
        tgt_desc = "Khmer (ភាសាខ្មែរ - 100% Pure Khmer script only)" if is_khmer else get_language_display_name(target_language)
        user_prompt = (
            f"Translate and adapt the following dialogue segments from {src_desc} to {tgt_desc} (Register: {dubbing_register}).\n"
            "Format: JSON array of objects with keys 'id' (e.g. 'seg_1', 'seg_2'), 'translated_text', 'spoken_script', 'subtitle_text', 'form_of_address'.\n"
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
                    for k in ["translations", "segments", "data"]:
                        if k in parsed and isinstance(parsed[k], list):
                            parsed = parsed[k]
                            break
                    if isinstance(parsed, dict) and not isinstance(parsed, list):
                        parsed = [{"id": k, "translated_text": v} for k, v in parsed.items()]

                if not isinstance(parsed, list):
                    raise DubStudioError("TRANSLATION_PARSE_ERROR", f"Expected list of segments from Codecraft, got: {type(parsed)}")

                requested_ids = [s["id"] for s in segments]
                validated_lookup = TranslationBatchValidator.validate_batch_structure(
                    requested_ids=requested_ids,
                    response_items=parsed,
                    id_alias_map=id_alias_map,
                )


                results: list[TranslationResultItem] = []
                for s in segments:
                    item = validated_lookup[s["id"]]
                    t_text = str(item.get("translated_text", "")).strip()
                    sp_script = str(item.get("spoken_script") or t_text).strip()
                    sub_text = str(item.get("subtitle_text") or t_text).strip()
                    form_addr = item.get("form_of_address")

                    if is_khmer:
                        t_text = sanitize_khmer_dubbing_text(t_text)
                        sp_script = sanitize_khmer_dubbing_text(sp_script)
                        sub_text = sanitize_khmer_dubbing_text(sub_text)

                    advisory_reasons = TranslationBatchValidator.run_advisory_checks(
                        source_text=s["text"],
                        translated_text=t_text,
                        spoken_script=sp_script,
                        duration_sec=s.get("duration_sec", 0.0),
                        glossary=glossary,
                        preferred_address=s.get("preferred_address"),
                        target_language=target_language,
                    )

                    results.append(
                        TranslationResultItem(
                            segment_id=s["id"],
                            source_text=s["text"],
                            translated_text=t_text,
                            spoken_script=sp_script,
                            subtitle_text=sub_text,
                            source_language=actual_source_lang,
                            target_language=target_language,
                            form_of_address=form_addr,
                            register=dubbing_register,
                            review_reasons=advisory_reasons,
                        )
                    )
                return results
            except (DubStudioError, ProviderAuthError, ProviderRateLimitError):
                raise
            except httpx.HTTPStatusError as e:
                raise DubStudioError("CODECRAFT_API_ERROR", f"Codecraft HTTP error: {e.response.status_code} - {e.response.text}")
            except Exception as e:
                raise DubStudioError("CODECRAFT_TRANSLATION_FAILED", f"Codecraft translation failed: {e}")

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
