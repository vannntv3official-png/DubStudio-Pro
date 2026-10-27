import asyncio
import json
import logging
from pathlib import Path
from typing import Any
from google import genai
from google.genai import types
from app.core.errors import MissingApiKeyError, ProviderAuthError, ProviderRateLimitError, DubStudioError
from app.providers.base import TranscriptResultItem, TranslationResultItem

logger = logging.getLogger("dubstudio.providers.gemini")

FALLBACK_CANDIDATES: dict[str, list[str]] = {
    "gemini-3.8-flash": ["gemini-2.5-flash", "gemini-flash-latest", "gemini-2.5-flash-lite"],
    "gemini-2.5-flash": ["gemini-flash-latest", "gemini-2.5-flash-lite", "gemini-2.5-pro"],
    "gemini-2.5-pro": ["gemini-2.5-flash", "gemini-flash-latest"],
    "gemini-flash-latest": ["gemini-2.5-flash", "gemini-2.5-flash-lite"],
}
DEFAULT_FALLBACKS = ["gemini-2.5-flash", "gemini-flash-latest"]


def sanitize_gemini_key(raw_key: str | None) -> str | None:
    if not raw_key:
        return None
    k = raw_key.strip().strip('"').strip("'").strip()
    if k.lower().startswith("bearer "):
        k = k[7:].strip()
    if k.startswith("GEMINI_API_KEY="):
        k = k[15:].strip().strip('"').strip("'").strip()
    if k.startswith("GOOGLE_API_KEY="):
        k = k[15:].strip().strip('"').strip("'").strip()
    if k.lower() in ("dummy_test_key", "your_api_key_here", "aizasy...", "placeholder", "test_key", "dummy_key"):
        return None
    return k or None


def parse_gemini_keys(val: Any) -> list[str]:
    """Extract and sanitize a list of unique Gemini API keys from a string, list, or JSON array."""
    if not val:
        return []

    raw_list: list[str] = []
    if isinstance(val, list):
        raw_list = [str(x) for x in val if x]
    elif isinstance(val, str):
        s = val.strip()
        if s.startswith("[") and s.endswith("]"):
            try:
                parsed = json.loads(s)
                if isinstance(parsed, list):
                    raw_list = [str(x) for x in parsed if x]
            except Exception:
                raw_list = s.replace(",", "\n").replace(";", "\n").splitlines()
        else:
            raw_list = s.replace(",", "\n").replace(";", "\n").splitlines()
    else:
        raw_list = [str(val)]

    keys: list[str] = []
    seen = set()
    for item in raw_list:
        sanitized = sanitize_gemini_key(item)
        if sanitized and sanitized not in seen:
            seen.add(sanitized)
            keys.append(sanitized)
    return keys


