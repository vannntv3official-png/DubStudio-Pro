from fastapi import APIRouter
from app.schemas.timeline import TimelineStateResponse, TimelineUpdateRequest
from app.services.timeline.service import TimelineService

router = APIRouter(prefix="/timeline", tags=["timeline"])


@router.get("/{project_id}", response_model=TimelineStateResponse)
async def get_timeline(project_id: str):
    return await TimelineService.get_timeline(project_id)


@router.put("/{project_id}", response_model=TimelineStateResponse)
async def save_timeline(project_id: str, req: TimelineUpdateRequest):
    return await TimelineService.save_timeline(project_id, req.tracks)
