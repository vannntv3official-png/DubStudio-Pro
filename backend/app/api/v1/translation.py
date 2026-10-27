from fastapi import APIRouter, HTTPException, status
from app.schemas.translation import (
    TranslationJobRequest,
    TranslationSegmentResponse,
    TranslationSegmentUpdate,
)
from app.schemas.job import ProcessingJobResponse
from app.services.translation.service import TranslationService
from app.jobs.manager import job_manager

router = APIRouter(prefix="/translation", tags=["translation"])


@router.post("/jobs", response_model=ProcessingJobResponse)
async def start_translation_job(req: TranslationJobRequest):
    job = await job_manager.create_job(
        project_id=req.project_id,
        job_type="translation",
        message=f"Translation queued ({req.source_language} -> {req.target_language}) via {req.provider.capitalize()}",
        metadata={"provider": req.provider, "targetLanguage": req.target_language},
    )

    async def execute_task(progress_cb, cancel_event):
        await TranslationService.run_translation(
            project_id=req.project_id,
            provider_name=req.provider,
            model_name=req.model,
            source_language=req.source_language,
            target_language=req.target_language,
            glossary=req.glossary,
            on_progress=progress_cb,
        )

    job_manager.enqueue(job.id, execute_task)
    return job


@router.get("/{project_id}", response_model=list[TranslationSegmentResponse])
async def get_project_translations(project_id: str):
    return await TranslationService.get_translations(project_id)


@router.put("/{project_id}/{translation_id}", response_model=TranslationSegmentResponse)
async def update_translation_segment(project_id: str, translation_id: str, data: TranslationSegmentUpdate):
    return await TranslationService.update_translation(project_id, translation_id, data)
