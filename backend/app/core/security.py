import re
from typing import Annotated
from fastapi import Header, Query, HTTPException, status, Security
from fastapi.security import APIKeyHeader
from app.core.config import settings

api_key_header = APIKeyHeader(name="X-DubStudio-Token", auto_error=False)


async def verify_auth_token(
    header_token: Annotated[str | None, Security(api_key_header)] = None,
    query_token: Annotated[str | None, Query(alias="token")] = None,
) -> bool:
    token = header_token or query_token
    # If no AUTH_TOKEN configured (dev mode), permit
    if not settings.AUTH_TOKEN:
        return True

    if not token or token != settings.AUTH_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing session authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return True


def redact_sensitive_string(text: str) -> str:
    """Redacts API keys and tokens from strings and logs."""
    if not text:
        return ""
    # Redact common key patterns (e.g. AIza..., cc_..., Bearer ...)
    patterns = [
        (r"(Bearer\s+)[A-Za-z0-9_\-\.]{8,}", r"\1[REDACTED]"),
        (r"(AIza[0-9A-Za-z-_]{35})", r"[REDACTED_GEMINI_KEY]"),
        (r"(cc_[0-9A-Za-z]{10,})", r"[REDACTED_CODECRAFT_KEY]"),
        (r"(\"api_key\":\s*\")[^\"]+(\")", r'\1[REDACTED]\2'),
        (r"('api_key':\s*')[^']+(\')", r"\1[REDACTED]\2"),
    ]
    result = text
    for pattern, replacement in patterns:
        result = re.sub(pattern, replacement, result, flags=re.IGNORECASE)
    return result
