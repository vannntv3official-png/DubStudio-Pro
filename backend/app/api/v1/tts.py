from fastapi import APIRouter
from app.schemas.voice import TTSJobRequest, GeneratedAudioResponse
from app.schemas.job import ProcessingJobResponse
from app.services.speech.service import SpeechAndAlignmentService
from app.providers.edge_tts.provider import EdgeTTSProvider
from app.jobs.manager import job_manager
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

router = APIRouter(prefix="/tts", tags=["tts"])


class SingleSegmentTTSRequest(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, alias_generator=to_camel)

    project_id: str
    segment_id: str
    voice_id: str | None = None
    rate: str = "+0%"
    pitch: str = "+0Hz"
    volume: str = "+0%"
    sync_mode: str | None = None


@router.get("/capabilities")
async def get_tts_capabilities():
    return EdgeTTSProvider.get_capabilities()


@router.post("/regenerate-segment", response_model=GeneratedAudioResponse)
async def regenerate_segment_tts(req: SingleSegmentTTSRequest):
    return await SpeechAndAlignmentService.regenerate_single_segment(
        project_id=req.project_id,
        segment_id=req.segment_id,
        voice_id=req.voice_id,
        rate=req.rate,
        pitch=req.pitch,
        volume=req.volume,
        sync_mode=req.sync_mode,
    )


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
            cancel_event=cancel_event,
        )

    job_manager.enqueue(job.id, execute_task)
    return job


@router.get("/{project_id}", response_model=list[GeneratedAudioResponse])
async def get_generated_audios(project_id: str):
    return await SpeechAndAlignmentService.get_generated_audios(project_id)
