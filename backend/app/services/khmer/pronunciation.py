"""
Khmer Pronunciation Preparation Engine.

Provides safe Unicode normalization, Coeng ligature protection,
cardinal number and currency expansion, project overrides application,
and prosody formatting for neural TTS synthesis.
"""

import html
import re
import unicodedata
from typing import Any

# Khmer Digits map
KHMER_DIGITS = {
    "០": 0, "១": 1, "២": 2, "៣": 3, "៤": 4,
    "៥": 5, "៦": 6, "៧": 7, "៨": 8, "៩": 9,
}

KHMER_ONES = ["សូន្យ", "មួយ", "ពីរ", "បី", "បួន", "ប្រាំ", "ប្រាំមួយ", "ប្រាំពីរ", "ប្រាំបី", "ប្រាំបួន"]
KHMER_TENS = ["", "ដប់", "ម្ភៃ", "សាមសិប", "សែសិប", "ហាសិប", "ហុកសិប", "ចិតសិប", "ប៉ែតសិប", "កៅសិប"]

# Standard common acronym overrides for Khmer dubbing
DEFAULT_ACRONYM_OVERRIDES: dict[str, str] = {
    "AI": "អេអាយ",
    "OK": "អូខេ",
    "TV": "ធីវី",
    "FB": "ហ្វេសប៊ុក",
    "USA": "សហរដ្ឋអាមេរិក",
    "VIP": "វីអាយភី",
    "ID": "អាយឌី",
    "CEO": "ស៊ីអ៊ីអូ",
    "DNA": "ឌីអិនអេ",
    "GPS": "ជីភីអេស",
    "SIM": "ស៊ីម",
}


def number_to_khmer_words(n: int) -> str:
    """Converts a non-negative integer into standard spoken Khmer words."""
    if n < 0:
        return "ដក " + number_to_khmer_words(abs(n))
    if n < 10:
        return KHMER_ONES[n]
    if n < 100:
        tens = n // 10
        ones = n % 10
        if ones == 0:
            return KHMER_TENS[tens]
        return f"{KHMER_TENS[tens]}{KHMER_ONES[ones]}"
    if n < 1000:
        hundreds = n // 100
        rem = n % 100
        prefix = f"{KHMER_ONES[hundreds]}រយ"
        return prefix if rem == 0 else f"{prefix} {number_to_khmer_words(rem)}"
    if n < 10000:
        thousands = n // 1000
        rem = n % 1000
        prefix = f"{KHMER_ONES[thousands]}ពាន់"
        return prefix if rem == 0 else f"{prefix} {number_to_khmer_words(rem)}"
    if n < 100000:
        ten_thousands = n // 10000
        rem = n % 10000
        prefix = f"{KHMER_ONES[ten_thousands]}ម៉ឺន"
        return prefix if rem == 0 else f"{prefix} {number_to_khmer_words(rem)}"
    if n < 1000000:
        hundred_thousands = n // 100000
        rem = n % 100000
        prefix = f"{KHMER_ONES[hundred_thousands]}សែន"
        return prefix if rem == 0 else f"{prefix} {number_to_khmer_words(rem)}"
    if n < 1000000000:
        millions = n // 1000000
        rem = n % 1000000
        prefix = f"{number_to_khmer_words(millions)}លាន"
        return prefix if rem == 0 else f"{prefix} {number_to_khmer_words(rem)}"

    billions = n // 1000000000
    rem = n % 1000000000
    prefix = f"{number_to_khmer_words(billions)}ពាន់លាន"
    return prefix if rem == 0 else f"{prefix} {number_to_khmer_words(rem)}"


def normalize_unicode_khmer(text: str) -> str:
    """
    Safely normalizes Khmer Unicode characters to NFC while rigorously
    protecting Coeng (\\u17D2) combining ligatures.
    """
    if not text:
        return ""

    # Decode any HTML entities (&amp;, &quot;, &#1780;, etc.)
    text = html.unescape(text)

    # Strip HTML / XML tags
    text = re.sub(r"<[^>]+>", " ", text)

    # Strip presentation markdown (*, _, `, #, ~, >, quotes)
    text = re.sub(r"[\*_`#~>]", " ", text)

    # Normalize to NFC
    text = unicodedata.normalize("NFC", text)

    # Convert zero-width spaces (\u200b) to standard spaces for natural neural prosody,
    # and strip directional marks (\u200e, \u200f)
    text = re.sub(r"[\u200b\ufeff]+", " ", text)
    text = re.sub(r"[\u200e\u200f]", "", text)

    # CRITICAL: Prevent spaces or zero-width spaces from separating Coeng (\u17D2) and its subscript consonant
    text = re.sub(r"\u17D2[\s\u200b\u200c\u200d\ufeff]+([\u1780-\u17B3])", "\u17D2\\1", text)

    # Ensure zero-width spaces between ordinary words do not create illegal gaps next to combining signs
    # Khmer combining signs range \u17B4 - \u17DD
    text = re.sub(r"([\u1780-\u17B3])[\s\u200b\u200c\u200d\ufeff]+([\u17B4-\u17DD])", r"\1\2", text)

    # Final safeguard: remove any whitespace immediately after Coeng (\u17D2)
    text = re.sub(r"\u17D2\s+([\u1780-\u17B3])", "\u17D2\\1", text)

    # Normalize multiple whitespace
    text = re.sub(r"[ \t]+", " ", text)

    return text.strip()


