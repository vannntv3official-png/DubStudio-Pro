from fastapi import APIRouter, HTTPException, status
from app.schemas.transcript import (
    TranscriptionJobRequest,
    TranscriptSegmentResponse,
    TranscriptSegmentUpdate,
    TranscriptSplitRequest,
    TranscriptMergeRequest,
)
from app.schemas.job import ProcessingJobResponse
from app.services.transcription.service import TranscriptionService
from app.jobs.manager import job_manager

router = APIRouter(prefix="/transcription", tags=["transcription"])


@router.post("/jobs", response_model=ProcessingJobResponse)
async def start_transcription_job(req: TranscriptionJobRequest):
    job = await job_manager.create_job(
        project_id=req.project_id,
        job_type="transcription",
        message=f"Transcription queued with {req.provider.capitalize()}",
        metadata={"mediaAssetId": req.media_asset_id, "provider": req.provider},
    )

    async def execute_task(progress_cb, cancel_event):
        await TranscriptionService.run_transcription(
            project_id=req.project_id,
            media_asset_id=req.media_asset_id,
            provider_name=req.provider,
            model_name=req.model,
            source_language=req.source_language,
            on_progress=progress_cb,
        )

    job_manager.enqueue(job.id, execute_task)
    return job


@router.get("/{project_id}", response_model=list[TranscriptSegmentResponse])
async def get_transcript_segments(project_id: str):
    return await TranscriptionService.get_segments(project_id)


@router.post("/split", response_model=list[TranscriptSegmentResponse])
async def split_transcript_segment(req: TranscriptSplitRequest, project_id: str):
    return await TranscriptionService.split_segment(project_id, req)


@router.post("/merge", response_model=list[TranscriptSegmentResponse])
async def merge_transcript_segments(req: TranscriptMergeRequest, project_id: str):
    return await TranscriptionService.merge_segments(project_id, req)
