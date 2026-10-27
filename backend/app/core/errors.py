from typing import Any
from fastapi import HTTPException, status


class DubStudioError(Exception):
    def __init__(
        self,
        code: str,
        message: str,
        status_code: int = status.HTTP_400_BAD_REQUEST,
        details: Any = None,
        recovery: str | None = None,
    ):
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details
        self.recovery = recovery
        full_message = f"{message} {recovery}".strip() if recovery else message
        super().__init__(full_message)

    def __str__(self) -> str:
        if self.recovery:
            return f"{self.message} {self.recovery}"
        return self.message

    def to_dict(self) -> dict[str, Any]:
        return {
            "code": self.code,
            "message": self.message,
            "details": self.details,
            "recovery": self.recovery,
        }


class InvalidMediaError(DubStudioError):
    def __init__(self, message: str, details: Any = None):
        super().__init__(
            code="INVALID_MEDIA",
            message=message,
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            details=details,
            recovery="Please verify that the media file is not corrupted and is in a supported container (MP4, MOV, MKV, AVI, WebM).",
        )


class UnsupportedCodecError(DubStudioError):
    def __init__(self, codec: str, details: Any = None):
        super().__init__(
            code="UNSUPPORTED_CODEC",
            message=f"The media contains an unsupported or proprietary codec: {codec}",
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            details=details,
            recovery="Re-encode the media with standard H.264/AAC using FFmpeg or HandBrake before importing.",
        )


class MissingApiKeyError(DubStudioError):
    def __init__(self, provider: str):
        super().__init__(
            code="MISSING_API_KEY",
            message=f"API key for provider '{provider}' is not configured.",
            status_code=status.HTTP_401_UNAUTHORIZED,
            details={"provider": provider},
            recovery=f"Open Settings > AI Providers and enter a valid API key for {provider}.",
        )


class ProviderAuthError(DubStudioError):
    def __init__(self, provider: str, details: Any = None):
        super().__init__(
            code="PROVIDER_AUTH_FAILED",
            message=f"Authentication failed for provider '{provider}'.",
            status_code=status.HTTP_401_UNAUTHORIZED,
            details=details,
            recovery=f"Check your API key in Settings > AI Providers and test the connection.",
        )


class ProviderRateLimitError(DubStudioError):
    def __init__(self, provider: str, details: Any = None):
        super().__init__(
            code="PROVIDER_RATE_LIMIT",
            message=f"Rate limit exceeded for provider '{provider}'.",
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            details=details,
            recovery="Wait a few minutes before retrying, or configure a higher quota tier.",
        )


class AudioSyncError(DubStudioError):
    def __init__(self, message: str, details: Any = None):
        super().__init__(
            code="AUDIO_SYNC_FAILED",
            message=message,
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            details=details,
            recovery="Try using 'Natural' or 'Balanced' sync mode instead of 'Strict', or adjust segment boundaries manually.",
        )


class ExportError(DubStudioError):
    def __init__(self, message: str, details: Any = None):
        super().__init__(
            code="EXPORT_FAILED",
            message=message,
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            details=details,
            recovery="Check disk space, ensure output directory exists and is writable, and review FFmpeg logs.",
        )
