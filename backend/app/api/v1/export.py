from fastapi import APIRouter
from app.schemas.export import ExportConfigSchema
from app.schemas.job import ProcessingJobResponse
from app.services.export.service import ExportService
from app.jobs.manager import job_manager

router = APIRouter(prefix="/export", tags=["export"])


@router.post("/jobs", response_model=ProcessingJobResponse)
async def start_export_job(config: ExportConfigSchema):
    job = await job_manager.create_job(
        project_id=config.project_id,
        job_type="video_export",
        message="Video export queued...",
        metadata={"outputPath": config.output_file_path},
    )

    async def execute_task(progress_cb, cancel_event):
        await ExportService.render_video(
            config=config,
            on_progress=progress_cb,
            cancel_event=cancel_event,
        )

    job_manager.enqueue(job.id, execute_task)
    return job
