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
        id_alias_map: dict[str, str] | None = None,
    ) -> dict[str, dict[str, Any]]:
        """
        Validates provider response structure with resilient ID resolution:
        - Resolves IDs via alias mapping (seg_1, seg_2 -> real UUID),
          exact match, prefix/truncation tolerance, or ordinal position.
        - Rejects missing segment IDs (all requested IDs must be satisfied).
        - Rejects duplicate mapped IDs.
        - Rejects truly unexpected or unresolvable items.
        - Rejects empty translated text values.
        Returns a lookup map: real_segment_id -> response_dict.
        """
        requested_set = set(requested_ids)
        if len(requested_set) != len(requested_ids):
            raise DubStudioError("VALIDATION_ERROR", "Duplicate segment IDs in translation request batch.")

        alias_map = dict(id_alias_map or {})
        # Prepopulate alias map with index aliases: "1" -> id[0], "seg_1" -> id[0], etc.
        for idx, req_id in enumerate(requested_ids):
            alias_map[str(idx + 1)] = req_id
            alias_map[f"seg_{idx + 1}"] = req_id
            alias_map[f"segment_{idx + 1}"] = req_id
            alias_map[req_id] = req_id

        unmapped_req_ids = set(requested_ids)
        seen_raw_ids: set[str] = set()
        seen_target_ids: set[str] = set()
        resolved_lookup: dict[str, dict[str, Any]] = {}
        unresolved_items: list[tuple[int, dict[str, Any], str]] = []

        # Pass 1: Direct, alias, and prefix/truncation matching
        for item_idx, item in enumerate(response_items):
            raw_id = str(item.get("id") or item.get("segment_id") or "").strip()
            if not raw_id and item.get("index") is not None:
                raw_id = str(item.get("index"))

            # Check for duplicate raw ID
            if raw_id:
                if raw_id in seen_raw_ids:
                    raise DubStudioError("VALIDATION_ERROR", f"Duplicate segment ID in provider response: {raw_id}")
                seen_raw_ids.add(raw_id)

            target_id = None
            if raw_id in unmapped_req_ids:
                target_id = raw_id
            elif raw_id in alias_map:
                candidate_target = alias_map[raw_id]
                if candidate_target in seen_target_ids:
                    raise DubStudioError("VALIDATION_ERROR", f"Duplicate segment ID in provider response: {raw_id}")
                if candidate_target in unmapped_req_ids:
                    target_id = candidate_target
            else:
                # Check for prefix or 1-2 char truncation (e.g. LLM dropped trailing char of UUID)
                clean_raw = raw_id.replace("-", "").lower()
                candidates = [
                    req_id for req_id in unmapped_req_ids
                    if (len(raw_id) >= 8 and (req_id.startswith(raw_id) or raw_id.startswith(req_id)))
                    or (len(clean_raw) >= 8 and req_id.replace("-", "").lower().startswith(clean_raw))
                ]
                if len(candidates) == 1:
                    target_id = candidates[0]

            if target_id:
                if target_id in seen_target_ids:
                    raise DubStudioError("VALIDATION_ERROR", f"Duplicate segment ID in provider response: {target_id}")
                t_text = str(item.get("translated_text", "")).strip()
                if not t_text:
                    raise DubStudioError("VALIDATION_ERROR", f"Empty translated_text for segment ID: {target_id}")
                resolved_lookup[target_id] = item
                seen_target_ids.add(target_id)
                unmapped_req_ids.remove(target_id)
            else:
                unresolved_items.append((item_idx, item, raw_id))

        # Pass 2: Positional matching ONLY for items where ID was completely omitted
        if unresolved_items and len(response_items) == len(requested_ids):
            for item_idx, item, raw_id in list(unresolved_items):
                # Only apply positional fallback if raw_id was empty/unspecified
                if not raw_id:
                    fallback_req_id = requested_ids[item_idx]
                    if fallback_req_id in unmapped_req_ids:
                        t_text = str(item.get("translated_text", "")).strip()
                        if not t_text:
                            raise DubStudioError("VALIDATION_ERROR", f"Empty translated_text for segment ID: {fallback_req_id}")
                        resolved_lookup[fallback_req_id] = item
                        seen_target_ids.add(fallback_req_id)
                        unmapped_req_ids.remove(fallback_req_id)
                        unresolved_items.remove((item_idx, item, raw_id))

        # If any item could not be mapped to any requested ID
        if unresolved_items:
            _, _, err_raw_id = unresolved_items[0]
            raise DubStudioError("VALIDATION_ERROR", f"Unexpected segment ID in provider response: {err_raw_id}")

        # Check for missing IDs
        if unmapped_req_ids:
            raise DubStudioError(
                "VALIDATION_ERROR",
                f"Provider omitted {len(unmapped_req_ids)} segment(s) from response: {list(unmapped_req_ids)[:5]}"
            )

        return resolved_lookup


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
