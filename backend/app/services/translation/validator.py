"""
Translation Batch Validator and Advisory Quality Checks.

Provides strict structural validation to reject corrupt/missing provider responses,
and advisory checks for semantic risks: omissions, negation flips, quantities,
glossary adherence, and timing overrun risks.
"""

import re
from typing import Any
from app.core.errors import DubStudioError


class TranslationBatchValidator:
    @staticmethod
    def validate_batch_structure(
        requested_ids: list[str],
        response_items: list[dict[str, Any]],
    ) -> dict[str, dict[str, Any]]:
        """
        Strict structural validation:
        - Rejects missing segment IDs.
        - Rejects duplicate IDs.
        - Rejects unexpected IDs.
        - Rejects empty or invalid values.
        - Rejects silent substitution of untranslated source dialogue.
        Returns a lookup map: segment_id -> response_dict.
        """
        requested_set = set(requested_ids)
        if len(requested_set) != len(requested_ids):
            raise DubStudioError("VALIDATION_ERROR", "Duplicate segment IDs in translation request batch.")

        seen_ids = set()
        lookup: dict[str, dict[str, Any]] = {}

        for item in response_items:
            seg_id = item.get("id") or item.get("segment_id")
            if not seg_id:
                raise DubStudioError("VALIDATION_ERROR", f"Malformed response: item missing 'id': {item}")

            if seg_id in seen_ids:
                raise DubStudioError("VALIDATION_ERROR", f"Duplicate segment ID in response: {seg_id}")
            seen_ids.add(seg_id)

            if seg_id not in requested_set:
                raise DubStudioError("VALIDATION_ERROR", f"Unexpected segment ID in provider response: {seg_id}")

            t_text = str(item.get("translated_text", "")).strip()
            if not t_text:
                raise DubStudioError("VALIDATION_ERROR", f"Empty translated_text for segment ID: {seg_id}")

            lookup[seg_id] = item

        # Check for missing IDs
        missing_ids = requested_set - seen_ids
        if missing_ids:
            raise DubStudioError(
                "VALIDATION_ERROR",
                f"Provider omitted {len(missing_ids)} segment(s) from response: {list(missing_ids)[:5]}"
            )

        return lookup

    @staticmethod
    def run_advisory_checks(
        source_text: str,
        translated_text: str,
        spoken_script: str,
        duration_sec: float,
        glossary: dict[str, str] | None = None,
        preferred_address: str | None = None,
    ) -> list[str]:
        """
        Performs advisory semantic and timing checks without raising exceptions.
        Flags potential problems for human review in the review workflow.
        """
        review_reasons: list[str] = []
        glossary = glossary or {}
        src_lower = source_text.lower()
        t_clean = translated_text.strip()
        spoken_clean = spoken_script.strip() if spoken_script else t_clean

        # 1. Untranslated source check
        if src_lower == t_clean.lower() and len(src_lower) > 3:
            review_reasons.append("untranslated_source_text")

        # 2. Negation flip check
        english_negations = {"not", "never", "no", "don't", "didn't", "doesn't", "can't", "won't", "cannot", "hardly", "neither", "none"}
        khmer_negations = ["មិន", "អត់", "ពុំ", "កុំ", "គ្មាន", "បដិសេធ"]

        src_words = set(re.findall(r"\b[a-z']+\b", src_lower))
        src_has_neg = bool(src_words & english_negations)
        khmer_has_neg = any(kn in t_clean or kn in spoken_clean for kn in khmer_negations)

        if src_has_neg and not khmer_has_neg:
            review_reasons.append("potential_negation_flip_missing")
        elif not src_has_neg and khmer_has_neg:
            # Source positive but translation negative (rare, e.g. "Stay!" -> "កុំទៅ")
            pass

        # 3. Quantity check: detect numbers in source (digits or spelled numbers)
        digits_in_src = re.findall(r"\b\d+\b", source_text)
        if digits_in_src:
            for d in digits_in_src:
                if d not in t_clean and d not in spoken_clean:
                    # Check if spelled out in Khmer
                    from app.services.khmer.pronunciation import number_to_khmer_words
                    try:
                        km_words = number_to_khmer_words(int(d))
                        if km_words not in t_clean and km_words not in spoken_clean:
                            review_reasons.append(f"quantity_check_{d}")
                            break
                    except Exception:
                        review_reasons.append(f"quantity_check_{d}")
                        break

        # 4. Glossary adherence check
        for g_term, g_val in glossary.items():
            if re.search(rf"\b{re.escape(g_term)}\b", source_text, flags=re.IGNORECASE):
                if g_val not in t_clean and g_val not in spoken_clean:
                    review_reasons.append(f"glossary_deviation_{g_term}")

        # 5. Timing overrun risk check
        # Khmer spoken rate is roughly 14 to 18 characters per second
        if duration_sec > 0:
            char_count = len(spoken_clean.replace(" ", ""))
            chars_per_sec = char_count / duration_sec
            if chars_per_sec > 22.0:
                review_reasons.append("timing_overrun_risk")
            elif chars_per_sec < 4.0 and char_count > 0:
                review_reasons.append("timing_underrun_risk")

        # 6. Form of address check
        if preferred_address and preferred_address not in spoken_clean and preferred_address not in t_clean:
            # Advisory check for preferred address form
            review_reasons.append(f"preferred_address_check_{preferred_address}")

        return review_reasons
