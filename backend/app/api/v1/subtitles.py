from fastapi import APIRouter, HTTPException, Response
from app.schemas.subtitle import SubtitleStateResponse, SubtitleImportRequest
from app.services.subtitles.service import SubtitleService

router = APIRouter(prefix="/subtitles", tags=["subtitles"])


@router.get("/{project_id}", response_model=SubtitleStateResponse)
async def get_project_subtitles(project_id: str):
    try:
        return await SubtitleService.get_subtitles(project_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/{project_id}/export/srt")
async def export_srt_file(project_id: str):
    content = await SubtitleService.export_srt(project_id)
    return Response(
        content=content,
        media_type="text/plain; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename=subtitles_{project_id[:8]}.srt"},
    )


@router.get("/{project_id}/export/vtt")
async def export_vtt_file(project_id: str):
    content = await SubtitleService.export_vtt(project_id)
    return Response(
        content=content,
        media_type="text/vtt; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename=subtitles_{project_id[:8]}.vtt"},
    )


@router.post("/import", response_model=SubtitleStateResponse)
async def import_subtitles(req: SubtitleImportRequest):
    return await SubtitleService.import_srt(req.project_id, req.content)


@router.post("/{project_id}/fix-overlaps", response_model=SubtitleStateResponse)
async def fix_subtitle_overlaps(project_id: str):
    return await SubtitleService.fix_overlaps(project_id)
