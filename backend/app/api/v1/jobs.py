import json
import asyncio
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from app.schemas.job import ProcessingJobResponse
from app.jobs.manager import job_manager

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.get("/{job_id}", response_model=ProcessingJobResponse)
async def get_job_status(job_id: str):
    job = await job_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.post("/{job_id}/cancel")
async def cancel_job(job_id: str):
    cancelled = job_manager.cancel_job(job_id)
    return {"jobId": job_id, "cancelled": cancelled}


@router.get("/events/stream")
async def stream_job_events():
    """SSE endpoint for real-time job progress in the desktop application."""
    q = job_manager.subscribe()

    async def event_generator():
        try:
            while True:
                job: ProcessingJobResponse = await q.get()
                payload = json.dumps(job.model_dump(by_alias=True), default=str)
                yield f"data: {payload}\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            job_manager.unsubscribe(q)

    return StreamingResponse(event_generator(), media_type="text/event-stream")
