from fastapi import APIRouter, HTTPException, status
from app.schemas.project import ProjectCreate, ProjectUpdate, ProjectResponse
from app.services.projects.service import ProjectService

router = APIRouter(prefix="/projects", tags=["projects"])


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(data: ProjectCreate):
    return await ProjectService.create_project(data)


@router.get("", response_model=list[ProjectResponse])
async def list_recent_projects():
    return await ProjectService.list_recent_projects()


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(project_id: str):
    p = await ProjectService.get_project(project_id)
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    return p


@router.put("/{project_id}", response_model=ProjectResponse)
async def update_project(project_id: str, data: ProjectUpdate):
    p = await ProjectService.update_project(project_id, data)
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    return p
