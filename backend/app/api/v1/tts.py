from fastapi import APIRouter
from app.schemas.voice import TTSJobRequest, GeneratedAudioResponse
from app.schemas.job import ProcessingJobResponse
from app.services.speech.service import SpeechAndAlignmentService
from app.jobs.manager import job_manager

router = APIRouter(prefix="/tts", tags=["tts"])


@router.post("/jobs", response_model=ProcessingJobResponse)
async def start_tts_job(req: TTSJobRequest):
    job = await job_manager.create_job(
        project_id=req.project_id,
        job_type="speech_generation",
        message="Text-to-speech synthesis and alignment queued...",
        metadata={"voiceId": req.voice_id},
    )

    async def execute_task(progress_cb, cancel_event):
        await SpeechAndAlignmentService.run_batch_speech_and_alignment(
            project_id=req.project_id,
            voice_id=req.voice_id,
            rate=req.rate,
            pitch=req.pitch,
            volume=req.volume,
            segment_ids=req.segment_ids,
            sync_mode=req.sync_mode,
            on_progress=progress_cb,
        )

    job_manager.enqueue(job.id, execute_task)
    return job


@router.get("/{project_id}", response_model=list[GeneratedAudioResponse])
async def get_generated_audios(project_id: str):
    return await SpeechAndAlignmentService.get_generated_audios(project_id)
