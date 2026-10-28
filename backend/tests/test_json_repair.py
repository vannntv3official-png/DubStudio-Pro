import json
import pytest
from app.utils.json_repair import (
    clean_and_repair_json,
    extract_gemini_response_text,
    unwrap_transcript_data,
)


def test_clean_and_repair_valid_json():
    raw = '{"segments": [{"text": "Hello world", "start_ms": 0, "end_ms": 1000}]}'
    data = clean_and_repair_json(raw)
    assert data["segments"][0]["text"] == "Hello world"
    assert data["segments"][0]["start_ms"] == 0


def test_clean_and_repair_markdown_fences():
    raw = """```json
    {
        "segments": [
            {"text": "Line 1", "start_ms": 0, "end_ms": 1500}
        ]
    }
    ```"""
    data = clean_and_repair_json(raw)
    assert len(data["segments"]) == 1
    assert data["segments"][0]["text"] == "Line 1"


def test_clean_and_repair_trailing_commas():
    raw = """{
        "segments": [
            {"text": "Line 1", "start_ms": 0, "end_ms": 1500,},
        ],
    }"""
    data = clean_and_repair_json(raw)
    assert len(data["segments"]) == 1
    assert data["segments"][0]["text"] == "Line 1"


def test_clean_and_repair_truncated_array():
    raw = """{
        "segments": [
            {"text": "Line 1", "start_ms": 0, "end_ms": 1500},
            {"text": "Line 2", "start_ms": 1500, "end_ms": 3000},
            {"text": "Line 3", "start_ms": 3000
    """
    data = clean_and_repair_json(raw)
    assert len(data["segments"]) == 2
    assert data["segments"][0]["text"] == "Line 1"
    assert data["segments"][1]["text"] == "Line 2"


def test_unwrap_transcript_data_variants():
    # Direct list
    assert len(unwrap_transcript_data([{"text": "a"}])) == 1
    # segments key
    assert len(unwrap_transcript_data({"segments": [{"text": "a"}]})) == 1
    # transcription key
    assert len(unwrap_transcript_data({"transcription": [{"text": "a"}]})) == 1
    # items key
    assert len(unwrap_transcript_data({"items": [{"text": "a"}]})) == 1
    # empty or invalid
    assert unwrap_transcript_data({}) == []
    assert unwrap_transcript_data(None) == []


def test_extract_gemini_response_text_variations():
    class MockPart:
        def __init__(self, text, thought=False):
            self.text = text
            self.thought = thought

    class MockContent:
        def __init__(self, parts):
            self.parts = parts

    class MockCandidate:
        def __init__(self, content):
            self.content = content

    class MockResponse:
        def __init__(self, text=None, candidates=None):
            self._text = text
            self.candidates = candidates or []

        @property
        def text(self):
            return self._text

    # Normal text
    r1 = MockResponse(text='{"segments": []}')
    assert extract_gemini_response_text(r1) == '{"segments": []}'

    # Candidate parts with thought skipping
    part_thought = MockPart("I am thinking...", thought=True)
    part_real = MockPart('{"segments": [{"text": "ok"}]}', thought=False)
    candidate = MockCandidate(MockContent([part_thought, part_real]))
    r2 = MockResponse(text=None, candidates=[candidate])
    assert extract_gemini_response_text(r2) == '{"segments": [{"text": "ok"}]}'
