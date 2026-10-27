import asyncio
import uuid
import logging
from datetime import datetime
from typing import Callable, Coroutine, Any
from app.models.job import ProcessingJobModel
from app.schemas.job import ProcessingJobResponse
from app.database.session import GlobalAsyncSessionLocal

logger = logging.getLogger("dubstudio.jobs")


class JobManager:
    def __init__(self, max_concurrent: int = 4):
        self.max_concurrent = max_concurrent
        self._active_tasks: dict[str, asyncio.Task] = {}
        self._cancel_events: dict[str, asyncio.Event] = {}
        self._listeners: set[asyncio.Queue] = set()
        self._semaphore = asyncio.Semaphore(max_concurrent)

    async def create_job(
        self,
        project_id: str,
        job_type: str,
        message: str = "Queued",
        metadata: dict[str, Any] | None = None,
    ) -> ProcessingJobResponse:
        job_id = str(uuid.uuid4())
        now = datetime.utcnow()
        async with GlobalAsyncSessionLocal() as session:
            job = ProcessingJobModel(
                id=job_id,
                project_id=project_id,
                type=job_type,
                status="queued",
                progress=0.0,
                message=message,
                metadata_json=metadata or {},
                created_at=now,
                updated_at=now,
            )
            session.add(job)
            await session.commit()
            await session.refresh(job)
            resp = ProcessingJobResponse.model_validate(job)

        self._broadcast(resp)
        return resp

    async def get_job(self, job_id: str) -> ProcessingJobResponse | None:
        async with GlobalAsyncSessionLocal() as session:
            job = await session.get(ProcessingJobModel, job_id)
            if not job:
                return None
            return ProcessingJobResponse.model_validate(job)

    async def update_job(
        self,
        job_id: str,
        status: str | None = None,
        progress: float | None = None,
        message: str | None = None,
        error: str | None = None,
    ) -> ProcessingJobResponse | None:
        async with GlobalAsyncSessionLocal() as session:
            job = await session.get(ProcessingJobModel, job_id)
            if not job:
                return None

            if status is not None:
                job.status = status
            if progress is not None:
                job.progress = min(100.0, max(0.0, progress))
            if message is not None:
                job.message = message
            if error is not None:
                job.error = error
            if status in ("completed", "failed", "cancelled"):
                job.completed_at = datetime.utcnow()
            job.updated_at = datetime.utcnow()

            await session.commit()
            await session.refresh(job)
            resp = ProcessingJobResponse.model_validate(job)

        self._broadcast(resp)
        return resp

    def cancel_job(self, job_id: str) -> bool:
        if job_id in self._cancel_events:
            self._cancel_events[job_id].set()
        if job_id in self._active_tasks:
            self._active_tasks[job_id].cancel()
            return True
        return False

    def enqueue(
        self,
        job_id: str,
        coro_fn: Callable[[Callable[[float, str], None], asyncio.Event], Coroutine[Any, Any, Any]],
    ) -> None:
        cancel_event = asyncio.Event()
        self._cancel_events[job_id] = cancel_event

        async def worker():
            async with self._semaphore:
                await self.update_job(job_id, status="running", message="Processing...")

                def progress_cb(pct: float, msg: str):
                    asyncio.create_task(self.update_job(job_id, progress=pct, message=msg))

                try:
                    await coro_fn(progress_cb, cancel_event)
                    await self.update_job(job_id, status="completed", progress=100.0, message="Completed successfully")
                except asyncio.CancelledError:
                    await self.update_job(job_id, status="cancelled", message="Operation cancelled by user")
                except Exception as e:
                    logger.exception(f"Job {job_id} encountered an error: {e}")
                    await self.update_job(job_id, status="failed", message=str(e), error=str(e))
                finally:
                    self._active_tasks.pop(job_id, None)
                    self._cancel_events.pop(job_id, None)

        task = asyncio.create_task(worker())
        self._active_tasks[job_id] = task

    def _broadcast(self, job: ProcessingJobResponse):
        for q in list(self._listeners):
            try:
                q.put_nowait(job)
            except Exception:
                pass

    def subscribe(self) -> asyncio.Queue:
        q = asyncio.Queue()
        self._listeners.add(q)
        return q

    def unsubscribe(self, q: asyncio.Queue) -> None:
        self._listeners.discard(q)


job_manager = JobManager()
