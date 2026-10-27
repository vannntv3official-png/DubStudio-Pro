from fastapi import APIRouter, Depends
from app.core.security import verify_auth_token
from app.api.v1 import (
    health,
    projects,
    media,
    transcription,
    translation,
    voices,
    tts,
    subtitles,
    timeline,
    export,
    jobs,
    settings,
)

api_router = APIRouter()

# Health does not require auth token
api_router.include_router(health.router)

# Authenticated domain routers
api_router.include_router(projects.router, dependencies=[Depends(verify_auth_token)])
api_router.include_router(media.router, dependencies=[Depends(verify_auth_token)])
api_router.include_router(transcription.router, dependencies=[Depends(verify_auth_token)])
api_router.include_router(translation.router, dependencies=[Depends(verify_auth_token)])
api_router.include_router(voices.router, dependencies=[Depends(verify_auth_token)])
api_router.include_router(tts.router, dependencies=[Depends(verify_auth_token)])
api_router.include_router(subtitles.router, dependencies=[Depends(verify_auth_token)])
api_router.include_router(timeline.router, dependencies=[Depends(verify_auth_token)])
api_router.include_router(export.router, dependencies=[Depends(verify_auth_token)])
api_router.include_router(jobs.router, dependencies=[Depends(verify_auth_token)])
api_router.include_router(settings.router, dependencies=[Depends(verify_auth_token)])
