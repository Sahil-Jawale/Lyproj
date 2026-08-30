# Day 1 — Working Pipeline: Work Split

**Goal:** an end-to-end working pipeline by end of day.
**Team:** 3 people, 3 parallel tracks.
**Reference:** [`ARCHITECTURE_V2.md`](./ARCHITECTURE_V2.md) — the *what* and *why*. This
doc is only the *who* and *when*.

---

## Contents

| § | Section |
|---|---|
| **1** | [Definition of done](#1-definition-of-done) |
| **2** | [The unblock: contracts first](#2-the-unblock-contracts-first) |
| **3** | [Track A — The Reader](#3-track-a--the-reader) |
| **4** | [Track B — The Knowledge Layer](#4-track-b--the-knowledge-layer) |
| **5** | [Track C — The Product](#5-track-c--the-product) |
| **6** | [Timeline and checkpoints](#6-timeline-and-checkpoints) |
| **7** | [Out of scope today](#7-out-of-scope-today) |
| **7b** | [Two things the spike already proved](#7b-two-things-the-spike-already-proved) |
| **8** | [Risks and what to cut if behind](#8-risks-and-what-to-cut-if-behind) |
| **9** | [What today is *not*](#9-what-today-is-not) |

---

## 1. Definition of done

One person uploads a real prescription photo through the web app and gets back:

- the medicines that are actually on the page, with confidence per medicine
- an honest **"could not read"** for anything illegible — not a guessed name
- drug interactions from the real 180-pair table, with mechanism and citation
- a doctor review screen where a wrong reading can be corrected
- the correction **persisted**, not lost on restart

If all six hold on three different real photos, the day succeeded.

---

## 2. The unblock: contracts first

**All three people, together, first 30 minutes. Nobody starts their track until this is
committed and pushed.**

Three tracks that share data will deadlock on each other unless the shapes are fixed up
front. So: write the shared types once, agree them out loud, commit, then split.

**Create `ml_pipeline/schemas.py`** — the single source of truth for every boundary:

```python
from pydantic import BaseModel, Field
from typing import List, Optional, Literal
from enum import Enum

# ── S1 output ────────────────────────────────────────────────────────
class MedicineLine(BaseModel):
    line_index: int
    raw_text: str
    drug_token: Optional[str] = None
    alternatives: List[str] = []
    dosage: Optional[str] = None
    frequency: Optional[str] = None
    duration: Optional[str] = None
    instructions: Optional[str] = None
    confidence: float = Field(ge=0, le=1)
    legible: bool
    bbox: Optional[List[float]] = None

class PageRead(BaseModel):
    document_type: Literal["prescription", "not_a_prescription", "illegible"]
    patient_name: Optional[str] = None
    prescriber_name: Optional[str] = None
    date: Optional[str] = None
    medicines: List[MedicineLine] = []
    unreadable_regions: List[str] = []
    overall_legibility: float = Field(ge=0, le=1)

# ── S2 output ────────────────────────────────────────────────────────
class Outcome(str, Enum):
    CONFIRMED = "confirmed"    # high confidence, clean vocabulary match
    PROBABLE  = "probable"     # accepted, flagged for attention
    AMBIGUOUS = "ambiguous"    # narrowed to N candidates, needs a human choice
    ILLEGIBLE = "illegible"    # could not read — region reported, no name emitted

class ResolvedMedicine(BaseModel):
    brand: Optional[str] = None          # canonical BD brand, None if ILLEGIBLE
    generic: Optional[str] = None        # filled by Track B
    candidates: List[str] = []           # populated when AMBIGUOUS
    dosage: Optional[str] = None
    frequency: Optional[str] = None
    duration: Optional[str] = None
    instructions: Optional[str] = None
    outcome: Outcome
    confidence: float = Field(ge=0, le=1)
    raw_reading: str                     # what the VLM actually saw — always kept
    bbox: Optional[List[float]] = None

# ── S4 output ────────────────────────────────────────────────────────
class Interaction(BaseModel):
    drug_a: str
    drug_b: str
    severity: str                        # none|minor|moderate|severe|contraindicated
    severity_color: str
    mechanism: str = ""
    effect: str = ""
    safer_alternative: str = ""
    reference: str = ""

class InteractionResult(BaseModel):
    interactions: List[Interaction] = []
    total_count: int = 0
    overall_risk: str = "none"
    medicines_checked: List[str] = []
    skipped: List[str] = []              # AMBIGUOUS/ILLEGIBLE — never silently checked
```

**Two rules that come out of this file and are not negotiable:**

1. `raw_reading` is **always** preserved, even when a vocabulary match overwrites the
   name. Losing what the model actually saw makes every later bug unfixable.
2. `InteractionResult.skipped` exists because an `AMBIGUOUS` or `ILLEGIBLE` medicine must
   **never** silently participate in a safety check. Skipping must be visible.

Commit as `feat: shared pipeline schemas` and push before anyone writes track code.

---

## 3. Track A — The Reader

> **Owner: ______**  · S0 + S1 + S2 · **critical path — give this to whoever is
> strongest, and make sure they have the API key working before anything else**

### Files

```
ml_pipeline/ingest/normalise.py       new
ml_pipeline/vlm/__init__.py           new
ml_pipeline/vlm/page_reader.py        new  — PageReader Protocol, Claude + Mock impls
ml_pipeline/vlm/prompts.py            new  — the system prompt, versioned
ml_pipeline/vlm/vocab.py              new  — S2 vocabulary constraint
```

### Tasks in order

**A0. Get the API key working (first 15 min — this blocks everything).**

```bash
pip install anthropic pydantic
export ANTHROPIC_API_KEY=sk-ant-...
python3 -c "import anthropic; print(anthropic.Anthropic().messages.create(
    model='claude-opus-5', max_tokens=64,
    messages=[{'role':'user','content':'reply OK'}]).content[0].text)"
```

If this does not print `OK`, stop and fix it. Everything downstream depends on it.

**A1. Ship `MockPageReader` in the first hour.** Returns a hardcoded realistic
`PageRead`. This is what unblocks Track C for the whole day — they build the entire
product against the mock and swap it out at integration. Do this *before* the real
reader.

```python
class MockPageReader:
    def read(self, image) -> PageRead:
        return PageRead(
            document_type="prescription",
            patient_name="Rahim Uddin",
            medicines=[
                MedicineLine(line_index=0, raw_text="Sergel 20mg 1-0-1",
                             drug_token="Sergel", dosage="20mg", frequency="1-0-1",
                             confidence=0.94, legible=True),
                MedicineLine(line_index=1, raw_text="Napa 500mg TDS",
                             drug_token="Napa", dosage="500mg", frequency="TDS",
                             confidence=0.88, legible=True),
                MedicineLine(line_index=2, raw_text="???", drug_token=None,
                             alternatives=["Monas", "Montair"],
                             confidence=0.31, legible=False),
            ],
            overall_legibility=0.71,
        )
```

Note the third entry — **an illegible line is in the mock on purpose.** Track C must
build the abstention UI from the start, not bolt it on later.

**A2. `normalise.py`** — EXIF rotation, RGB convert, downscale longest edge to 1568px.
**Do not binarise, threshold, or morph.** Ignore everything in `ml_pipeline/preprocessing/`;
that stack was built for TrOCR and destroys VLM input quality.

**A3. `prompts.py`** — the system prompt. Six requirements from `ARCHITECTURE_V2.md` §5/S1:
verbatim transcription, no invented names, calibrated confidence, populate `alternatives`
below 0.85, same-line dosage binding, never report what is not written. Put a
`PROMPT_VERSION = "v1"` constant at the top.

**A4. `ClaudePageReader`** — the real one. `client.messages.parse(...)` with
`output_format=PageRead`, `model="claude-opus-5"`, `thinking={"type": "adaptive"}`,
**`output_config={"effort": "medium"}`**, and `cache_control: {"type": "ephemeral"}` on the
system block. Full code in `ARCHITECTURE_V2.md` §6.4.

Two things to add in the same file, both cheap and both load-bearing:

- **Response cache**, keyed on `(image_sha256, prompt_version, model, effort)`. Track B
  and C will re-run the pipeline dozens of times today against an unchanged VLM output;
  those runs must cost $0. This is the difference between a $25 testing phase and a $7 one
  (§14.2).
- **`record_usage(model, response.usage)`** after every call — it feeds the spend guard
  and confirms caching is live (`cache_read_input_tokens` should be non-zero on call 2+).

**A5. `vocab.py`** — S2. RapidFuzz against the brand vocabulary, emitting
`ResolvedMedicine` with the right `Outcome`.

> ⚠ **Vocabulary caveat.** `data/rxhandbd/rxhandbd_labels.txt` is a **Bangladeshi** brand
> list; the eval images are **Indian** (Oflazest-OZ, Azenac-MR, Zofer, Crocin DS,
> Meftal-P, Ephedrex). Use it today so the code path works end-to-end, but expect poor
> match rates and **do not tune thresholds against it** — swapping in an Indian brand list
> is P4 (`ARCHITECTURE_V2.md` §11.1). Load the vocabulary from a single constant so the
> swap is one line.

| Condition | Outcome |
|---|---|
| VLM conf < 0.60, or `legible == False` | `ILLEGIBLE` |
| fuzzy top1 < 82 | `ILLEGIBLE` |
| top1 ≥ 88 and (top1 − top2) ≥ 6 | `CONFIRMED` |
| top1 ≥ 88 but top2 within 6 | `AMBIGUOUS` + `candidates` |
| otherwise | `PROBABLE` |

Thresholds go in a module-level dict, not inline — they get tuned later.

**Skip the VLM tiebreak call today.** `AMBIGUOUS` goes to the human; that is what the
review screen is for.

### Done when

```bash
python -m ml_pipeline.vlm.page_reader some_prescription.jpg
```

prints a valid `PageRead`, and the same image through `vocab.py` yields
`List[ResolvedMedicine]` with at least one `CONFIRMED` and correct handling of anything
unreadable.

---

## 4. Track B — The Knowledge Layer

> **Owner: ______**  · S3 + S4 · **fully independent — pure functions, no dependency on
> Track A or C all day**

### Files

```
ml_pipeline/normalise/__init__.py           new
ml_pipeline/normalise/brand_generic.py      new
ml_pipeline/data/brand_generic_map.csv      new
ml_pipeline/drug_interaction/build_knowledge_graph.py   fix
ml_pipeline/drug_interaction/interaction_inference.py   update
```

### Tasks in order

**B1. Fix the DDI loader (highest value per minute in the whole project).**

`_load_from_csv` globs for `*.csv` in `data/ddi_dataset/`. The file is
`DDI Database.json`. The glob finds nothing, so it silently falls back to
`INTERACTION_DATA` — **6 hardcoded edges**, while the README advertises "200+".

Write `_load_from_json`: walk `drug_interactions.{major,moderate,minor}`, map to the
existing `Severity` enum, and carry `mechanism`, `effect`, `Safer_alternative`,
`rationale`, `reference` onto each edge. Target: **180 edges loaded.** Print the count on
startup so a silent fallback can never happen again.

**B2. Seed the brand→generic map — the 78 free pairs.**

`data/ocr_dataset/.../Training/training_labels.csv` already has
`MEDICINE_NAME → GENERIC_NAME` for 78 brands. No code reads it today. Extract to
`brand_generic_map.csv`:

```
brand,generic,source,verified
Sergel,Esomeprazole,bd_dataset,true
Napa,Paracetamol,bd_dataset,true
```

**B3. Salt-form and route normalisation — measured to more than double the join.**

```
BD generics:   "Cetirizine Hydrochloride", "Ketoconazole (Tablet)"
DDI table:     "Cetirizine", "Ketoconazole"

raw overlap        : 3
after normalisation: 7
```

Strip parenthetical route qualifiers and trailing salt words
(`Hydrochloride`, `Sodium`, `Dihydrate`, `Maleate`, `Besylate`, ...). Apply to **both**
sides of the join, never to the display name.

**B4. Hardcode the synonyms that string normalisation cannot fix.**

`Paracetamol` == `Acetaminophen`. Same drug, zero string similarity. A small
`SYNONYMS` dict is correct for today; RxNorm comes later.

**B5. The safety gate — enforced in code, not by convention.**

```python
def to_generic(brand: str) -> Optional[str]:
    row = MAP.get(brand.lower())
    if row is None or not row.verified:
        return None          # unverified never reaches the DDI layer
    return row.generic
```

**B6. Update `InteractionChecker.check()`** to take `List[ResolvedMedicine]`, run only on
`CONFIRMED` + `PROBABLE`, and put everything else in `skipped`.

### Done when

```python
# Napa/Ace are BD fixture brands - fine for today, they exercise the join
check([ResolvedMedicine(brand="Napa", outcome=CONFIRMED, ...),
       ResolvedMedicine(brand="Ace",  outcome=CONFIRMED, ...)])
```

returns a real interaction with mechanism and citation, sourced from the JSON — and
startup logs `Loaded 180 interactions`.

**Stretch if ahead:** expand class-level DDI rows (`"ACE Inhibitors (e.g., Lisinopril)"`)
to member drugs.

> ⚠ **Do not try to grow the brand→generic map today.** The 78 BD pairs are a **fixture
> that exercises the code path** — they are Bangladeshi brands and will not appear on the
> Indian prescriptions we actually target. Building the real Indian map (CDSCO / NLEM /
> MIMS India) is P4, needs source verification, and is a week of work with a human
> sign-off gate. Today's job is that `to_generic()` works and refuses unverified rows.

---

## 5. Track C — The Product

> **Owner: ______**  · backend + frontend · **builds against `MockPageReader` all day;
> swaps to the real reader at integration**

### Files

```
backend/main.py                          rewrite the pipeline path
backend/config/database.py               wire it up — currently unused
web_app/src/pages/ResultsPage.jsx        confidence + abstention display
web_app/src/pages/ReviewPage.jsx         new — doctor verification
web_app/src/services/api.js              new endpoints
```

### Tasks in order

**C1. Cleanup first (20 minutes, clears the ground).**

- Delete `ml_pipeline/ocr/ensemble.py` — imports `OCRResult`, which does not exist;
  it raises `ImportError` on import today.
- Delete `ml_pipeline/ocr/tesseract_inference.py` and its import in `main.py`
  (imported, never instantiated).
- Remove the unused `MODEL_DIR` in `main.py`.
- **Fix the port.** `main.py` runs on **8002**; the frontend, `.env.example`, README and
  `docker-compose.yml` all say **8000**. Make it 8000.

**C2. Rewire the pipeline path in `main.py`.**

```python
reader = MockPageReader()      # ← one line to swap at integration
page   = reader.read(img)
meds   = resolve_vocabulary(page)          # Track A
meds   = attach_generics(meds)             # Track B
inter  = interaction_checker.check(meds)   # Track B
```

Delete the call to `ocr_engine.predict_prescription` and the double fuzzy-match through
`post_processor.process_ocr_output`.

**C3. SQLite persistence.** Use the schema below — five of its fields are trivial now and
**unrecoverable later** (`ARCHITECTURE_V2.md` §16.3): the **raw** model response (not just
the parsed one), `prompt_version` / `model` / `effort`, the `confidence` + `alternatives`,
the full before *and* after (never a diff), and a correction taxonomy
(`misread` / `hallucinated` / `missed` / `wrong_field`) as one dropdown in the review UI.
This is required for clinical audit regardless — it is not scaffolding for a later feature.
 `prescriptions_db` is an in-memory list today, so everything
dies on restart — including corrections, which are the most valuable output of the day.
`config/database.py` exists and is unused. Three tables:

```
prescriptions   id, image_path, created_at, model_version, prompt_version,
                page_read_json, resolved_json
corrections     id, prescription_id, medicine_index, field,
                predicted_value, corrected_value, corrected_by, corrected_at
interactions    id, prescription_id, result_json
```

Store the **full before and after**, not just the diff. The model's wrong answer is as
informative as the right one, and reconstructing it later from a diff is guesswork.

**C4. Results screen — show the truth.**

- `CONFIRMED` → normal
- `PROBABLE` → amber, "please verify"
- `AMBIGUOUS` → **pick-one-of-N buttons**, never a free-text box. A click gets made; typing
  does not.
- `ILLEGIBLE` → "could not read this line" with the region, and **no medicine name**

Never render a medicine name the pipeline did not actually resolve. There is no
`"Unrecognized"` row any more.

**C5. Review screen.** Each medicine with its fields, confidence, and — if `bbox` is
present — the cropped image region beside it. Reviewing against pixels is a glance;
reviewing against memory is a rubber-stamp. `POST /api/prescriptions/{id}/corrections`
writes to the corrections table.

**C6. Show the interaction citation.** The mechanism and reference are what make the
output trustworthy to a clinician — surface them, do not hide them behind a severity dot.

### Done when

Upload → results with all four outcome states rendering correctly → correct one medicine
→ restart the server → the correction is still there.

---

## 6. Timeline and checkpoints

| When | Who | What |
|---|---|---|
| **H+0 → H+0:30** | **all three** | `schemas.py` agreed, committed, pushed. Track A verifies the API key in parallel. |
| **H+0:30 → H+1** | A | `MockPageReader` pushed — **unblocks C for the rest of the day** |
| **H+0:30 → H+3** | A / B / C | A: normalise + prompt + real reader · B: DDI loader + seed map · C: cleanup + rewire + SQLite |
| **H+3** | **all three** | **Checkpoint 1 — 10 min.** Each demos their piece standalone. Anyone blocked says so now, not at H+6. |
| **H+3 → H+6** | A / B / C | A: `vocab.py` + outcomes · B: normalisation + synonyms + `check()` · C: results + review screens |
| **H+6** | **all three** | **Integration.** C swaps `MockPageReader` → `ClaudePageReader`. Expect breakage here; this is why it is at H+6 and not H+8. |
| **H+6 → H+8** | **all three** | End-to-end on 3 real photos. Fix what breaks. |
| **H+8** | **all three** | Demo against the §1 checklist. |

**Checkpoint 1 is the one that matters.** If a track is behind at H+3 it is recoverable;
discovering it at H+6 is not.

---

## 7. Out of scope today

Explicitly not doing these — they are real work, just not today's:

- Annotating all 129 eval images (multi-day; do ~10 by hand tonight only as a smoke test)
- Threshold tuning against a dev split — today's numbers are defaults, not calibrated
- The full ~1,400-pair brand→generic map (78 seed pairs are enough for a working demo)
- The S2 VLM tiebreak call — `AMBIGUOUS` goes to the human instead
- Dual-VLM cross-check
- Model bake-off across Opus / Sonnet / Haiku — build on Opus 5, measure later
- Any TrOCR work. It is cut from the serving path (`ARCHITECTURE_V2.md` §3.3).

---

## 7b. Two things the spike already proved

Both come from `ARCHITECTURE_V2.md` §6.6 — real measurements on the eval images, not
assumptions. They change what Track A must do today:

1. **Enforce verbatim transcription, and test it.** On `VLM_CHECK/1.jpg` the page reads
   **"Dijoxin"**; Opus 5 silently "corrected" it to **"Digoxin"** with no flag, because
   the ad-hoc prompt never demanded verbatim. Requirement 1 of the S1 prompt exists for
   exactly this. **Make that image Track A's first regression test.**
2. **Budget is real: the whole testing phase is $20–30.** 100 prescriptions on Opus 5 ≈
   **$3.47**, so a full 129-image sweep is $4.48 and $30 buys only six of them. Two
   consequences for today: implement the S0 resize (A2 — 21% of the bill), and have
   Track A add a **response cache** keyed on
   `(image_sha256, prompt_version, model, effort)`. Most re-runs today will be testing
   Track B/C logic against an unchanged VLM output; those must cost $0. See
   `ARCHITECTURE_V2.md` §14.2.
3. **Opus 5 only — no second model.** Dual-VLM is deferred to Phase 2 (§3.3): while a
   doctor reviews every page, their corrections are ground truth and a second model is
   redundant.

---

## 8. Risks and what to cut if behind

| Risk | Mitigation |
|---|---|
| **API key / auth not working** | A0 is the first 15 minutes for exactly this reason. If it is not resolved by H+1, escalate — the day depends on it. |
| **Track C idle waiting on A** | `MockPageReader` at H+1, before the real reader. C never waits. |
| **VLM output does not match the schema** | `messages.parse()` with `output_format=PageRead` makes this structurally impossible — that is why we are using it. |
| **Integration explodes at H+6** | It is scheduled at H+6, not H+8, precisely to leave two hours. |
| **Scope creep** | §7 is the list. If it is not there, it is not today. |

**Cut in this order if the day is running short:**

1. Review screen polish — a plain table is fine
2. `bbox` crop display — show the whole image instead
3. Interaction citation display — keep severity only
4. **SQLite → keep in-memory.** Costs you the corrections on restart; acceptable for one
   demo, but it must land within a day or two, because corrections are the one output
   here that compounds.

**Do not cut:** the four `Outcome` states, the `verified` gate in `to_generic()`, or
`InteractionResult.skipped`. Those three are what separate this from the prototype we are
replacing — a system that guesses confidently is worse than one that says it does not
know.

---

## 9. What today is *not*

Today produces a **working pipeline**, not a validated one. Specifically, after today we
still will not know how accurate it is — that needs the annotated eval set (P0) and the
metrics in `ARCHITECTURE_V2.md` §11.2. Do not quote an accuracy number off a demo.

Also not today, and deliberately: threshold tuning (the 88 / 82 / 0.60 values are
**guesses** until P3 calibrates them), the real Indian brand→generic map (P4), dual-VLM
(Phase 2), and anything in §16. The correction log is the one piece of future-facing work
that lands today — because its fields are unrecoverable if not captured at write time.
