import pytest
from app.services.khmer.pronunciation import (
    normalize_unicode_khmer,
    expand_numbers_and_symbols,
    number_to_khmer_words,
    prepare_khmer_pronunciation,
    detect_pronunciation_ambiguity,
)
from app.services.translation.context import DialogueContextBuilder
from app.services.translation.validator import TranslationBatchValidator
from app.providers.edge_tts.provider import EdgeTTSProvider
from app.core.errors import DubStudioError


class DummyTurn:
    def __init__(self, id, start_ms, end_ms, text, speaker_id="speaker_1"):
        self.id = id
        self.start_ms = start_ms
        self.end_ms = end_ms
        self.text = text
        self.speaker_id = speaker_id


class DummySpeaker:
    def __init__(self, id, name="Speaker", gender=None, preferred_form_of_address=None):
        self.id = id
        self.name = name
        self.gender = gender
        self.preferred_form_of_address = preferred_form_of_address


class DummyTranslation:
    def __init__(self, translated_text, approval_status="draft"):
        self.translated_text = translated_text
        self.approval_status = approval_status


def test_coeng_ligature_preservation():
    # Coeng (\\u17D2) followed by a consonant must remain strictly contiguous
    # Even if whitespace or zero-width spaces are accidentally introduced
    corrupted_coeng = "\u1780\u17D2 \u1780"  # ក្ ក with space
    normalized = normalize_unicode_khmer(corrupted_coeng)
    assert normalized == "\u1780\u17D2\u1780"
    assert " " not in normalized


def test_number_expansion_and_currencies():
    # Test cardinal number conversions
    assert number_to_khmer_words(0) == "សូន្យ"
    assert number_to_khmer_words(5) == "ប្រាំ"
    assert number_to_khmer_words(10) == "ដប់"
    assert number_to_khmer_words(25) == "ម្ភៃប្រាំ"
    assert number_to_khmer_words(100) == "មួយរយ"
    assert number_to_khmer_words(5000) == "ប្រាំពាន់"

    # Test USD and KHR currency expansion
    usd_text = expand_numbers_and_symbols("ថ្លៃ $50")
    assert "ហាសិប ដុល្លារ" in usd_text

    khr_text = expand_numbers_and_symbols("ថ្លៃ 5000៛")
    assert "ប្រាំពាន់ រៀល" in khr_text

    # Test percentage expansion
    pct_text = expand_numbers_and_symbols("បញ្ចុះតម្លៃ 20%")
    assert "ម្ភៃ ភាគរយ" in pct_text


def test_pronunciation_overrides_and_neural_prosody():
    overrides = {"Doctor": "លោកដុកទ័រ", "AI": "អេអាយ"}
    raw = "The Doctor is using AI."
    prepared = prepare_khmer_pronunciation(raw, overrides=overrides)
    assert "លោកដុកទ័រ" in prepared
    assert "អេអាយ" in prepared
    # Neural prosody ending punctuation
    assert prepared.endswith("។") or prepared.endswith(".")


def test_dialogue_context_builder():
    t1 = DummyTurn("t-1", 1000, 3000, "Hello, how are you?")
    t2 = DummyTurn("t-2", 3200, 5000, "I am doing well, thank you.")
    speakers = {
        "speaker_1": DummySpeaker("speaker_1", name="Alice", gender="female", preferred_form_of_address="អ្នកនាង")
    }
    existing_tr = {
        "t-1": DummyTranslation("សួស្តី តើអ្នកសុខសប្បាយទេ?", approval_status="approved")
    }

    ctx = DialogueContextBuilder.build_context(
        project_id="p-1",
        transcripts=[t1, t2],
        speakers=speakers,
        existing_translations=existing_tr,
    )

    assert len(ctx.turns) == 2
    turn1 = ctx.turns[0]
    turn2 = ctx.turns[1]

    # Check turn 1 properties
    assert turn1.segment_id == "t-1"
    assert turn1.speaker_name == "Alice"
    assert turn1.preferred_address == "អ្នកនាង"
    assert turn1.is_approved is True
    assert turn1.following_turns[0]["source"] == "I am doing well, thank you."

    # Check turn 2 preceding context contains turn 1
    assert len(turn2.preceding_turns) == 1
    assert turn2.preceding_turns[0]["source"] == "Hello, how are you?"
    assert turn2.preceding_turns[0]["target"] == "សួស្តី តើអ្នកសុខសប្បាយទេ?"


