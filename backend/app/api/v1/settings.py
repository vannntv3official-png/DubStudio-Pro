import json
from fastapi import APIRouter
from sqlalchemy import select
from app.database.session import GlobalAsyncSessionLocal
from app.models.setting import SettingModel
from app.schemas.setting import (
    AppSettingsSchema,
    AIProviderSettingsSchema,
    TestConnectionRequest,
    TestConnectionResponse,
)
from app.providers.gemini.provider import GeminiProvider, parse_gemini_keys
from app.providers.codecraft.provider import CodecraftProvider
from app.core.errors import ProviderAuthError, MissingApiKeyError, DubStudioError

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("", response_model=AppSettingsSchema)
async def get_settings():
    async with GlobalAsyncSessionLocal() as session:
        stmt = select(SettingModel)
        res = await session.execute(stmt)
        settings_map = {s.key: s.value for s in res.scalars().all()}

    gemini_keys_raw = settings_map.get("gemini_api_keys", "")
    gemini_key_single = settings_map.get("gemini_api_key", "")
    parsed_keys = parse_gemini_keys(gemini_keys_raw or gemini_key_single)

    stored_gemini_model = settings_map.get("gemini_model", "gemini-3.5-flash")
    if stored_gemini_model in ("gemini-2.5-flash", "gemini-2.5-pro", "gemini-flash-latest", "gemini-2.5-flash-lite", "gemini-1.5-flash", "gemini-1.5-pro"):
        stored_gemini_model = "gemini-3.5-flash"

    ai_settings = AIProviderSettingsSchema(
        geminiApiKey=parsed_keys[0] if parsed_keys else gemini_key_single,
        geminiApiKeys=parsed_keys,
        geminiModel=stored_gemini_model,
        codecraftApiKey=settings_map.get("codecraft_api_key", ""),
        codecraftBaseUrl=settings_map.get("codecraft_base_url", "https://codecraftapi.com/v1"),
        codecraftModel=settings_map.get("codecraft_model", "deepseek-chat"),
        defaultTranscriptionProvider=settings_map.get("default_transcription_provider", "gemini"),
        defaultTranslationProvider=settings_map.get("default_translation_provider", "gemini"),
        defaultTTSProvider=settings_map.get("default_tts_provider", "edge_tts"),
        requestTimeoutSeconds=int(settings_map.get("request_timeout_seconds", 60)),
        retryAttempts=int(settings_map.get("retry_attempts", 3)),
    )

    return AppSettingsSchema(
        theme=settings_map.get("theme", "dark"),
        accentColor=settings_map.get("accent_color", "#3B82F6"),
        aiProviders=ai_settings,
        hardwareAcceleration=settings_map.get("hardware_acceleration", "true") == "true",
        autoSaveIntervalSeconds=int(settings_map.get("auto_save_interval", 30)),
        snapSensitivityPx=int(settings_map.get("snap_sensitivity", 10)),
    )


@router.put("", response_model=AppSettingsSchema)
async def update_settings(data: AppSettingsSchema):
    all_gemini_keys = parse_gemini_keys(data.ai_providers.gemini_api_keys or data.ai_providers.gemini_api_key)
    primary_key = all_gemini_keys[0] if all_gemini_keys else (data.ai_providers.gemini_api_key or "")

    to_save = {
        "gemini_api_key": primary_key,
        "gemini_api_keys": json.dumps(all_gemini_keys),
        "gemini_model": data.ai_providers.gemini_model,
        "codecraft_api_key": data.ai_providers.codecraft_api_key,
        "codecraft_base_url": data.ai_providers.codecraft_base_url,
        "codecraft_model": data.ai_providers.codecraft_model,
        "default_transcription_provider": data.ai_providers.default_transcription_provider,
        "default_translation_provider": data.ai_providers.default_translation_provider,
        "default_tts_provider": data.ai_providers.default_tts_provider,
        "request_timeout_seconds": str(data.ai_providers.request_timeout_seconds),
        "retry_attempts": str(data.ai_providers.retry_attempts),
        "theme": data.theme,
        "accent_color": data.accent_color,
        "hardware_acceleration": "true" if data.hardware_acceleration else "false",
        "auto_save_interval": str(data.auto_save_interval_seconds),
        "snap_sensitivity": str(data.snap_sensitivity_px),
    }

    async with GlobalAsyncSessionLocal() as session:
        for k, v in to_save.items():
            s = await session.get(SettingModel, k)
            if s:
                s.value = v
            else:
                session.add(SettingModel(key=k, value=v))
        await session.commit()

    # Reset in-memory provider key health state on settings update
    GeminiProvider._dead_keys.clear()
    GeminiProvider._rate_limited_keys.clear()
    GeminiProvider._last_successful_key = None

    return await get_settings()


@router.post("/test-connection", response_model=TestConnectionResponse)
async def test_provider_connection(req: TestConnectionRequest):
    try:
        if req.provider.lower() == "gemini":
            keys_to_test = req.api_keys or parse_gemini_keys(req.api_key)
            provider = GeminiProvider(api_keys=keys_to_test, api_key=req.api_key, model=req.model or "gemini-3.5-flash")
            models = await provider.test_connection()
            key_count = len(provider.api_keys)
            key_msg = (
                f"Successfully authenticated and verified {key_count} active Gemini API key(s) in pool!"
                if key_count > 1
                else "Successfully authenticated and connected with Gemini API!"
            )
            return TestConnectionResponse(
                success=True,
                message=key_msg,
                models=models,
            )
        elif req.provider.lower() == "codecraft":
            provider = CodecraftProvider(
                api_key=req.api_key,
                base_url=req.base_url or "https://codecraftapi.com/v1",
                model=req.model or "deepseek-chat",
            )
            models = await provider.test_connection()
            return TestConnectionResponse(
                success=True,
                message="Successfully authenticated and verified Codecraft API!",
                models=models,
            )
        else:
            return TestConnectionResponse(
                success=False,
                message=f"Unsupported provider: {req.provider}",
            )
    except MissingApiKeyError as e:
        return TestConnectionResponse(
            success=False,
            message=f"Please enter an API key for {req.provider} before testing.",
            models=[],
        )
    except ProviderAuthError as e:
        return TestConnectionResponse(
            success=False,
            message=f"Authentication error: {e.details or e.message}",
            models=[],
        )
    except Exception as e:
        err_msg = str(e)
        if "ACCESS_TOKEN_TYPE_UNSUPPORTED" in err_msg:
            friendly_msg = (
                "Google Gemini rejected this key (ACCESS_TOKEN_TYPE_UNSUPPORTED). "
                "Ensure you created an API key in Google AI Studio (https://aistudio.google.com/apikey). "
                "Google Cloud OAuth tokens and Vertex AI credentials are not supported here."
            )
        elif "API_KEY_INVALID" in err_msg or "API key not valid" in err_msg:
            friendly_msg = (
                "Invalid Gemini API key. Please check that you copied the complete key without "
                "extra characters from https://aistudio.google.com/apikey."
            )
        else:
            friendly_msg = f"Connection test failed: {err_msg}"

        return TestConnectionResponse(
            success=False,
            message=friendly_msg,
            models=[],
        )
