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


def _migrate_sqlite_schema(conn) -> None:
    """Safe, idempotent auto-migration for existing SQLite project databases."""
    migrations = {
        "translation_segments": [
            ("spoken_script", "TEXT"),
            ("subtitle_text", "TEXT"),
            ("pronunciation_text", "TEXT"),
            ("approval_status", "VARCHAR(32) DEFAULT 'draft'"),
            ("review_reasons", "JSON DEFAULT '[]'"),
            ("context_notes", "TEXT"),
            ("form_of_address", "VARCHAR(64)"),
            ("dubbing_register", "VARCHAR(32)"),
            ("register", "VARCHAR(32)"),
        ],
        "generated_audios": [
            ("measured_duration_ms", "INTEGER DEFAULT 0"),
            ("timing_budget_ms", "INTEGER DEFAULT 0"),
            ("tempo_factor", "FLOAT DEFAULT 1.0"),
            ("take_number", "INTEGER DEFAULT 1"),
            ("is_current", "BOOLEAN DEFAULT 1"),
            ("review_status", "VARCHAR(32) DEFAULT 'generated'"),
            ("review_reasons", "JSON DEFAULT '[]'"),
            ("revision_attempts", "INTEGER DEFAULT 0"),
            ("pronunciation_text_used", "TEXT"),
            ("stale", "BOOLEAN DEFAULT 0"),
        ],
        "speakers": [
            ("gender", "VARCHAR(32)"),
            ("age_group", "VARCHAR(32)"),
            ("relationship_role", "VARCHAR(64)"),
            ("preferred_form_of_address", "VARCHAR(64)"),
        ],
        "projects": [
            ("dubbing_register", "VARCHAR(32) DEFAULT 'natural'"),
            ("character_memory", "JSON DEFAULT '{}'"),
            ("glossary", "JSON DEFAULT '{}'"),
            ("pronunciation_overrides", "JSON DEFAULT '{}'"),
        ],
    }

    for table, cols in migrations.items():
        try:
            res = conn.exec_driver_sql(f"PRAGMA table_info({table})")
            existing_cols = {row[1] for row in res.fetchall()}
            if not existing_cols:
                continue
            for col_name, col_type in cols:
                if col_name not in existing_cols:
                    conn.exec_driver_sql(f"ALTER TABLE {table} ADD COLUMN {col_name} {col_type}")
        except Exception:
            pass

    # Migrate legacy Gemini model settings to gemini-3.5-flash
    try:
        conn.exec_driver_sql(
            "UPDATE settings SET value = 'gemini-3.5-flash' "
            "WHERE key = 'gemini_model' AND (value LIKE 'gemini-2.5%' OR value LIKE 'gemini-1.5%' OR value = 'gemini-flash-latest')"
        )
    except Exception:
        pass


async def get_global_db() -> AsyncGenerator[AsyncSession, None]:
    async with GlobalAsyncSessionLocal() as session:
        yield session


async def init_db() -> None:
    settings.init_directories()
    async with global_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(_migrate_sqlite_schema)


async def init_project_db(project_dir: Path) -> None:
    engine, _ = get_project_engine(project_dir)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(_migrate_sqlite_schema)