def test_translation_batch_validator_strict():
    requested_ids = ["seg-1", "seg-2"]

    # 1. Valid response
    valid_resp = [
        {"id": "seg-1", "translated_text": "អរគុណច្រើន"},
        {"id": "seg-2", "translated_text": "មិនអីទេ"},
    ]
    lookup = TranslationBatchValidator.validate_batch_structure(requested_ids, valid_resp)
    assert len(lookup) == 2

    # 2. Rejection of missing segment ID
    missing_resp = [{"id": "seg-1", "translated_text": "អរគុណច្រើន"}]
    with pytest.raises(DubStudioError) as exc:
        TranslationBatchValidator.validate_batch_structure(requested_ids, missing_resp)
    assert "omitted" in str(exc.value)

    # 3. Rejection of unexpected segment ID
    unexpected_resp = [
        {"id": "seg-1", "translated_text": "អរគុណច្រើន"},
        {"id": "seg-2", "translated_text": "មិនអីទេ"},
        {"id": "seg-999", "translated_text": "កំហុស"},
    ]
    with pytest.raises(DubStudioError):
        TranslationBatchValidator.validate_batch_structure(requested_ids, unexpected_resp)

    # 4. Rejection of duplicate IDs
    duplicate_resp = [
        {"id": "seg-1", "translated_text": "អរគុណច្រើន"},
        {"id": "seg-1", "translated_text": "អរគុណច្រើនលើកទីពីរ"},
    ]
    with pytest.raises(DubStudioError):
        TranslationBatchValidator.validate_batch_structure(requested_ids, duplicate_resp)


def test_translation_advisory_quality_checks():
    # 1. Check negation flip detection
    # Source has negative 'not', but Khmer translation is missing negative markers
    reasons = TranslationBatchValidator.run_advisory_checks(
        source_text="I will not come tomorrow.",
        translated_text="ខ្ញុំនឹងមកថ្ងៃស្អែក។",
        spoken_script="ខ្ញុំនឹងមកថ្ងៃស្អែក។",
        duration_sec=2.5,
    )
    assert "potential_negation_flip_missing" in reasons

    # 2. Check quantity discrepancy
    reasons_qty = TranslationBatchValidator.run_advisory_checks(
        source_text="There are 50 students.",
        translated_text="មានសិស្សជាច្រើន។",
        spoken_script="មានសិស្សជាច្រើន។",
        duration_sec=2.0,
    )
    assert any("quantity_check" in r for r in reasons_qty)

    # 3. Check glossary deviation
    glossary = {"DubStudio": "ដាប់ស្ទូឌីយោ"}
    reasons_glo = TranslationBatchValidator.run_advisory_checks(
        source_text="Welcome to DubStudio.",
        translated_text="សូមស្វាគមន៍មកកាន់កម្មវិធី។",
        spoken_script="សូមស្វាគមន៍មកកាន់កម្មវិធី។",
        duration_sec=2.0,
        glossary=glossary,
    )
    assert "glossary_deviation_DubStudio" in reasons_glo


def test_edge_tts_capability_reporting():
    capabilities = EdgeTTSProvider.get_capabilities()
    assert capabilities["provider_name"] == "edge_tts"
    assert capabilities["supports_rate"] is True
    assert capabilities["supports_pitch"] is True
    assert capabilities["supports_volume"] is True
    # Honest reporting: edge-tts does NOT support SSML emotions or arbitrary phonemes
    assert capabilities["supports_ssml_emotion"] is False
    assert capabilities["supports_phoneme_control"] is False