class GeminiProvider:
    _global_key_index: int = 0

    def __init__(
        self,
        api_key: str | None = None,
        api_keys: list[str] | str | None = None,
        model: str = "gemini-2.5-flash",
    ):
        keys: list[str] = []
        if api_keys:
            keys.extend(parse_gemini_keys(api_keys))
        if api_key:
            for k in parse_gemini_keys(api_key):
                if k not in keys:
                    keys.append(k)

        self.api_keys = keys
        self.api_key = self.api_keys[0] if self.api_keys else None
        self.model = model

    def _get_client_for_key(self, key: str) -> genai.Client:
        if not key:
            raise MissingApiKeyError("Gemini")

        if key.startswith("cc_"):
            raise ProviderAuthError(
                "Gemini",
                details="You entered a Codecraft API key (starts with 'cc_') in the Google Gemini field. Please enter a Google AI Studio API key (starts with 'AIzaSy...')."
            )
        if key.startswith("sk-"):
            raise ProviderAuthError(
                "Gemini",
                details="You entered an OpenAI API key (starts with 'sk-') in the Google Gemini field. Please enter a Google AI Studio API key (starts with 'AIzaSy...')."
            )
        if key.startswith("ya29."):
            raise ProviderAuthError(
                "Gemini",
                details="You entered a temporary Google OAuth access token (starts with 'ya29.'). Gemini API requires an API key from Google AI Studio (https://aistudio.google.com/apikey)."
            )

        try:
            http_options = types.HttpOptions(
                retry_options=types.HttpRetryOptions(attempts=1)
            )
            return genai.Client(api_key=key, http_options=http_options)
        except Exception as e:
            raise ProviderAuthError("Gemini", details=str(e))

    def _get_client(self) -> genai.Client:
        if not self.api_key:
            raise MissingApiKeyError("Gemini")
        return self._get_client_for_key(self.api_key)

    async def test_connection(self) -> list[str]:
        if not self.api_keys:
            raise MissingApiKeyError("Gemini")

        last_err: Exception | None = None
        valid_models: list[str] = []

        for key in self.api_keys:
            try:
                client = self._get_client_for_key(key)
                models_pager = client.models.list(config={"page_size": 20})
                for m in models_pager:
                    name = getattr(m, "name", "")
                    if name.startswith("models/"):
                        name = name[7:]
                    if name and ("gemini" in name or "flash" in name):
                        if name not in valid_models:
                            valid_models.append(name)
            except Exception as e:
                last_err = e
                err_str = str(e)
                if "ACCESS_TOKEN_TYPE_UNSUPPORTED" in err_str:
                    raise ProviderAuthError(
                        "Gemini",
                        details="Google rejected the key (ACCESS_TOKEN_TYPE_UNSUPPORTED). Please verify you created a valid API key in Google AI Studio (https://aistudio.google.com/apikey), which starts with 'AIzaSy...'. Google Cloud OAuth access tokens and Vertex AI credentials are not supported here."
                    )

        if valid_models:
            return valid_models[:10]

        if last_err:
            err_str = str(last_err)
            if "API_KEY_INVALID" in err_str or "API key not valid" in err_str:
                raise ProviderAuthError(
                    "Gemini",
                    details="None of the provided Gemini API keys are valid. Please verify your keys from https://aistudio.google.com/apikey."
                )
            raise DubStudioError("CONNECTION_TEST_FAILED", f"Gemini connection test failed: {err_str}")

        return ["gemini-2.5-flash", "gemini-flash-latest", "gemini-2.5-pro"]

    async def _generate_content_resilient(
        self,
        contents: list[Any],
        config: types.GenerateContentConfig,
        task_name: str = "generation",
    ) -> Any:
        if not self.api_keys:
            raise MissingApiKeyError("Gemini")

        num_keys = len(self.api_keys)
        # Round-robin starting key cursor across calls
        start_key_idx = GeminiProvider._global_key_index % num_keys
        GeminiProvider._global_key_index = (GeminiProvider._global_key_index + 1) % 1_000_000

        ordered_keys = [self.api_keys[(start_key_idx + i) % num_keys] for i in range(num_keys)]

        primary_model = self.model or "gemini-2.5-flash"
        fallbacks = FALLBACK_CANDIDATES.get(primary_model, DEFAULT_FALLBACKS)
        candidate_models = [primary_model]
        for m in fallbacks:
            if m not in candidate_models:
                candidate_models.append(m)

        last_error: Exception | None = None

        for key_idx, current_key in enumerate(ordered_keys):
            client = self._get_client_for_key(current_key)
            masked_key = f"...{current_key[-4:]}" if len(current_key) >= 4 else "..."

            for model_idx, model_to_try in enumerate(candidate_models):
                is_model_fallback = (model_idx > 0)
                is_key_fallback = (key_idx > 0)

                for attempt in range(1, 3):
                    try:
                        logger.info(
                            f"Gemini {task_name} invoking model '{model_to_try}' with key {masked_key} (attempt {attempt})..."
                        )
                        response = await asyncio.to_thread(
                            client.models.generate_content,
                            model=model_to_try,
                            contents=contents,
                            config=config,
                        )
                        if is_key_fallback or is_model_fallback:
                            logger.info(
                                f"Gemini {task_name} succeeded with key {masked_key} and model '{model_to_try}'!"
                            )
                        return response
                    except Exception as e:
                        last_error = e
                        err_str = str(e)
                        logger.warning(
                            f"Gemini {task_name} (key {masked_key}, model '{model_to_try}', attempt {attempt}) failed: {err_str[:200]}"
                        )

                        if "AUDIO_FILE_NOT_FOUND" in err_str:
                            raise

                        is_rate_limited = "429" in err_str or "RESOURCE_EXHAUSTED" in err_str or "quota" in err_str.lower()
                        is_auth_error = "API_KEY_INVALID" in err_str or "401" in err_str or "403" in err_str or "API key not valid" in err_str
                        is_unavailable = "503" in err_str or "UNAVAILABLE" in err_str or "high demand" in err_str.lower()
                        is_not_found = "404" in err_str or "NOT_FOUND" in err_str

                        # If rate limited (429) or auth error on this specific key,
                        # rotate to the next key in the pool immediately!
                        if (is_rate_limited or is_auth_error) and key_idx < len(ordered_keys) - 1:
                            logger.warning(
                                f"Gemini key {masked_key} encountered {err_str[:80]}. Automatically rotating to next key in pool..."
                            )
                            break

                        # If model is unavailable (503) or not found (404), break to try next model
                        if is_unavailable or is_not_found:
                            break

                        if attempt < 2:
                            await asyncio.sleep(1.5)

                # Check if we should rotate to next key due to rate limit/auth error
                err_str = str(last_error or "")
                if ("429" in err_str or "RESOURCE_EXHAUSTED" in err_str or "API_KEY_INVALID" in err_str) and key_idx < len(ordered_keys) - 1:
                    break

        err_msg = str(last_error) if last_error else "Unknown Gemini service error"
        if "503" in err_msg or "UNAVAILABLE" in err_msg or "high demand" in err_msg.lower():
            raise DubStudioError(
                "GEMINI_UNAVAILABLE",
                f"Google Gemini is currently experiencing high demand (503 UNAVAILABLE). "
                f"Attempted models: {candidate_models}. "
                "Spikes are usually temporary. Please try again in a few moments or switch to 'gemini-2.5-flash' in Settings."
            )
        if "RESOURCE_EXHAUSTED" in err_msg or "429" in err_msg:
            raise ProviderRateLimitError("Gemini", details=err_msg)
        raise DubStudioError(
            "TRANSCRIPTION_FAILED" if task_name == "transcription" else "TRANSLATION_FAILED",
            f"Gemini {task_name} failed: {err_msg}"
        )

    async def transcribe(
        self,
        audio_path: str,
        source_language: str | None = None,
        options: dict[str, Any] | None = None,
    ) -> list[TranscriptResultItem]:
        path = Path(audio_path)
        if not path.exists():
            raise DubStudioError("AUDIO_FILE_NOT_FOUND", f"Audio file not found: {audio_path}")

        prompt = (
            "You are an expert film subtitle and dubbing transcription engine (CapCut/TikTok style).\n"
            "Transcribe the spoken audio with HIGH-PRECISION TIMESTAMPS and NATURAL BREATH-PAUSE SEGMENTATION.\n\n"
            "CRITICAL SEGMENTATION RULES (កាត់ខ្លីតាមដង្ហើម):\n"
            "1. NEVER output long paragraphs or run-on sentences. Maximum 4 to 8 words (or 1.5 to 3.0 seconds) per segment.\n"
            "2. Split speech into short natural phrases matching the speaker's breathing pauses, intonation breaks, and punctuation (periods '។', commas ',', question marks '?', ellipses).\n"
            "3. Timestamps 'start_ms' and 'end_ms' must be strictly accurate to the exact audio millisecond when each phrase begins and ends.\n"
            "4. Each segment must have word-level timings in the 'words' array: [{'word': '...', 'start_ms': 1200, 'end_ms': 1500}].\n\n"
            "Format the output strictly as a JSON array of segment objects:\n"
            "[\n"
            "  {\n"
            "    \"start_ms\": 1200,\n"
            "    \"end_ms\": 3400,\n"
            "    \"text\": \"...\",\n"
            "    \"speaker_id\": \"speaker_1\",\n"
            "    \"language\": \"km\",\n"
            "    \"words\": [{\"word\": \"...\", \"start_ms\": 1200, \"end_ms\": 1600}]\n"
            "  }\n"
            "]"
        )
        if source_language:
            prompt += f" The expected spoken language is {source_language}."

        try:
            with open(path, "rb") as f:
                audio_bytes = f.read()

            audio_part = types.Part.from_bytes(
                data=audio_bytes,
                mime_type="audio/wav"
            )

            response = await self._generate_content_resilient(
                contents=[audio_part, prompt],
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    temperature=0.2,
                ),
                task_name="transcription",
            )

            raw_text = response.text or ""
            data = json.loads(raw_text)
            if isinstance(data, dict) and "segments" in data:
                data = data["segments"]

            results: list[TranscriptResultItem] = []
            for item in data:
                results.append(
                    TranscriptResultItem(
                        start_ms=int(item.get("start_ms", 0)),
                        end_ms=int(item.get("end_ms", 0)),
                        text=str(item.get("text", "")).strip(),
                        speaker_id=str(item.get("speaker_id", "speaker_1")),
                        language=str(item.get("language", source_language or "en")),
                        confidence=item.get("confidence"),
                        words=item.get("words", []),
                    )
                )
            return results
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse Gemini transcription JSON: {e}, raw: {raw_text[:500]}")
            raise DubStudioError("TRANSCRIPTION_PARSE_ERROR", "Failed to parse transcription response from Gemini.")
        except (DubStudioError, ProviderAuthError, ProviderRateLimitError):
            raise
        except Exception as e:
            err_str = str(e)
            if "RESOURCE_EXHAUSTED" in err_str or "429" in err_str:
                raise ProviderRateLimitError("Gemini", details=err_str)
            if "API_KEY_INVALID" in err_str or "401" in err_str or "403" in err_str:
                raise ProviderAuthError("Gemini", details=err_str)
            raise DubStudioError("TRANSCRIPTION_FAILED", f"Gemini transcription failed: {err_str}")

    async def translate(
        self,
        segments: list[dict[str, Any]],
        source_language: str,
        target_language: str,
        options: dict[str, Any] | None = None,
    ) -> list[TranslationResultItem]:
        options = options or {}
        glossary = options.get("glossary", {})
        is_khmer = target_language.lower() in ("km", "khmer", "km-kh")

        if is_khmer:
            system_instruction = (
                "You are an award-winning Cambodian film director and elite voice-over dubbing scriptwriter (អ្នកដឹកនាំរឿង និងអ្នកនិពន្ធសេណារីយ៉ូបញ្ចូលសំឡេងភាពយន្តខ្មែរអាជីព).\n"
                "Your mission is to adapt and transcreate dialogue into authentic, emotional, lip-sync-ready spoken Khmer (ភាសានិយាយបញ្ចូលសំឡេងភាពយន្ត) rather than stiff literal translation.\n\n"
                "### CORE KHMER DUBBING PRINCIPLES:\n"
                "1. NATURAL SPOKEN COLLOQUIAL KHMER (ភាសានិយាយរស់រវើក មិនមែនភាសាសៀវភៅវេយ្យាករណ៍):\n"
                "   - NEVER start questions with 'តើ...?' (e.g., never say 'តើអ្នកសុខសប្បាយជាទេ?' -> say 'យ៉ាងម៉េចហើយ? សុខសប្បាយទេ?').\n"
                "   - NEVER use passive voice constructs like 'ត្រូវបាន...' or 'ដែលជា...'.\n"
                "   - Use authentic spoken phrases: 'កើតអីហ្នឹង?', 'មែនអត់?', 'ទៅណា?', 'ដឹងអត់?', 'កុំបារម្ភអី', 'ឈប់សិន!', 'អត់មានអីទេ'.\n"
                "2. EMOTIONAL DUBBING PARTICLES (ពាក្យបន្ថែមអារម្មណ៍តួអង្គ):\n"
                "   - Use Cambodian movie dubbing particles naturally to match character personality:\n"
                "     * Warm/Friendly: 'ណា៎', 'ណាបង', 'ហ្នឹងហើយ'\n"
                "     * Shock/Surprise: 'អ្ហ៎ា!', 'អេ៎!', 'ហ្ហាស?', 'អ្ហេ៎?', 'មែនតើ!'\n"
                "     * Urgency/Action: 'តោះ!', 'ទៅណា៎', 'អីចឹងតើ!', 'ឆាប់ឡើង!'\n"
                "3. LIP-SYNC TIMING & SYLLABLE PACING (ស៊ីចង្វាក់ពេលវេលា និងដង្ហើម):\n"
                "   - Each segment has 'duration_sec'. In natural spoken Khmer, a voice actor speaks ~3.8 to 4.2 syllables per second.\n"
                "   - Target syllable count = duration_sec * 4. Strictly avoid making Khmer text longer than the speech window!\n"
                "   - Short lines (0.5s - 1.5s): Keep to 3-6 syllables (e.g. 'ឈប់សិន!', 'ទៅណា?', 'ឯង...មែនទេ?').\n"
                "4. PROSODY PUNCTUATION FOR NEURAL TTS:\n"
                "   - Insert clean Khmer punctuation ('។', '?', '!', ',') at natural breathing pause points so the neural voice model modulates pitch, breathes, and sounds human.\n"
                "5. CONTEXTUAL PRONOUNS:\n"
                "   - Adapt pronouns to character relationships: friends/peers (ឯង/យើង), lovers/family (បង/អូន, ម៉ែ, ពុក), elders (លោកពូ, អ្នកមីង, លោកតា) instead of robotic 'អ្នក' for everyone.\n"
            )
        else:
            system_instruction = (
                f"You are a professional video dubbing translator translating dialogue from {source_language} to {target_language}.\n"
                "Maintain the original tone, comedic or emotional nuances, and speaker personality.\n"
                "Crucially, keep translations concise so that dubbed speech can fit natural timing.\n"
                "Preserve character names and proper nouns appropriately.\n"
            )

        if glossary:
            system_instruction += f"\nTerminology glossary to adhere to: {json.dumps(glossary, ensure_ascii=False)}"

        payload_items = [
            {
                "id": s["id"],
                "text": s["text"],
                "speaker": s.get("speaker_id", "speaker_1"),
                **({"duration_sec": s.get("duration_sec")} if s.get("duration_sec") else {}),
            }
            for s in segments
        ]

        prompt = (
            f"Translate the following conversation segments into {target_language}.\n"
            "Return a JSON array where each object has:\n"
            "- 'id': the exact segment id matching the input\n"
            "- 'translated_text': the natural translation in target language\n"
            f"Input segments:\n{json.dumps(payload_items, ensure_ascii=False)}"
        )

        try:
            response = await self._generate_content_resilient(
                contents=[prompt],
                config=types.GenerateContentConfig(
                    system_instruction=system_instruction,
                    response_mime_type="application/json",
                    temperature=0.3,
                ),
                task_name="translation",
            )

            raw_text = response.text or ""
            data = json.loads(raw_text)
            if isinstance(data, dict) and "translations" in data:
                data = data["translations"]

            lookup = {item["id"]: str(item.get("translated_text", "")).strip() for item in data}

            results: list[TranslationResultItem] = []
            for s in segments:
                t_text = lookup.get(s["id"], s["text"])
                results.append(
                    TranslationResultItem(
                        segment_id=s["id"],
                        source_text=s["text"],
                        translated_text=t_text,
                        source_language=source_language,
                        target_language=target_language,
                    )
                )
            return results
        except (DubStudioError, ProviderAuthError, ProviderRateLimitError):
            raise
        except Exception as e:
            err_str = str(e)
            if "RESOURCE_EXHAUSTED" in err_str or "429" in err_str:
                raise ProviderRateLimitError("Gemini", details=err_str)
            if "API_KEY_INVALID" in err_str or "401" in err_str or "403" in err_str or "API key not valid" in err_str:
                raise ProviderAuthError("Gemini", details=err_str)
            raise DubStudioError("TRANSLATION_FAILED", f"Gemini translation failed: {err_str}")
