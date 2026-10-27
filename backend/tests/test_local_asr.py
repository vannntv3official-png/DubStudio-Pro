import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.core.config import settings
from app.providers.local_asr.provider import (
    SenseVoiceProvider,
    ParaformerProvider,
    strip_sensevoice_tags,
)


def test_strip_sensevoice_tags():
    raw_text = "<|zh|><|NEUTRAL|><|Speech|><|woitn|>你好世界，这是一个测试！"
    cleaned, lang, emotion = strip_sensevoice_tags(raw_text)
    assert cleaned == "你好世界，这是一个测试！"
    assert lang == "zh"
    assert emotion == "neutral"

    mixed_text = "<|en|><|HAPPY|>Hello world! Welcome to DubStudio.<|Speech|>"
    cleaned_en, lang_en, emotion_en = strip_sensevoice_tags(mixed_text)
    assert cleaned_en == "Hello world! Welcome to DubStudio."
    assert lang_en == "en"
    assert emotion_en == "happy"


def test_provider_initialization():
    sv = SenseVoiceProvider(model="SenseVoice-Small", local_url="http://127.0.0.1:10095")
    assert sv.model == "SenseVoice-Small"
    assert sv.local_url == "http://127.0.0.1:10095"

    pf = ParaformerProvider(model="Paraformer-zh", local_url="http://127.0.0.1:10095")
    assert pf.model == "Paraformer-zh"
    assert pf.local_url == "http://127.0.0.1:10095"


@pytest.mark.asyncio
async def test_settings_local_asr_test_connection():
    headers = {"X-DubStudio-Token": settings.AUTH_TOKEN}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # 1. Test SenseVoice connection
        resp_sv = await ac.post(
            "/api/v1/settings/test-connection",
            headers=headers,
            json={"provider": "sensevoice", "apiKey": ""},
        )
        assert resp_sv.status_code == 200
        data_sv = resp_sv.json()
        assert data_sv["success"] is True
        assert "SenseVoice-Small" in data_sv["message"]
        assert len(data_sv["models"]) >= 1

        # 2. Test Paraformer connection
        resp_pf = await ac.post(
            "/api/v1/settings/test-connection",
            headers=headers,
            json={"provider": "paraformer", "apiKey": ""},
        )
        assert resp_pf.status_code == 200
        data_pf = resp_pf.json()
        assert data_pf["success"] is True
        assert "Paraformer-zh" in data_pf["message"]
        assert len(data_pf["models"]) >= 1


@pytest.mark.asyncio
async def test_update_settings_with_local_asr():
    headers = {"X-DubStudio-Token": settings.AUTH_TOKEN}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # Get current settings
        get_res = await ac.get("/api/v1/settings", headers=headers)
        assert get_res.status_code == 200
        current_data = get_res.json()

        # Update with local ASR preferences
        current_data["aiProviders"]["defaultTranscriptionProvider"] = "sensevoice"
        current_data["aiProviders"]["sensevoiceModel"] = "SenseVoice-Small"
        current_data["aiProviders"]["sensevoiceLocalUrl"] = "http://127.0.0.1:10095"
        current_data["aiProviders"]["paraformerModel"] = "Paraformer-zh"
        current_data["aiProviders"]["paraformerLocalUrl"] = "http://127.0.0.1:10095"

        put_res = await ac.put("/api/v1/settings", headers=headers, json=current_data)
        assert put_res.status_code == 200
        updated = put_res.json()
        assert updated["aiProviders"]["defaultTranscriptionProvider"] == "sensevoice"
        assert updated["aiProviders"]["sensevoiceModel"] == "SenseVoice-Small"
        assert updated["aiProviders"]["paraformerModel"] == "Paraformer-zh"
