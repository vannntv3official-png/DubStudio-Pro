from datetime import datetime
from typing import Any
from pydantic import BaseModel, ConfigDict, model_validator
from pydantic.alias_generators import to_camel


class ProcessingJobResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, alias_generator=to_camel)

    id: str
    project_id: str
    type: str
    status: str
    progress: float
    message: str
    error: str | None = None
    metadata: dict | None = None
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None = None

    @model_validator(mode="before")
    @classmethod
    def resolve_job_metadata(cls, data: Any) -> Any:
        if hasattr(data, "metadata_json"):
            return {
                "id": getattr(data, "id", ""),
                "project_id": getattr(data, "project_id", ""),
                "type": getattr(data, "type", ""),
                "status": getattr(data, "status", "queued"),
                "progress": getattr(data, "progress", 0.0),
                "message": getattr(data, "message", ""),
                "error": getattr(data, "error", None),
                "metadata": getattr(data, "metadata_json", {}) or {},
                "created_at": getattr(data, "created_at", datetime.now()),
                "updated_at": getattr(data, "updated_at", datetime.now()),
                "completed_at": getattr(data, "completed_at", None),
            }
        return data