def expand_numbers_and_symbols(text: str) -> str:
    """
    Expands digits, currencies ($ and ៛), and percentages (%) into natural spoken Khmer words.
    Ambiguous codes or long numbers (>9 digits) are pronounced digit-by-digit.
    """
    if not text:
        return ""

    # Convert Khmer digits ០-៩ to standard 0-9 for uniform parsing
    for k_digit, val in KHMER_DIGITS.items():
        text = text.replace(k_digit, str(val))

    # 1. Currency: $100 or 100$ or 100 USD -> មួយរយ ដុល្លារ
    def replace_usd_prefix(match: re.Match) -> str:
        try:
            num = int(match.group(1))
            return f"{number_to_khmer_words(num)} ដុល្លារ"
        except Exception:
            return match.group(0)

    text = re.sub(r"\$\s*(\d{1,9})", replace_usd_prefix, text)
    text = re.sub(r"(\d{1,9})\s*(?:\$|USD)\b", replace_usd_prefix, text)

    # 2. Currency: 5000៛ or 5000 ៛ or 5000 KHR -> ប្រាំពាន់ រៀល
    def replace_khr(match: re.Match) -> str:
        try:
            num = int(match.group(1))
            return f"{number_to_khmer_words(num)} រៀល"
        except Exception:
            return match.group(0)

    text = re.sub(r"(\d{1,9})\s*(?:៛|KHR|khr)", replace_khr, text)

    # 3. Percentage: 50% -> ហាសិប ភាគរយ
    def replace_percent(match: re.Match) -> str:
        try:
            num = int(match.group(1))
            return f"{number_to_khmer_words(num)} ភាគរយ"
        except Exception:
            return match.group(0)

    text = re.sub(r"(\d{1,9})\s*%", replace_percent, text)


    # 4. Standalone Cardinal Numbers up to 9 digits: e.g. "3" -> "បី"
    def replace_cardinal(match: re.Match) -> str:
        num_str = match.group(0)
        # Avoid expanding year-like codes with leading zero like "0123"
        if len(num_str) > 1 and num_str.startswith("0"):
            # Digit by digit (e.g. phone numbers or codes)
            return " ".join(KHMER_ONES[int(d)] for d in num_str)
        try:
            num = int(num_str)
            return number_to_khmer_words(num)
        except Exception:
            return num_str

    text = re.sub(r"\b\d{1,9}\b", replace_cardinal, text)

    return text


def apply_pronunciation_overrides(text: str, overrides: dict[str, str] | None = None) -> str:
    """
    Applies case-insensitive or exact project-level pronunciation overrides.
    """
    if not text:
        return ""

    combined_overrides = dict(DEFAULT_ACRONYM_OVERRIDES)
    if overrides:
        combined_overrides.update(overrides)

    for term, spoken in combined_overrides.items():
        if not term or not spoken:
            continue
        # Use regex word boundary for Latin terms, exact match for Khmer terms
        if re.match(r"^[A-Za-z0-9_]+$", term):
            pattern = rf"\b{re.escape(term)}\b"
            text = re.sub(pattern, spoken, text, flags=re.IGNORECASE)
        else:
            text = text.replace(term, spoken)

    return text


def format_for_neural_tts(text: str, voice_id: str = "") -> str:
    """
    Optimizes prosody and pause boundaries for Microsoft Edge-TTS neural models
    (km-KH-PisethNeural, km-KH-SreymomNeural).
    """
    if not text:
        return ""

    # Normalize excessive punctuation
    text = re.sub(r"\?+", "?", text)
    text = re.sub(r"!+", "!", text)
    text = re.sub(r"(\.\s*){3,}", "...", text)

    # Add space before Khmer sentence separators (។, ?, !, ,) so neural TTS modulates pitch
    text = re.sub(r"\s*([។!?])", r" \1", text)
    text = re.sub(r"\s*(,)", r"\1 ", text)

    # Collapse multiple spaces
    text = re.sub(r"[ \t]+", " ", text).strip()

    # Ensure natural ending sentence separator if missing
    if text and text[-1] not in (".", "!", "?", "។", "៕", "…", ":", ";"):
        if "km" in voice_id.lower() or any("\u1780" <= c <= "\u17ff" for c in text):
            text += " ។"
        else:
            text += "."

    return text


def prepare_khmer_pronunciation(
    text: str,
    voice_id: str = "km-KH-PisethNeural",
    overrides: dict[str, str] | None = None,
) -> str:
    """
    Complete pipeline to generate clean, natural TTS pronunciation text:
    1. Unicode NFC normalization with Coeng preservation.
    2. Overrides substitution (acronyms, proper names).
    3. Digits, currencies, and percentage expansion.
    4. Neural Edge-TTS prosody formatting.
    """
    if not text:
        return ""

    norm = normalize_unicode_khmer(text)
    with_overrides = apply_pronunciation_overrides(norm, overrides)
    expanded = expand_numbers_and_symbols(with_overrides)
    final_tts = format_for_neural_tts(expanded, voice_id=voice_id)

    return final_tts


def detect_pronunciation_ambiguity(text: str) -> list[str]:
    """
    Advisory check: detects unresolved foreign characters, complex unexpanded numbers,
    or ambiguous dates/times that may require human review.
    """
    reasons: list[str] = []
    if not text:
        return reasons

    # Detect unexpanded Latin words longer than 1 char (except single variables)
    latin_words = re.findall(r"\b[A-Za-z]{2,}\b", text)
    if latin_words:
        reasons.append(f"unresolved_foreign_words: {', '.join(set(latin_words[:3]))}")

    # Detect raw unexpanded phone numbers / complex digit patterns (e.g. 012-345-678 or 12/04/2026)
    if re.search(r"\d{2,}[-/.]\d{2,}", text):
        reasons.append("ambiguous_number_or_date")

    return reasons
