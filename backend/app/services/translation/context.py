"""
Dialogue Context Builder for Context-Aware Khmer Dubbing.

Builds structured context layers containing speaker turns, neighboring dialogue,
glossaries, approved translations, confirmed vs inferred character facts,
and speech timing budgets.
"""

from typing import Any
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class DialogueTurnContext(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, alias_generator=to_camel)

    segment_id: str
    speaker_id: str
    speaker_name: str
    text: str
    start_ms: int
    end_ms: int
    duration_sec: float
    gap_after_ms: int = 0
    speaker_gender: str | None = None
    speaker_age: str | None = None
    speaker_role: str | None = None
    preferred_address: str | None = None
    preceding_turns: list[dict[str, str]] = []
    following_turns: list[dict[str, str]] = []
    approved_text: str | None = None
    is_approved: bool = False


class ProjectDialogueContext(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, alias_generator=to_camel)

    project_id: str
    source_language: str = "en"
    target_language: str = "km"
    dubbing_register: str = "natural"  # "natural", "formal", "intimate"
    glossary: dict[str, str] = {}
    character_memory: dict[str, Any] = {}
    turns: list[DialogueTurnContext] = []


class DialogueContextBuilder:
    @staticmethod
    def build_context(
        project_id: str,
        transcripts: list[Any],
        speakers: dict[str, Any],
        existing_translations: dict[str, Any],
        glossary: dict[str, str] | None = None,
        character_memory: dict[str, Any] | None = None,
        dubbing_register: str = "natural",
        source_language: str = "en",
        target_language: str = "km",
        context_window_size: int = 2,
    ) -> ProjectDialogueContext:
        """
        Builds a comprehensive, ordered context model for all dialogue segments.
        Ensures confirmed facts are kept explicit, and unknown values are None (never invented).
        """
        turns: list[DialogueTurnContext] = []
        glossary = glossary or {}
        character_memory = character_memory or {}

        # Transcripts must be sorted by start_ms
        sorted_transcripts = sorted(transcripts, key=lambda t: t.start_ms)
        n = len(sorted_transcripts)

        for i, t in enumerate(sorted_transcripts):
            sp = speakers.get(t.speaker_id)
            sp_name = getattr(sp, "name", None) or t.speaker_id
            sp_gender = getattr(sp, "gender", None)
            sp_age = getattr(sp, "age_group", None)
            sp_role = getattr(sp, "relationship_role", None)
            sp_addr = getattr(sp, "preferred_form_of_address", None)


            # Calculate gap to next turn
            dur_ms = max(400, t.end_ms - t.start_ms)
            dur_sec = round(dur_ms / 1000.0, 2)
            gap_after = 0
            if i < n - 1:
                next_t = sorted_transcripts[i + 1]
                gap_after = max(0, next_t.start_ms - t.end_ms)

            # Preceding turns for context
            preceding: list[dict[str, str]] = []
            for j in range(max(0, i - context_window_size), i):
                prev_t = sorted_transcripts[j]
                prev_sp = speakers.get(prev_t.speaker_id)
                prev_name = prev_sp.name if prev_sp and prev_sp.name else prev_t.speaker_id
                prev_tr = existing_translations.get(prev_t.id)
                preceding.append({
                    "speaker": prev_name,
                    "source": prev_t.text,
                    "target": prev_tr.translated_text if prev_tr else "",
                })

            # Following turns for conversational intent
            following: list[dict[str, str]] = []
            for j in range(i + 1, min(n, i + 1 + context_window_size)):
                next_t = sorted_transcripts[j]
                next_sp = speakers.get(next_t.speaker_id)
                next_name = next_sp.name if next_sp and next_sp.name else next_t.speaker_id
                following.append({
                    "speaker": next_name,
                    "source": next_t.text,
                })

            # Existing translation & approval
            ex_tr = existing_translations.get(t.id)
            is_approved = bool(ex_tr and getattr(ex_tr, "approval_status", "draft") == "approved")
            approved_text = ex_tr.translated_text if is_approved and ex_tr else None

            turns.append(
                DialogueTurnContext(
                    segment_id=t.id,
                    speaker_id=t.speaker_id,
                    speaker_name=sp_name,
                    text=t.text,
                    start_ms=t.start_ms,
                    end_ms=t.end_ms,
                    duration_sec=dur_sec,
                    gap_after_ms=gap_after,
                    speaker_gender=sp_gender,
                    speaker_age=sp_age,
                    speaker_role=sp_role,
                    preferred_address=sp_addr,
                    preceding_turns=preceding,
                    following_turns=following,
                    approved_text=approved_text,
                    is_approved=is_approved,
                )
            )

        return ProjectDialogueContext(
            project_id=project_id,
            source_language=source_language,
            target_language=target_language,
            dubbing_register=dubbing_register,
            glossary=glossary,
            character_memory=character_memory,
            turns=turns,
        )

    @staticmethod
    def partition_into_batches(
        context: ProjectDialogueContext,
        batch_size: int = 12,
    ) -> list[list[DialogueTurnContext]]:
        """
        Partitions turns into manageable batches to prevent LLM hallucination or omission
        on large scripts while maintaining bounded memory.
        """
        unapproved_turns = [t for t in context.turns if not t.is_approved]
        if not unapproved_turns:
            return []

        batches: list[list[DialogueTurnContext]] = []
        for i in range(0, len(unapproved_turns), batch_size):
            batches.append(unapproved_turns[i : i + batch_size])
        return batches
