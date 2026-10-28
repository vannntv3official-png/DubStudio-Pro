"""
Robust JSON Cleaning, Repair, and Extraction for LLM Responses.

Handles:
- Markdown code blocks (```json ... ```)
- Leading/trailing conversational chatter or reasoning
- Trailing commas before } or ]
- Truncated JSON arrays caused by token limit exhaustion
- Flexible dictionary unnesting (transcription, transcript, segments, data, results)
- Safe response text extraction from Google GenAI SDK candidate parts
"""

import json
import logging
import re
from typing import Any

logger = logging.getLogger("dubstudio.utils.json_repair")


def extract_gemini_response_text(response: Any) -> str:
    """
    Safely retrieves the combined text from a Google GenAI response,
    bypassing reasoning/thought parts and multi-part content issues.
    """
    # 1. Standard response.text
    try:
        if hasattr(response, "text") and response.text:
            return str(response.text).strip()
    except Exception:
        pass

    # 2. Extract from candidates content parts (handles thoughts and non-thought parts)
    if hasattr(response, "candidates") and response.candidates:
        for cand in response.candidates:
            if hasattr(cand, "content") and cand.content and hasattr(cand.content, "parts"):
                parts_text = []
                for part in cand.content.parts:
                    # Skip thought reasoning parts
                    if getattr(part, "thought", False):
                        continue
                    txt = getattr(part, "text", "")
                    if txt:
                        parts_text.append(txt)
                if parts_text:
                    return "".join(parts_text).strip()

    return ""


def clean_and_repair_json(raw: str) -> Any:
    """
    Cleans, repairs, and parses LLM JSON outputs into Python structures.
    """
    if not raw or not raw.strip():
        raise ValueError("LLM response text is empty")

    text = raw.strip()

    # 1. Strip markdown fences: ```json ... ``` or ``` ... ```
    if "```" in text:
        match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text, re.IGNORECASE)
        if match:
            text = match.group(1).strip()
        else:
            text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
            text = re.sub(r"\s*```$", "", text).strip()

    # 2. Locate starting JSON character ([ or {)
    start_bracket = text.find("[")
    start_brace = text.find("{")

    if start_bracket != -1 and start_brace != -1:
        start_idx = min(start_bracket, start_brace)
    elif start_bracket != -1:
        start_idx = start_bracket
    elif start_brace != -1:
        start_idx = start_brace
    else:
        start_idx = -1

    if start_idx != -1:
        text = text[start_idx:]

    # 3. Strip trailing commas before closing braces/brackets
    cleaned = re.sub(r",\s*([}\]])", r"\1", text)

    # 4. Attempt direct standard parse
    try:
        return json.loads(cleaned)
    except Exception as direct_err:
        logger.debug(f"Direct JSON parse failed: {direct_err}, attempting repair...")

    # 5. Repair truncated JSON arrays/objects (when cut off mid-stream by token limit)
    last_brace = cleaned.rfind("}")
    if last_brace != -1:
        candidate = cleaned[:last_brace + 1].strip()
        if candidate.startswith("["):
            try:
                repaired = candidate + "]"
                return json.loads(repaired)
            except Exception:
                pass
        elif candidate.startswith("{"):
            if "[" in candidate:
                try:
                    repaired = candidate + "]}"
                    return json.loads(repaired)
                except Exception:
                    pass
            else:
                try:
                    repaired = candidate + "}"
                    return json.loads(repaired)
                except Exception:
                    pass

    # 6. Fallback regex extractor for segment objects
    segment_pattern = re.compile(
        r'\{\s*"start_ms"\s*:\s*(\d+)\s*,\s*"end_ms"\s*:\s*(\d+)\s*,\s*"text"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"',
        re.DOTALL,
    )
    matches = segment_pattern.findall(cleaned)
    if matches:
        items = []
        for start_s, end_s, txt in matches:
            try:
                # Unescape standard JSON string escapes (\n, \", etc.)
                unescaped_text = json.loads(f'"{txt}"')
            except Exception:
                unescaped_text = txt.replace('\\"', '"').replace('\\n', '\n')
            items.append({
                "start_ms": int(start_s),
                "end_ms": int(end_s),
                "text": unescaped_text,
                "speaker_id": "speaker_1",
            })
        if items:
            logger.info(f"Successfully recovered {len(items)} segments using regex fallback parser.")
            return items

    raise ValueError(f"Failed to parse or repair JSON from LLM: {text[:200]}")


def unwrap_transcript_data(data: Any) -> list[dict[str, Any]]:
    """
    Normalizes arbitrary dictionary wrapping into a clean list of transcript dictionaries.
    """
    if not data:
        return []

    if isinstance(data, list):
        return [item for item in data if isinstance(item, dict)]

    if isinstance(data, dict):
        # Check standard common wrapper keys
        for key in (
            "segments",
            "transcription",
            "transcript",
            "results",
            "data",
            "items",
            "dialogue",
            "subtitles",
            "lines",
            "output",
        ):
            if key in data and isinstance(data[key], list):
                return [item for item in data[key] if isinstance(item, dict)]

        # If any value is a list of dicts, choose the longest list
        list_candidates = [
            v for v in data.values()
            if isinstance(v, list) and all(isinstance(x, dict) for x in v)
        ]
        if list_candidates:
            list_candidates.sort(key=len, reverse=True)
            return list_candidates[0]

        # Single segment dictionary
        if "start_ms" in data and "text" in data:
            return [data]

        return []

    return []
