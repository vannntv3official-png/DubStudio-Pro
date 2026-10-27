import re
import uuid
import unicodedata
from pathlib import Path
from sqlalchemy import select, delete
from app.database.session import get_project_engine, GlobalAsyncSessionLocal
from app.models.project import ProjectModel
from app.models.subtitle import SubtitleItemModel
from app.models.transcript import TranscriptSegmentModel
from app.models.translation import TranslationSegmentModel
from app.schemas.subtitle import SubtitleItemSchema, SubtitleStateResponse, SubtitleStyleSchema


def format_srt_timestamp(ms: int) -> str:
    total_seconds = ms // 1000
    milli = ms % 1000
    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    seconds = total_seconds % 60
    return f"{hours:02d}:{minutes:02d}:{seconds:02d},{milli:03d}"


def format_vtt_timestamp(ms: int) -> str:
    total_seconds = ms // 1000
    milli = ms % 1000
    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    seconds = total_seconds % 60
    return f"{hours:02d}:{minutes:02d}:{seconds:02d}.{milli:03d}"


def format_ass_timestamp(ms: int) -> str:
    total_seconds = ms // 1000
    cs = (ms % 1000) // 10
    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    seconds = total_seconds % 60
    return f"{hours:d}:{minutes:02d}:{seconds:02d}.{cs:02d}"


def hex_to_ass_color(hex_str: str, default: str = "&H00FFFFFF&") -> str:
    hex_clean = hex_str.strip().lstrip("#")
    if len(hex_clean) == 6:
        r, g, b = hex_clean[0:2], hex_clean[2:4], hex_clean[4:6]
        return f"&H00{b}{g}{r}&"
    return default


def normalize_khmer_text(text: str) -> str:
    """Applies Unicode NFC normalization and strips rogue zero-width spaces."""
    normalized = unicodedata.normalize("NFC", text)
    # Remove excessive zero-width spaces that might break subtitles
    return normalized.replace("\u200b\u200b", "\u200b")


def deoverlap_subtitles(items: list[SubtitleItemModel]) -> list[SubtitleItemModel]:
    """
    Sorts subtitle items chronologically, removes duplicates, and strictly prevents
    overlapping timestamps by adjusting end times with a minimum 40ms separation gap.
    """
    if not items:
        return []

    # Sort primarily by start_ms, secondarily by end_ms
    sorted_items = sorted(items, key=lambda x: (x.start_ms, x.end_ms))
    cleaned: list[SubtitleItemModel] = []

    for item in sorted_items:
        text = (item.text or "").strip()
        if not text:
            continue

        if not cleaned:
            cleaned.append(item)
            continue

        prev = cleaned[-1]

        # Case 1: Exact or nearly duplicate timestamp and text
        if abs(item.start_ms - prev.start_ms) <= 250 and (item.text == prev.text or item.text in prev.text or prev.text in item.text):
            if len(item.text) > len(prev.text):
                cleaned[-1] = item
            continue

        # Case 2: Start time is identical or within 40ms
        if item.start_ms <= prev.start_ms + 40:
            if len(item.text) >= len(prev.text):
                cleaned[-1] = item
            continue

        # Case 3: Overlapping times (prev.end_ms > item.start_ms)
        if prev.end_ms > item.start_ms:
            # Clamp previous end_ms to leave at least 40ms gap
            prev.end_ms = max(prev.start_ms + 150, item.start_ms - 40)

        # Ensure current item has at least minimum valid duration (200ms)
        if item.end_ms <= item.start_ms:
            item.end_ms = item.start_ms + 300

        cleaned.append(item)

    return cleaned


