import pytest
from app.services.khmer.localization_guard import (
    detect_text_language,
    get_language_display_name,
    has_thai_script,
    has_untranslated_cjk,
    sanitize_khmer_dubbing_text,
    build_khmer_system_instruction,
)


def test_detect_text_language():
    assert detect_text_language("楚小姐，楚峰绝不可能伤害楚将军。") == "zh"
    assert detect_text_language("Hello, how are you today?") == "en"
    assert detect_text_language("សួស្តីបងប្អូនទាំងអស់គ្នា") == "km"
    assert detect_text_language("สวัสดีครับทุกคน") == "th"
    assert detect_text_language("안녕하세요") == "ko"
    assert detect_text_language("こんにちは") == "ja"

    # From segment dicts
    segments = [
        {"id": "1", "text": "楚小姐"},
        {"id": "2", "text": "绝不可能"},
    ]
    assert detect_text_language(segments) == "zh"


def test_get_language_display_name():
    assert "Chinese" in get_language_display_name("zh")
    assert "Khmer" in get_language_display_name("km")
    assert "English" in get_language_display_name("en")


def test_has_thai_script_and_cjk():
    assert has_thai_script("ทำร้าย") is True
    assert has_thai_script("ធ្វើបាប") is False

    assert has_untranslated_cjk("楚峰") is True
    assert has_untranslated_cjk("ឈូហ្វឹង") is False


def test_sanitize_khmer_dubbing_text():
    # Accidental Thai contamination
    contaminated = "楚峰 គ្មានថ្ងៃ ทำร้าย ท่านឧត្តមសេនីយ៍ 楚 ទេ។"
    cleaned = sanitize_khmer_dubbing_text(contaminated)
    assert "ทำร้าย" not in cleaned
    assert "ท่าน" not in cleaned
    assert "ធ្វើបាប" in cleaned
    assert "លោក" in cleaned
    assert not has_thai_script(cleaned)


def test_build_khmer_system_instruction():
    instruction = build_khmer_system_instruction()
    assert "PURE KHMER SCRIPT" in instruction
    assert "ทำร้าย" in instruction  # mentions forbidden Thai words
    assert "TRANSLITERATE" in instruction
