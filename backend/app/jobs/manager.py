import asyncio
import uuid
import logging
import time
from datetime import datetime, timezone
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
        self._cached_jobs: dict[str, ProcessingJobResponse] = {}
        self._db_lock = asyncio.Lock()
        self._last_db_time: dict[str, float] = {}
        self._last_db_pct: dict[str, float] = {}

    async def create_job(
        self,
        project_id: str,
        job_type: str,
        message: str = "Queued",
        metadata: dict[str, Any] | None = None,
    ) -> ProcessingJobResponse:
        job_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
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

        self._cached_jobs[job_id] = resp
        self._last_db_time[job_id] = time.time()
        self._last_db_pct[job_id] = 0.0
        self._broadcast(resp)
        return resp

    async def get_job(self, job_id: str) -> ProcessingJobResponse | None:
        if job_id in self._cached_jobs:
            return self._cached_jobs[job_id]
        async with GlobalAsyncSessionLocal() as session:
            job = await session.get(ProcessingJobModel, job_id)
            if not job:
                return None
            resp = ProcessingJobResponse.model_validate(job)
            self._cached_jobs[job_id] = resp
            return resp

    async def update_job(
        self,
        job_id: str,
        status: str | None = None,
        progress: float | None = None,
        message: str | None = None,
        error: str | None = None,
        force_db: bool = False,
    ) -> ProcessingJobResponse | None:
        cached = self._cached_jobs.get(job_id)
        if not cached:
            cached = await self.get_job(job_id)
            if not cached:
                return None

        new_status = status if status is not None else cached.status
        new_progress = min(100.0, max(0.0, progress)) if progress is not None else cached.progress
        new_message = message if message is not None else cached.message
        new_error = error if error is not None else cached.error
        now = datetime.now(timezone.utc)

        updated_resp = ProcessingJobResponse(
            id=cached.id,
            project_id=cached.project_id,
            type=cached.type,
            status=new_status,
            progress=new_progress,
            message=new_message,
            error=new_error,
            metadata=cached.metadata,
            created_at=cached.created_at,
            updated_at=now,
            completed_at=now if new_status in ("completed", "failed", "cancelled") else cached.completed_at,
        )
        self._cached_jobs[job_id] = updated_resp
        self._broadcast(updated_resp)

        should_sync_db = (
            force_db
            or status is not None
            or error is not None
            or (time.time() - self._last_db_time.get(job_id, 0.0) >= 0.5)
            or (abs(new_progress - self._last_db_pct.get(job_id, 0.0)) >= 2.0)
        )

        if should_sync_db:
            try:
                async with self._db_lock:
                    async with GlobalAsyncSessionLocal() as session:
                        job = await session.get(ProcessingJobModel, job_id)
                        if job:
                            if status is not None:
                                job.status = status
                            if progress is not None:
                                job.progress = new_progress
                            if message is not None:
                                job.message = message
                            if error is not None:
                                job.error = error
                            if new_status in ("completed", "failed", "cancelled"):
                                job.completed_at = now
                            job.updated_at = now
                            await session.commit()
                            self._last_db_time[job_id] = time.time()
                            self._last_db_pct[job_id] = new_progress
            except Exception as e:
                logger.warning(f"Failed to persist job update to DB for {job_id}: {e}")

        return updated_resp

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
                await self.update_job(job_id, status="running", message="Processing...", force_db=True)

                def progress_cb(pct: float, msg: str):
                    asyncio.create_task(self.update_job(job_id, progress=pct, message=msg))

                try:
                    await coro_fn(progress_cb, cancel_event)
                    await self.update_job(job_id, status="completed", progress=100.0, message="Completed successfully", force_db=True)
                except asyncio.CancelledError:
                    await self.update_job(job_id, status="cancelled", message="Operation cancelled by user", force_db=True)
                except Exception as e:
                    logger.exception(f"Job {job_id} encountered an error: {e}")
                    await self.update_job(job_id, status="failed", message=str(e), error=str(e), force_db=True)
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
