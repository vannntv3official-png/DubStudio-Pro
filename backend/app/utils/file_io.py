import os
import json
import shutil
import tempfile
from pathlib import Path
from typing import Any


def atomic_write_json(file_path: Path, data: Any) -> None:
    """Atomically writes JSON to disk using a temporary file to prevent corruption."""
    file_path.parent.mkdir(parents=True, exist_ok=True)
    temp_fd, temp_path = tempfile.mkstemp(
        dir=file_path.parent,
        prefix=f".{file_path.name}.",
        suffix=".tmp"
    )
    with os.fdopen(temp_fd, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    # Windows replacement handles atomic replace if destination already exists
    shutil.move(temp_path, file_path)


def atomic_write_text(file_path: Path, text: str) -> None:
    """Atomically writes plain text to disk."""
    file_path.parent.mkdir(parents=True, exist_ok=True)
    temp_fd, temp_path = tempfile.mkstemp(
        dir=file_path.parent,
        prefix=f".{file_path.name}.",
        suffix=".tmp"
    )
    with os.fdopen(temp_fd, "w", encoding="utf-8") as f:
        f.write(text)
    shutil.move(temp_path, file_path)


def resolve_project_relative(project_dir: Path, target_path: str) -> Path:
    """Resolves a path relative to the project directory, or absolute if outside."""
    p = Path(target_path)
    if p.is_absolute():
        return p
    return (project_dir / p).resolve()


def make_project_relative(project_dir: Path, target_path: Path) -> str:
    """Returns a relative path if target is inside project_dir, or absolute string otherwise."""
    try:
        rel = target_path.relative_to(project_dir)
        return rel.as_posix()
    except ValueError:
        return str(target_path.resolve())
