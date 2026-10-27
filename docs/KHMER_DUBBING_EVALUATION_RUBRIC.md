# DubStudio Pro: Native Khmer Listening Evaluation Rubric
**ក្របខ័ណ្ឌវាយតម្លៃគុណភាពបញ្ចូលសំឡេងភាសាខ្មែរ (Khmer Dubbing Quality Evaluation Rubric)**

> **Important Standard**: Automated neural speech synthesis must never be described as equivalent to human Cambodian professional voice acting without rigorous, blinded native Khmer listening evaluations. This rubric establishes an empirical 5-point evaluation framework across 9 independent dimensions for human quality directors and native speakers.

---

## 1. The 9 Independent Evaluation Dimensions

| Dimension | Focus Area | 5 - Exceptional | 3 - Acceptable | 1 - Defective |
| :--- | :--- | :--- | :--- | :--- |
| **1. Source Transcript Accuracy** | Faithful representation of source spoken audio | 100% words and timestamps match spoken dialogue | Minor omissions not affecting dialogue flow | Critical line drops, hallucinations |
| **2. Translation Fidelity** | Meaning, intent, negation, quantities | Exact semantic match; all negations & figures preserved | Meaning preserved but nuances slightly softened | Inverted negation, incorrect quantities, missing key facts |
| **3. Natural Spoken Khmer** | Authentic colloquial spoken phrasing vs. stiff literal grammar | Sounds like authentic Cambodian conversational dialogue | Comprehensible but retains noticeable translationese | Stiff, literal grammar; robotic direct dictionary lookups |
| **4. Pronouns & Register** | Contextual forms of address and social hierarchy | Appropriate honorifics matching character relationship | Respectful neutral phrasing ('លោក', 'អ្នក') | Inappropriate intimacy (`ឯង/អញ`) without relationship context |
| **5. Pronunciation & Phonetics** | Correct consonants, vowels, Coeng ligatures, numbers | Flawless Khmer articulation; currency and numbers expanded | Minor cadence hesitation; terms intelligible | Broken subscripts (ដាច់ជើងអក្សរ), raw unpronounced numbers |
| **6. Speaker Consistency** | Voice identity, tone, and character memory | Distinct vocal persona maintained consistently | Voice stable across standard dialogue turns | Voice shifts drastically between segments |
| **7. Delivery & Phrasing** | Emotional cadence, breath pauses, prosody | Punctuation pauses align with natural human breathing | Cadence adequate but slightly mechanical | Rushed delivery, breathless run-on speech |
| **8. Timing & Lip-Sync Coherence** | Audio fits dialogue window without cut-off | Dubbed audio fits dialogue window naturally (1.0x-1.08x) | Minor pause borrowing (<500ms) with no dialogue overlap | Dialogue truncated or severely rushed (>1.25x) |
| **9. Audio Mixing & Ducking** | Background audio, original audio, and ducking | Clear dialogue intelligibility; smooth sidechain ducking | Dialogue audible over background music | Dialogue drowned out or abrupt audio clipping |

---

## 2. Review Workflow Checklist for Khmer Dubbing Directors

### Step 1: Pre-Synthesis Script Audit
- [ ] **Context Verification**: Verify speaker gender, age group, and social relationships in Project Settings.
- [ ] **Pronoun Check**: Ensure forms of address match character hierarchy (e.g., lovers `បង/អូន`, peers `ឯង/យើង`, elders `លោកពូ/អ្នកមីង`, neutral `លោក/អ្នក`).
- [ ] **Negation Safeguard**: Confirm negative sentences retain Khmer negative markers (`មិន`, `អត់`, `ពុំ`, `កុំ`, `គ្មាន`).
- [ ] **Quantity & Currency**: Confirm numbers are expanded into natural Khmer words (e.g., `$50` -> `ហាសិប ដុល្លារ`, `20%` -> `ម្ភៃ ភាគរយ`).

### Step 2: Audio Synthesis & Take Audition
- [ ] **Timing Budget**: Check if the segment duration fits within the allotted dialogue gap.
- [ ] **Edge-TTS Neural Voice**: Use `km-KH-PisethNeural` for male characters and `km-KH-SreymomNeural` for female characters.
- [ ] **Review Flags**: Inspect the `Needs Review` tab for segments flagged with:
  - `timing_overrun`: Speech exceeds window plus borrowing limit.
  - `potential_negation_flip_missing`: Source negative was not mirrored in translation.
  - `quantity_check`: Discrepancy between source digits and target text.
  - `unresolved_foreign_words`: Foreign words requiring Khmer phonetic adaptation.
- [ ] **Audition Take**: Play the generated take using the audition button (`▶`).

### Step 3: Human Approval & Export
- [ ] **Single Segment Take Regeneration**: If a take requires fine-tuning, edit the spoken script or pronunciation text directly in the card and click `Regenerate` (`↺`).
- [ ] **Approval Status**: Toggle segment approval (`✔`). Approved segments will never be overwritten by automatic batch operations.
- [ ] **Subtitle Alignment**: Verify that subtitle overlay lines match spoken dialogue and render with proper Khmer subscripts (Noto Sans Khmer / Kantumruy Pro).
