import os
from pathlib import Path
from collections.abc import AsyncGenerator
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.core.config import settings


class Base(DeclarativeBase):
    pass


# Global engine for app settings, recent projects, etc.
global_engine = create_async_engine(
    settings.GLOBAL_DATABASE_URL,
    echo=False,
    connect_args={"check_same_thread": False},
)

GlobalAsyncSessionLocal = async_sessionmaker(
    bind=global_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

# Project session cache: project_dir -> async_sessionmaker
_project_session_makers: dict[str, async_sessionmaker[AsyncSession]] = {}
_project_engines: dict[str, any] = {}


def get_project_engine(project_dir: Path):
    path_str = str(project_dir.resolve())
    if path_str not in _project_engines:
        db_path = project_dir / "database.sqlite"
        db_url = f"sqlite+aiosqlite:///{db_path.as_posix()}"
        engine = create_async_engine(
            db_url,
            echo=False,
            connect_args={"check_same_thread": False},
        )
        _project_engines[path_str] = engine
        _project_session_makers[path_str] = async_sessionmaker(
            bind=engine,
            class_=AsyncSession,
            expire_on_commit=False,
        )
    return _project_engines[path_str], _project_session_makers[path_str]


async def get_global_db() -> AsyncGenerator[AsyncSession, None]:
    async with GlobalAsyncSessionLocal() as session:
        yield session


async def init_db() -> None:
    settings.init_directories()
    async with global_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def init_project_db(project_dir: Path) -> None:
    engine, _ = get_project_engine(project_dir)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