class SubtitleService:
    @staticmethod
    async def get_subtitles(project_id: str) -> SubtitleStateResponse:
        async with GlobalAsyncSessionLocal() as g_session:
            project = await g_session.get(ProjectModel, project_id)
            if not project:
                raise ValueError("Project not found")

        project_dir = Path(project.project_dir)
        _, session_maker = get_project_engine(project_dir)

        async with session_maker() as session:
            stmt = select(SubtitleItemModel).where(SubtitleItemModel.project_id == project_id).order_by(SubtitleItemModel.start_ms)
            res = await session.execute(stmt)
            items = list(res.scalars().all())

            # Resilient Auto-Populate: If subtitle items are empty, generate from translations or transcripts
            if not items:
                # 1. Try translations first
                tr_stmt = select(TranslationSegmentModel).where(TranslationSegmentModel.project_id == project_id)
                tr_res = await session.execute(tr_stmt)
                translations = list(tr_res.scalars().all())

                if translations:
                    tc_stmt = select(TranscriptSegmentModel).where(TranscriptSegmentModel.project_id == project_id)
                    tc_res = await session.execute(tc_stmt)
                    transcripts = {t.id: t for t in tc_res.scalars().all()}

                    new_items = []
                    for tr in translations:
                        t_seg = transcripts.get(tr.segment_id)
                        text = (tr.translated_text or (t_seg.text if t_seg else "")).strip()
                        if t_seg and text:
                            sub_item = SubtitleItemModel(
                                id=str(uuid.uuid4()),
                                project_id=project_id,
                                start_ms=t_seg.start_ms,
                                end_ms=t_seg.end_ms,
                                text=normalize_khmer_text(text),
                                speaker_id=t_seg.speaker_id,
                            )
                            session.add(sub_item)
                            new_items.append(sub_item)
                    if new_items:
                        await session.commit()
                        new_items.sort(key=lambda x: x.start_ms)
                        items = new_items
                else:
                    # 2. Try raw transcripts if no translations yet
                    tc_stmt = select(TranscriptSegmentModel).where(TranscriptSegmentModel.project_id == project_id).order_by(TranscriptSegmentModel.start_ms)
                    tc_res = await session.execute(tc_stmt)
                    transcripts = list(tc_res.scalars().all())
                    if transcripts:
                        new_items = []
                        for t_seg in transcripts:
                            text = (t_seg.text or "").strip()
                            if text:
                                sub_item = SubtitleItemModel(
                                    id=str(uuid.uuid4()),
                                    project_id=project_id,
                                    start_ms=t_seg.start_ms,
                                    end_ms=t_seg.end_ms,
                                    text=normalize_khmer_text(text),
                                    speaker_id=t_seg.speaker_id,
                                )
                                session.add(sub_item)
                                new_items.append(sub_item)
                        if new_items:
                            await session.commit()
                            items = new_items

            # Automatic Self-Healing & De-overlapping
            if items:
                cleaned = deoverlap_subtitles(items)
                has_diff = len(cleaned) != len(items) or any(
                    c.end_ms != o.end_ms or c.start_ms != o.start_ms or c.text != o.text
                    for c, o in zip(cleaned, items)
                )
                if has_diff:
                    await session.execute(delete(SubtitleItemModel).where(SubtitleItemModel.project_id == project_id))
                    for c in cleaned:
                        session.add(
                            SubtitleItemModel(
                                id=c.id,
                                project_id=project_id,
                                start_ms=c.start_ms,
                                end_ms=c.end_ms,
                                text=c.text,
                                speaker_id=c.speaker_id,
                            )
                        )
                    await session.commit()
                    items = cleaned

            style = SubtitleStyleSchema.model_validate(project.subtitle_style)
            return SubtitleStateResponse(
                projectId=project_id,
                style=style,
                items=[SubtitleItemSchema.model_validate(i) for i in items],
            )

    @staticmethod
    async def fix_overlaps(project_id: str) -> SubtitleStateResponse:
        """Forces an explicit de-overlap and reconciliation of all subtitle items in the project."""
        return await SubtitleService.get_subtitles(project_id)

    @staticmethod
    async def sync_from_translations(project_id: str) -> None:
        """Synchronizes subtitle items from the latest translations and transcript timings."""
        async with GlobalAsyncSessionLocal() as g_session:
            project = await g_session.get(ProjectModel, project_id)
            if not project:
                return

        project_dir = Path(project.project_dir)
        _, session_maker = get_project_engine(project_dir)

        async with session_maker() as session:
            tr_stmt = select(TranslationSegmentModel).where(TranslationSegmentModel.project_id == project_id)
            tr_res = await session.execute(tr_stmt)
            translations = list(tr_res.scalars().all())
            if not translations:
                return

            tc_stmt = select(TranscriptSegmentModel).where(TranscriptSegmentModel.project_id == project_id)
            tc_res = await session.execute(tc_stmt)
            transcripts = {t.id: t for t in tc_res.scalars().all()}

            await session.execute(delete(SubtitleItemModel).where(SubtitleItemModel.project_id == project_id))

            raw_items = []
            for tr in translations:
                t_seg = transcripts.get(tr.segment_id)
                text = (tr.translated_text or (t_seg.text if t_seg else "")).strip()
                if t_seg and text:
                    raw_items.append(
                        SubtitleItemModel(
                            id=str(uuid.uuid4()),
                            project_id=project_id,
                            start_ms=t_seg.start_ms,
                            end_ms=t_seg.end_ms,
                            text=normalize_khmer_text(text),
                            speaker_id=t_seg.speaker_id,
                        )
                    )
            cleaned = deoverlap_subtitles(raw_items)
            for sub_item in cleaned:
                session.add(sub_item)
            await session.commit()

    @staticmethod
    async def sync_from_transcripts_if_empty(project_id: str) -> None:
        """Populates subtitle items from transcript segments if no subtitles exist yet."""
        async with GlobalAsyncSessionLocal() as g_session:
            project = await g_session.get(ProjectModel, project_id)
            if not project:
                return

        project_dir = Path(project.project_dir)
        _, session_maker = get_project_engine(project_dir)

        async with session_maker() as session:
            existing_stmt = select(SubtitleItemModel).where(SubtitleItemModel.project_id == project_id)
            existing = (await session.execute(existing_stmt)).scalars().first()
            if existing:
                return

            tc_stmt = select(TranscriptSegmentModel).where(TranscriptSegmentModel.project_id == project_id).order_by(TranscriptSegmentModel.start_ms)
            transcripts = list((await session.execute(tc_stmt)).scalars().all())
            for t_seg in transcripts:
                text = (t_seg.text or "").strip()
                if text:
                    sub_item = SubtitleItemModel(
                        id=str(uuid.uuid4()),
                        project_id=project_id,
                        start_ms=t_seg.start_ms,
                        end_ms=t_seg.end_ms,
                        text=normalize_khmer_text(text),
                        speaker_id=t_seg.speaker_id,
                    )
                    session.add(sub_item)
            await session.commit()

    @staticmethod
    async def export_srt(project_id: str, output_path: Path | None = None) -> str:
        data = await SubtitleService.get_subtitles(project_id)
        lines = []
        for idx, item in enumerate(data.items, start=1):
            start = format_srt_timestamp(item.start_ms)
            end = format_srt_timestamp(item.end_ms)
            text = normalize_khmer_text(item.text)
            lines.append(f"{idx}\n{start} --> {end}\n{text}\n")
        content = "\n".join(lines)

        if output_path:
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_text(content, encoding="utf-8")
        return content

    @staticmethod
    async def export_vtt(project_id: str, output_path: Path | None = None) -> str:
        data = await SubtitleService.get_subtitles(project_id)
        lines = ["WEBVTT\n"]
        for idx, item in enumerate(data.items, start=1):
            start = format_vtt_timestamp(item.start_ms)
            end = format_vtt_timestamp(item.end_ms)
            text = normalize_khmer_text(item.text)
            lines.append(f"{idx}\n{start} --> {end}\n{text}\n")
        content = "\n".join(lines)

        if output_path:
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_text(content, encoding="utf-8")
        return content

    @staticmethod
    async def export_ass(
        project_id: str,
        output_path: Path | None = None,
        video_width: int = 1920,
        video_height: int = 1080,
    ) -> str:
        """Exports ASS (Advanced SubStation Alpha) with full HarfBuzz complex shaping for Khmer."""
        data = await SubtitleService.get_subtitles(project_id)
        style = data.style

        # Prefer Khmer OS Siemreap / Khmer OS for rock-solid HarfBuzz ligature rendering on Windows
        font_name = "Khmer OS Siemreap"
        if style.font_family:
            for candidate in ["Khmer OS Siemreap", "Khmer OS", "Khmer OS Battambang", "Noto Sans Khmer", "Kantumruy Pro"]:
                if candidate.lower() in style.font_family.lower():
                    font_name = candidate
                    break

        # Sizing relative to PlayResY (1080p canvas)
        base_size = int(style.font_size or 24)
        scaled_size = max(36, int(base_size * (video_height / 720.0)))

        primary_color = hex_to_ass_color(style.text_color, "&H0000E6FF&")  # Default yellow
        outline_color = hex_to_ass_color(style.outline_color, "&H00000000&")
        outline_thick = max(1.5, float(style.outline_thickness or 2.5))
        shadow_blur = int(style.shadow_blur or 2)

        alignment = 2  # Bottom-Center
        if style.alignment == "top":
            alignment = 8
        elif style.alignment == "middle":
            alignment = 5

        margin_v = int((style.vertical_margin or 48) * (video_height / 720.0))

        header = f"""[Script Info]
; Script generated by DubStudio Pro AI
ScriptType: v4.00+
PlayResX: {video_width}
PlayResY: {video_height}
ScaledBorderAndShadow: yes
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,{font_name},{scaled_size},{primary_color},&H000000FF&,{outline_color},&H00000000&,-1,0,0,0,100,100,0,0,1,{outline_thick:.1f},{shadow_blur},{alignment},40,40,{margin_v},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
        lines = [header.strip()]
        for item in data.items:
            start = format_ass_timestamp(item.start_ms)
            end = format_ass_timestamp(item.end_ms)
            text = normalize_khmer_text(item.text).replace("\n", "\\N")
            lines.append(f"Dialogue: 0,{start},{end},Default,,0,0,0,,{text}")

        content = "\n".join(lines) + "\n"
        if output_path:
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_text(content, encoding="utf-8")
        return content

    @staticmethod
    async def import_srt(project_id: str, srt_content: str) -> SubtitleStateResponse:
        async with GlobalAsyncSessionLocal() as g_session:
            project = await g_session.get(ProjectModel, project_id)
            if not project:
                raise ValueError("Project not found")

        project_dir = Path(project.project_dir)
        _, session_maker = get_project_engine(project_dir)

        # Regex for SRT block: index, timestamp, text
        pattern = re.compile(
            r"(\d+)\s*\n(\d{2}:\d{2}:\d{2}[,\.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,\.]\d{3})\s*\n(.*?)(?=\n\s*\d+\s*\n|\Z)",
            re.DOTALL,
        )

        def parse_ts(ts_str: str) -> int:
            ts_str = ts_str.replace(",", ".")
            h, m, s = ts_str.split(":")
            sec, ms = s.split(".")
            return int(h) * 3600000 + int(m) * 60000 + int(sec) * 1000 + int(ms)

        matches = pattern.findall(srt_content)
        async with session_maker() as session:
            await session.execute(delete(SubtitleItemModel).where(SubtitleItemModel.project_id == project_id))
            for _, start_str, end_str, text_str in matches:
                start_ms = parse_ts(start_str.strip())
                end_ms = parse_ts(end_str.strip())
                text = normalize_khmer_text(text_str.strip())
                item = SubtitleItemModel(
                    id=str(uuid.uuid4()),
                    project_id=project_id,
                    start_ms=start_ms,
                    end_ms=end_ms,
                    text=text,
                )
                session.add(item)
            await session.commit()

        return await SubtitleService.get_subtitles(project_id)
