# PrescriptAI — Architecture v2

**Status:** Proposed — revision 3
**Supersedes:** the TrOCR-fine-tuning pipeline in `ml_pipeline/ocr/`
**Author:** Shivam Bajaj
**Date:** 2026-08-30

**Revision 2:** TrOCR cut from the serving path entirely (§3.3). Decisive VLM
recommendation + implementation guide (§6). Brand→generic sourcing corrected to
registry-first (§5.3). Human-in-the-loop and the correction flywheel promoted to a
first-class component (§8).

**Revision 3 — driven by a real spike on the eval images (§6.6):** eval set inspected and
found to be **mixed** (prescriptions + medication-free clinical notes → hard negatives).
Target scope corrected to **English-language, primarily Indian** — the BD vocabulary must
be swapped (§11.1). Cost model **replaced with measured numbers**: $3.47 per 100
prescriptions at `effort: "medium"` (§6.5).

**Revision 4 — scoped to a $20–30 testing budget:** **Opus 5 alone**; dual-VLM validated
but **deferred to the Phase 1 → Phase 2 boundary** (§3.3) because the reviewing doctor is
a better verifier than a second model. Testing-phase budget, the response cache, and the
continuous-improvement roadmap added (§14, §16).

---

## Contents

| § | Section | What it covers |
|---|---|---|
| **1** | [TL;DR](#1-tldr) | The reframing in one page — read this if nothing else |
| **2** | [Why we are rearchitecting](#2-why-we-are-rearchitecting) | Data inventory, the word-crop/whole-page mismatch, why fine-tuning stalled |
| **3** | [Rejected approaches](#3-rejected-approaches) | Embedding-passing (3.1), n-best transport (3.2), **TrOCR as second reader (3.3)** |
| **4** | [Target architecture](#4-target-architecture) | The full pipeline diagram, S0 → S5 |
| **5** | [Stage specifications](#5-stage-specifications) | Per-stage contracts, schemas, thresholds — see stage index below |
| **6** | [**VLM selection and implementation**](#6-vlm-selection-and-implementation) | **Which model to use, why, why not the others, and how to wire it** |
| **7** | [What happens to the existing code](#7-what-happens-to-the-existing-code) | File-by-file: keep / fix / park / delete |
| **8** | [Human-in-the-loop and the correction flywheel](#8-human-in-the-loop-and-the-correction-flywheel) | Doctor verification, and how corrections become the training corpus |
| **9** | [The drug-interaction layer](#9-the-drug-interaction-layer) | Three live bugs, the fix, and why no BioBERT |
| **10** | [Privacy and deployment](#10-privacy-and-deployment) | Hosted vs. self-hosted — blocking decision |
| **11** | [Evaluation protocol](#11-evaluation-protocol) | The 129 images, metrics, the bake-off |
| **12** | [Migration plan](#12-migration-plan) | P00 → P6 with gates |
| **13** | [Open questions](#13-open-questions) | 8 resolved, 4 still open |
| **14** | [Testing-phase budget & cost control](#14-testing-phase-budget-and-cost-control) | **$24.58 testing plan and the response cache that funds it** |
| **15** | [What this changes about the contribution](#15-what-this-changes-about-the-projects-contribution) | The defensible framing |
| **16** | [**Continuous improvement — roadmap & pick-up point**](#16-continuous-improvement--roadmap-and-pick-up-point) | **Flowchart of what is built / not built / deliberately skipped. Start here when you return.** |

**Stage index** (all under [§5](#5-stage-specifications)):

| Stage | Name | Key decision |
|---|---|---|
| **S0** | Ingest & normalise | Never binarise — it destroys VLM input quality |
| **S1** | VLM page read | Vocabulary is *not* in the prompt; read free-form, constrain after |
| **S2** | Vocabulary constraint | RapidFuzz + tiebreak; abstain below threshold |
| **S3** | Brand → generic | Registry-first sourcing; unverified pairs blocked in code |
| **S4** | DDI lookup | Deterministic and cited — no learned classifier |
| **S5** | Doctor verification | Mandatory today; corrections logged as training data |

**§6 at a glance** — [the decision](#61-the-decision): build against **Claude Opus 5**
(`claude-opus-5`), ship on **Claude Sonnet 5** (`claude-sonnet-5`) if the eval holds;
**Qwen2.5-VL 7B** self-hosted if health data cannot leave the network. Subsections:
6.1 decision · 6.2 candidates · 6.3 why not the alternatives · 6.4 **how (setup + code)**
· 6.5 **cost — $3.47 per 100 prescriptions, measured** · 6.6 **spike results on the real
eval images**.

> **Evidence status.** §6.6 records a spike run on the first 5 of the 129 eval images.
> Neither Opus 5 nor Gemini hallucinated; Opus 5 read every clinical ambiguity correctly
> where Gemini misread a paediatric dose; and Opus 5's unprompted uncertainty flagging was
> well calibrated. Three amendments followed: the **BD vocabulary must be swapped for an
> Indian one** (§11.1); **`1.jpg` becomes the verbatim regression test** (§6.6); and
> **dual-VLM is deferred to Phase 2** (§3.3) — while a doctor reviews every page, their
> corrections are ground truth and a second model is redundant.

---

## 1. TL;DR

We are replacing "fine-tune TrOCR on 4.6K word crops and hope it generalises" with a
**VLM-primary, abstention-aware, human-verified extraction pipeline**.

The core reframing:

> The bottleneck was never model capacity. It was that we have **word crops** and we
> are shipping a **whole-page product**. A VLM reads the whole page, which is the only
> input format we actually have at inference time — and it needs no training data.

**TrOCR is removed from the serving path.** The measured baseline in commit `7797044`
is 6% raw / 14% post-fuzzy on RxHandBD. A second reader that is right 6% of the time
carries almost no information — you would overrule it on every disagreement. See §3.3.

Four things this buys us:

1. **Deletes ~200 lines of untested layout heuristics** (header skip, projection-profile
   line splitting, connected-component word detection) that have zero ground truth,
   plus the entire TrOCR serving path and its preprocessing stack.
2. **Makes "I don't know" a first-class output.** In a medical system, abstention is a
   correct answer. Today the pipeline emits a fake `"Unrecognized"` medicine entry.
3. **Unblocks the drug-interaction feature**, disconnected at three separate points (§9).
4. **Turns doctor verification into a training-data flywheel** (§8.3) — which is the
   real answer to "we don't have a dataset".

---

## 2. Why we are rearchitecting

### 2.1 The data reality

| Asset | State | Usable for |
|---|---|---|
| BD Prescription dataset | 4,680 word-crop PNGs, 78 brand classes × 60 | Word-level recognition only |
| RxHandBD | Labels present, images re-downloadable; **judged low value** | Deprioritised |
| DDI Database.json | 180 pairs, 210 generic drugs, mechanism + citations | Interaction lookup (currently unwired) |
| Kaggle images | **129 full-page images — inspected (§6.6)**; mixed: real prescriptions **+** medication-free clinical notes | **Held-out eval set** — prescriptions as positives, notes as **hard negatives** |
| BD brand vocabulary (1,440) | Present, but **wrong region** — target is English/Indian | Must be swapped for an Indian brand list (§11.1) |
| Full-page *training* data | None today; **generated continuously from §8.3** | Future fine-tuning / distillation |

### 2.2 The structural mismatch

The current `predict_prescription()` assumes a full prescription photo and runs:

```
photo → binarise → skip top 20% → projection-profile line split
      → connected-component word boxes → TrOCR per word crop
```

But **100% of our labelled data is pre-cropped words.** Stages 1–4 have no training
data, no eval data, and no ground truth. `evaluate_rxhandbd.py` only measures stage 5,
on words that were cropped for us. **Any CER we report is silent about end-to-end
accuracy on a real photo.** We cannot currently measure the thing we ship.

### 2.3 Why more fine-tuning would not have fixed it

- **Frozen encoder, trained decoder.** The domain shift is *visual* (BD handwriting, thin
  ballpoint strokes, binarised input) and lives in the encoder. Training only the decoder
  teaches a character prior over 1,440 brand names — which RapidFuzz already provides for
  free, deterministically and auditably. Most likely cause of the 0.40 CER plateau and
  oscillation recorded in the script header.
- **Train/inference domain mismatch.** Training feeds raw resized crops; inference and
  `evaluate_rxhandbd.py` feed binarised, dilated, eroded images. Two different domains.
- **4.6K samples, 1,440 classes.** ~3 examples per name.

### 2.4 BioBERT does not exist

`grep` finds BioBERT in exactly two places: a README roadmap checkbox and a marketing
line in `web_app/src/pages/HomePage.jsx:75`. No model, no training script, no inference
path. **We do not build it** (§9.3); the homepage claim should be removed, not backfilled.

---

## 3. Rejected approaches

### 3.1 TrOCR encoder → LLM decoder (embedding passing)

The idea: run TrOCR's vision encoder, feed the **embeddings** to an LLM decoder.

**This does not work with an API LLM, and it inverts our constraint.**

- Claude, GPT and Gemini accept **tokens and images**, not arbitrary vision-encoder
  hidden states. There is no API surface for it.
- Building it needs: an **open-weights** LLM you host, a trained projection adapter from
  TrOCR's 1024-d encoder output into the LLM embedding space, and **100K+ aligned pairs**
  to train that adapter (the LLaVA / BLIP-2 recipe).
- That is **strictly more data than fine-tuning TrOCR**, plus multi-GPU budget.

### 3.2 The salvageable version (also rejected, see 3.3)

The instinct — *TrOCR supplies visual evidence, the LLM supplies priors* — was sound, and
the transport problem is solvable without training: pass **n-best hypotheses + logprobs**
as text rather than embeddings.

```python
outputs = model.generate(pixel_values, num_beams=5, num_return_sequences=5,
                         output_scores=True, return_dict_in_generate=True)
# → [("Sergel", -0.21), ("Sengel", -1.84), ("Serget", -2.10), ...]
```

This preserves the distributional information the embeddings would have carried and needs
zero training. It is mechanically fine. It is rejected for a different reason:

### 3.3 TrOCR as a second reader — rejected on measured evidence

Commit `7797044` records the TrOCR-large-handwritten baseline on RxHandBD:

> **raw 6%, post-fuzzy 14%**

A witness that is right 6% of the time is not worth consulting. On every VLM/TrOCR
disagreement the correct action is to overrule TrOCR, which means the signal changes no
decision. In exchange it costs a preprocessing stack, per-crop latency, bbox-accuracy
risk, and a second model to maintain.

**Decision: TrOCR is removed from the serving path.** `_infer_line` is retained only as a
research-time component benchmark, not as a pipeline stage.

**If we want a second reader** — and there is a real argument for one — the right one is
**a second VLM**, not TrOCR:

```
Opus 5 reads the page   ─┐
                         ├─► agree → high confidence
Sonnet 5 reads the page ─┘   disagree → route to human (§8)
```

Both readers are competent, so disagreement is genuinely informative.

**Validated by the spike (§6.6), but deferred to Phase 2.** In the spike *every* material
error surfaced as an Opus/Gemini disagreement — including a paediatric dose misread
(3.5 ml vs 5 ml) that would otherwise have shipped silently. Marginal cost is **$1.39 per
100 prescriptions** (§6.5).

**Not enabled during the pilot — and cost is not the reason.** In Phase 1 (§8.1) **the
doctor is the verifier**. A human reviewing every page is more reliable than a second
model, and a correction is **ground truth**, whereas model disagreement is only *"one of
these two is possibly wrong"*. Running Sonnet alongside buys a weaker version of a signal
we are already collecting for free — and collecting deliberately (§8.3).

**Enable it at the Phase 1 → Phase 2 boundary**, when patients scan unsupervised and the
human leaves the loop. That is the moment the free ground-truth signal disappears and a
second reader stops being redundant. Until then: **Opus 5 alone.**

#### Why the verifier is Sonnet 5 and not a cheap or free model

The tempting optimisation is a cheap verifier behind an expensive primary. **Rejected —
the saving is nil and it misses the error class that matters.**

| Architecture | $/100 | Catches |
|---|---|---|
| Opus 5 alone | $3.47 | baseline |
| Opus 5 + Haiku 4.5 narrow grounding | $3.64 | hallucination only |
| Opus 5 + Haiku 4.5 full second read | $4.17 | hallucination; noise on the rest |
| **Opus 5 + Sonnet 5 full second read** | **$4.86** | hallucination **+ subtle clinical misreads** |

Maximum saving from going cheap: **$1.22 per 100 prescriptions (~₹1).**

The reasoning, which matters more than the price:

- **Verification genuinely is easier than generation** — a weak model can answer *"does
  the word 'Zofer' appear on this page? yes/no/unsure"* far more reliably than it can read
  the page cold. So the instinct is sound in principle.
- **But that only catches hallucination**, which is (a) measured at zero on frontier
  models (§6.6) and (b) already caught by the doctor in Phase 1 (§8).
- **The dangerous class is subtle clinical misreads** — `3.5 ml` vs `5 ml`,
  `SOS (4 mg)` vs `SOS 4-hourly`. These are clinically plausible, do not look wrong, and
  get rubber-stamped by a reviewer. **Gemini, a frontier model, got the paediatric dose
  wrong.** A cheap model has no chance at reading a strikethrough correction.
- **A weak model doing independent full extraction produces noise, not signal.** It
  disagrees on what *it* got wrong. LLaVA-1.5-7B fabricating five drugs on a page reading
  `∅ meds` (§6.6) is what a weak verifier's disagreements look like.
- **"Free" tiers generally train on submitted data.** These pages carry real patient names
  and a practising doctor's mobile, clinic number and email. That is a PHI disclosure, not
  a cost optimisation — see §10.

**Two free verifiers already exist in the design** and should be exhausted first:
the **S2 fuzzy match** (an independent, non-model corroboration — "Zofr" matching "Zofer"
at 91 is evidence) and the **`alternatives` field** (Opus's own n-best). Layering:
free vocabulary check → the model's own uncertainty → Sonnet cross-read on what survives.

**Prompt-design warning.** Never show the verifier the primary's answer and ask "is this
correct?" — models agree with what they are shown. Verify **blind** (independent read,
compared in code) or ask a non-leading grounding question. A sycophantic verifier is worse
than none, because it manufactures false confidence.

---

## 4. Target architecture

```
                      ┌─────────────────────────────┐
   prescription  ───► │ S0  Ingest & normalise      │
   photo (JPEG)       │     EXIF rotate, resize     │
                      │     NO binarisation         │
                      └──────────────┬──────────────┘
                                     │  natural RGB image
                      ┌──────────────▼──────────────┐
                      │ S1  VLM page read           │  ◄── the reader
                      │     whole page → JSON       │
                      │     free-form, no vocab     │
                      │     per-field confidence    │
                      └──────────────┬──────────────┘
                                     │  raw readings + confidences + alternatives
                      ┌──────────────▼──────────────┐
                      │ S2  Vocabulary constraint   │
                      │     RapidFuzz vs brand list │
                      │     + VLM tiebreak if close │
                      │     below threshold→ABSTAIN │
                      └──────────────┬──────────────┘
                                     │  canonical brand name
                      ┌──────────────▼──────────────┐
                      │ S3  Brand → generic         │  ◄── THE MISSING LINK
                      │     "Crocin DS" → Paracetamol│
                      │     + salt/synonym normalise│
                      └──────────────┬──────────────┘
                                     │  normalised generic names
                      ┌──────────────▼──────────────┐
                      │ S4  DDI lookup              │
                      │     deterministic table     │
                      │     180 pairs + citations   │
                      └──────────────┬──────────────┘
                                     │
                      ┌──────────────▼──────────────┐
                      │ S5  Doctor verification     │  ◄── mandatory today
                      │     corrections logged  ────┼──► training corpus (§8.3)
                      └─────────────────────────────┘
```

---

## 5. Stage specifications

### S0 — Ingest & normalise

| | |
|---|---|
| **In** | User-uploaded JPEG/PNG, arbitrary orientation and size |
| **Out** | RGB PIL image, EXIF-corrected, longest edge ≤ 1568px |
| **Code** | New: `ml_pipeline/ingest/normalise.py` |

**Critical rule: do not binarise, do not threshold, do not morph.**

`preprocess_for_trocr()` applies adaptive Gaussian thresholding plus dilate/erode. That
was built for TrOCR and it **actively destroys VLM input quality** — VLMs are trained on
natural photographs and use stroke gradient, ink density and colour to disambiguate
overlapping characters. A 1-bit image throws all of that away.

Keep only: EXIF rotation, downscale, light auto-contrast if severely underexposed.
With TrOCR cut, the binarising path has **no remaining consumer** and should be deleted
along with it.

> Resolution note: Claude bills images at roughly `(width × height) / 750` tokens. A full
> 1568×1568 square is ~3.3K tokens, but the **measured mean across the real eval images is
> 1,018 tokens** after this resize (§6.5) — most prescription photos are not square. Below
> ~1000px on the long edge handwriting legibility starts to suffer. Tune on the dev split
> (§11) — it is a real accuracy/cost dial, worth 21% of the bill.

### S1 — VLM page read

| | |
|---|---|
| **In** | Normalised RGB image |
| **Out** | `PageRead` JSON, schema-guaranteed |
| **Code** | New: `ml_pipeline/vlm/page_reader.py` |

The VLM reads the **entire page at once**. This replaces header-skip, line-splitting and
word-detection — doing implicitly, with full-page context, what those heuristics did
explicitly and blindly.

**Design decision: the brand vocabulary is NOT in the prompt.**

Counter-intuitive but important. Show a model a thousand-plus valid medicine names and ask
it to read a smudge, and it will confidently return one — including for words that are not
medicines at all. Priming the output space *increases* hallucination. **Read free-form
first, constrain afterwards** (S2). It is also cheaper.

**Output schema** (enforced via `output_config.format` / `client.messages.parse()`):

```python
from pydantic import BaseModel, Field
from typing import List, Optional, Literal

class MedicineLine(BaseModel):
    line_index: int
    raw_text: str                      # verbatim, exactly as written on the page
    drug_token: Optional[str]          # substring believed to be the drug name
    alternatives: List[str] = []       # other readings seriously considered
    dosage: Optional[str]              # "500mg", "10ml"
    frequency: Optional[str]           # "1-0-1", "BD", "TDS"
    duration: Optional[str]            # "7 days"
    instructions: Optional[str]        # "after meal"
    confidence: float = Field(ge=0, le=1)
    legible: bool
    bbox: Optional[List[float]]        # [x0,y0,x1,y1] normalised — drives the review UI

class PageRead(BaseModel):
    document_type: Literal["prescription", "not_a_prescription", "illegible"]
    patient_name: Optional[str]
    prescriber_name: Optional[str]
    date: Optional[str]
    medicines: List[MedicineLine]
    unreadable_regions: List[str] = []
    overall_legibility: float = Field(ge=0, le=1)
```

- **`alternatives`** is the uncertainty channel — the VLM's own n-best list. It is what
  makes S2's tiebreak and the ambiguity UI possible.
- **`bbox`** now serves the **doctor review screen** (§8.2), highlighting the region on
  the image beside each extracted medicine so verification is a glance rather than a
  re-read. It no longer drives any crop, so approximate boxes are acceptable.

**System prompt requirements** (the prompt *is* the model now — version it, test it):

1. Transcribe **verbatim**. Do not correct spelling, expand abbreviations, or normalise
   casing. Correction happens downstream where it is auditable.
2. If a token is unreadable, set `legible: false` and put best guesses in `alternatives`
   — **never invent a plausible medicine name to fill the slot.**
3. Confidence must be calibrated: 0.9+ only when the handwriting is genuinely clear.
4. Populate `alternatives` whenever the top reading is below ~0.85.
5. Dosage/frequency/duration belong to the medicine **on the same line**. Never carry
   values across lines.
6. Do not report a medicine that is not visibly written on the page.

Freeze this prompt and cache it (`cache_control: ephemeral`) — it is a stable prefix on
every request, billed once per cache window rather than per prescription.

### S2 — Vocabulary constraint

| | |
|---|---|
| **In** | `MedicineLine` readings + `alternatives` |
| **Out** | Canonical brand name, or abstention |
| **Code** | Consolidate the existing RapidFuzz logic (currently duplicated) |

1. `rapidfuzz.process.extract(reading, BRAND_VOCAB, limit=5)` — load the vocabulary from
   **one module-level constant** so the BD → Indian swap (P4, §11.1) is a one-line change.
2. `top1 >= 88` and `top1 - top2 >= 6` → **accept** `top1`.
3. `top1 >= 88` but `top2` within 6 → **ambiguous**, go to 4.
4. **VLM tiebreak (second call, only when needed):** send the page region plus the 3–5
   candidate names and ask which the handwriting matches. *This is the only place the
   vocabulary enters a prompt* — scoped to a handful of candidates on one line, where it
   disambiguates instead of priming.
5. `top1 < 82` → **abstain.** Emit no medicine; report the region.
6. VLM `confidence < 0.60` → **abstain** regardless of fuzzy score. A confident fuzzy
   match on an unconfident reading is a false match, not a save.

Every threshold is **tuned on the dev split (§11)** and ships as config, not constants.

Also fix here: `predict_prescription` fuzzy-matches in `_extract_medicines_from_words`,
then `PostProcessor.process_ocr_output` fuzzy-matches the *already-matched* name again.
Collapse to one pass.

### S3 — Brand → generic normalisation

| | |
|---|---|
| **In** | Canonical brand name |
| **Out** | Normalised generic (INN) name |
| **Code** | New: `ml_pipeline/normalise/` + `data/brand_generic_map.csv` |

**The single highest-value missing piece — and a dataset we can actually build, because
it is text, not images.**

Today the OCR vocabulary is 1,440 **BD brand names** (wrong region — being swapped for an
Indian list, §11.1); the DDI graph is keyed on 210 **international generics**. Whichever
brand list we use, without this layer the interaction checker cannot fire on a real
prescription **even with perfect OCR**.

#### 5.3.1 Two distinct joins, both needed

**Join A — brand → generic.** `"Crocin DS"` → `"Paracetamol"`, `"Zofer"` → `"Ondansetron"`
(both observed in the eval images, §6.6).

**Join B — generic → generic.** Less obvious. Measured on the BD dataset, but the
phenomenon is universal — Indian generic listings carry the same salt forms and route
qualifiers:

```
BD generics carry salt forms and route qualifiers:  "Cetirizine Hydrochloride", "Ketoconazole (Tablet)"
DDI table carries bare INN names:                   "Cetirizine", "Ketoconazole"

raw overlap        : 3
after normalisation: 7   ← more than doubles, from string normalisation alone
```

Two failure modes that string normalisation does **not** fix:

- **Synonyms.** `Paracetamol` (BD/UK) vs `Acetaminophen` (US/DDI table). Same drug, zero
  string similarity. Requires a real synonym table — **RxNorm / RxNav (free, NLM)**.
- **Class-level rows.** The DDI table contains entries like
  `"ACE Inhibitors (e.g., Lisinopril)"`. These are drug *classes*, not drugs, and will
  never match a specific generic until expanded to their members.

So S3 is three steps: brand→generic, salt/route stripping, then RxNorm synonym
resolution to a canonical concept — with class expansion applied on the DDI side.

#### 5.3.2 Sourcing — registry first, LLM as gap-fill only

**Validating the "synthetic medicine name dataset" idea — it splits into three things
with very different risk profiles:**

| Approach | Verdict |
|---|---|
| **Generate fake brand names** | ❌ **Do not.** A fabricated name maps to no real generic, so it can never reach the DDI layer; and adding it to the fuzzy vocabulary creates a false-match magnet that pulls real readings onto a nonexistent drug. Strictly negative value. |
| **LLM-recall of real brand→generic pairs** | ⚠️ **Gap-fill only, never the source.** Indian brands are long-tail and thinly represented in training data. A hallucinated pair (`Xyzal → Paracetamol`, when it is Levocetirizine) flows into the interaction checker and yields a **wrong safety verdict** — the worst failure in the system. |
| **Authoritative registries** | ✅ **The primary source.** |

Build order:

1. **Free seed — 78 pairs, but read the caveat.** The BD dataset CSVs already carry
   `MEDICINE_NAME → GENERIC_NAME`, unread by any code today. **These are Bangladeshi
   brands (Napa, Sergel, Beklo) and will not appear on Indian prescriptions** — so this is
   a **test fixture that exercises the code path**, not the production map. Do not mistake
   it for a head start on coverage.
2. **Registry bulk — the real source, and it must be Indian.** **CDSCO** (Central Drugs
   Standard Control Organisation) publishes approved-drug listings; **the National List of
   Essential Medicines (NLEM)** and standard Indian drug indices (MIMS India / CIMS India)
   serve as the second, independent source. ⚠️ **Unverified assertion:** I have not
   confirmed the bulk-download format or availability of any of these — that is open
   question 3 (§13) and should be checked before the P4 estimate is trusted.
3. **RxNorm / RxNav** (free NLM API) for the generic side: synonym resolution, salt-form
   normalisation, canonical concept IDs (RxCUI). This is what fixes
   Paracetamol/Acetaminophen properly instead of with string hacks.
4. **LLM gap-fill, batched, for what 1–3 miss.** Use `client.messages.batches` (50% cost,
   order-independent — key results by `custom_id`). Every generated row is written
   `source="llm", verified=false`.

**Hard safety rule, enforced in code and not by convention:**

```python
# ml_pipeline/normalise/brand_generic.py
def to_generic(brand: str) -> Optional[str]:
    row = MAP.get(brand.lower())
    if row is None or not row.verified:
        return None          # unverified never reaches the DDI layer
    return row.generic
```

A pair is `verified=true` only when **two independent sources agree**, or a human signs
off. Schema: `brand, generic, rxcui, strength, form, source, verified, verified_by,
verified_at`.

Estimated effort: ~1 week including verification. Treat it as a deliverable in its own
right — it is the tractable dataset problem in this project.

### S4 — DDI lookup

| | |
|---|---|
| **In** | Normalised generic names |
| **Out** | Pairwise interactions with severity, mechanism, alternative, citation |
| **Code** | Fix: `ml_pipeline/drug_interaction/build_knowledge_graph.py` |

**Bug to fix first:** `_load_from_csv` globs for `*.csv` in `data/ddi_dataset/`. The data
is `DDI Database.json`. The glob finds nothing and the loader silently falls back to
`INTERACTION_DATA` — **6 hardcoded edges**. The README's "200+ interaction rules" is 6
rules at runtime.

Fix: load the JSON, walk `major`/`moderate`/`minor`, map to the existing `Severity` enum,
expand class-level rows to member drugs, and carry `mechanism`, `effect`,
`Safer_alternative`, `rationale` and `reference` through to the API response. Surface the
citation in the UI — that is what makes the output trustworthy to a clinician.

---

## 6. VLM selection and implementation

### 6.1 The decision

> **Build against Claude Opus 5 (`claude-opus-5`). Ship on Claude Sonnet 5
> (`claude-sonnet-5`) if the eval shows it holds quality.**

Rationale: establish the achievable accuracy ceiling first with the strongest model, then
step down while measuring. Haiku 4.5 ships only if it earns it on the eval, never by
assumption.

**Scoped to the $20–30 testing budget (§14):** during the pilot we run **Opus 5 alone**.
The model comparison (§11.3) is a *bounded* experiment on the dev split, not a full sweep
across every candidate on all 129 images — that would consume most of the budget on its
own.

**Fallback if health data cannot leave the network (§10): Qwen2.5-VL 7B, self-hosted.**

### 6.2 Candidates

| Model | ID | Context | $/1M in | $/1M out | Role |
|---|---|---|---|---|---|
| Claude Opus 5 | `claude-opus-5` | 1M | $5 | $25 | Reference ceiling; build target |
| Claude Sonnet 5 | `claude-sonnet-5` | 1M | $2 | $10 | Production candidate |
| Claude Haiku 4.5 | `claude-haiku-4-5` | 200K | $1 | $5 | High-volume, only if measured |
| Qwen2.5-VL 7B | open, Apache 2.0 | — | self-host | — | Privacy fallback |

Why this family for the reference implementation, on checkable properties:

- **Structured outputs** via `output_config.format` / `client.messages.parse()` — the
  `PageRead` schema is *guaranteed*, so S1 cannot emit malformed JSON. Removes an entire
  class of parsing failure from a medical pipeline.
- **Adaptive thinking + effort dial** — one lever to trade accuracy against cost on hard
  pages, tuned per route rather than by swapping models and forfeiting cache reuse.
- **Prompt caching** — our system prompt is frozen and identical on every request.
- **Batch API at 50%** — eval sweeps (§11) and the S3 gap-fill job are both
  embarrassingly parallel and latency-insensitive.

### 6.3 Why not the alternatives

| Rejected | Why |
|---|---|
| **Tesseract** | Printed-text engine, no handwriting model. Already tried (`cb64255`), already replaced (`7797044`). |
| **TrOCR as primary or witness** | 6% raw / 14% post-fuzzy measured baseline. See §3.3. |
| **PaddleOCR / docTR / Surya** | Excellent on printed and structured documents; cursive handwriting is their weak point, and they return text with **no semantic priors** — no notion that "Napa" is a drug or "1-0-1" a dosing schedule. |
| **Donut** | Architecturally a good fit, but needs task-specific fine-tuning on **thousands of labelled full pages** — precisely the data we lack. Revisit once §8.3 has produced a corpus. |
| **Florence-2** | Small and open, but grounding/captioning-oriented; unreliable for long structured extraction where a hallucinated field has clinical consequences. |
| **GPT-4o / Gemini** | Legitimate candidates, **not rejected on capability**. Excluded from the default implementation only to avoid maintaining N provider integrations in a project with zero existing LLM infrastructure. The harness (§11.3) stays provider-agnostic so a cross-vendor comparison is a config change. |

### 6.4 How — concrete setup

```bash
pip install anthropic pydantic
export ANTHROPIC_API_KEY=sk-ant-...    # or: ant auth login
```

```python
# ml_pipeline/vlm/page_reader.py
import base64, io
from typing import Protocol
from PIL import Image
import anthropic

class PageReader(Protocol):
    """Swappable so the hosted and self-hosted paths are interchangeable (§10)."""
    def read(self, image: Image.Image) -> PageRead: ...

class ClaudePageReader:
    def __init__(self, model: str = "claude-opus-5"):
        self.client = anthropic.Anthropic()
        self.model = model

    def read(self, image: Image.Image) -> PageRead:
        buf = io.BytesIO()
        image.convert("RGB").save(buf, format="JPEG", quality=92)
        img_b64 = base64.standard_b64encode(buf.getvalue()).decode("utf-8")

        response = self.client.messages.parse(
            model=self.model,
            max_tokens=16000,
            thinking={"type": "adaptive"},
            output_config={"effort": "medium"},       # §6.5 — the dominant cost lever
            system=[{
                "type": "text",
                "text": PAGE_READER_SYSTEM_PROMPT,        # frozen, versioned
                "cache_control": {"type": "ephemeral"},   # stable prefix → cached
            }],
            messages=[{
                "role": "user",
                "content": [
                    {"type": "image", "source": {
                        "type": "base64", "media_type": "image/jpeg", "data": img_b64}},
                    {"type": "text", "text": "Read this prescription."},
                ],
            }],
            output_format=PageRead,
        )
        # Feed the spend guard (§14.2) and confirm caching is working (§6.5).
        record_usage(self.model, response.usage)
        return response.parsed_output
```

**Wrap this in the response cache (§14.2) before the first sweep**, keyed on
`(image_sha256, prompt_version, model, effort)`. Most development re-runs exercise S2–S4
and the UI against an unchanged VLM output; those must cost nothing.

Operational notes:

- **Errors:** catch a most-specific-first chain — `NotFoundError` → `RateLimitError` →
  `APIStatusError` → `APIConnectionError`. A single broad `except` loses the retryable /
  non-retryable distinction. The SDK already auto-retries 429/5xx/connection errors.
- **Verify caching works:** check `response.usage.cache_read_input_tokens` is non-zero
  across repeated calls. If it is always zero, something is mutating the prefix.
- **Eval sweeps use the Batch API** (`client.messages.batches`) at 50% cost. Results come
  back in **any order** — key by `custom_id`, never by position.
- **Never lower `max_tokens` to save money.** A truncated `PageRead` is a failed read
  that costs a full retry.

### 6.5 Cost model — measured, not estimated

Two of the three inputs are **measured from the actual eval images and the actual Opus 5
output**, not assumed:

| Input | Value | Source |
|---|---|---|
| Image tokens | **1,018** avg | Measured: the 5 spike images, resized to 1568px max edge |
| Output JSON | **650** tokens | Measured: 2,100 bytes/prescription from the real Opus 5 run |
| Cached prefix | 1,500 tokens | Estimated — system prompt + `PageRead` JSON schema |
| Thinking tokens | ~500 | Modelled at **`effort: "medium"`** — validated: the §6.6 spike ran at medium effort and the output quality was judged sufficient. Confirm against `usage.output_tokens` on the first API run. |

Billing model: 1 cache write @1.25×, (N−1) cache reads @0.1×, image + text uncached per
request, output + thinking billed at the output rate.

**Effort setting: `medium`.** The spike (§6.6) ran at medium effort and produced correct
readings of every clinical ambiguity on the page, including the strikethrough dose
correction. There is no evidence we need `high`, and effort is the dominant cost lever
(below) — so medium is the default until an eval shows otherwise. Note the spike was run
through the Claude chat interface rather than the API; expect close but not identical
behaviour, and re-confirm on the first API run.

**Cost for 100 prescriptions:**

| Model | no thinking | ~500 thinking | ~1500 thinking |
|---|---|---|---|
| **Opus 5** | $2.22 | **$3.47** | $5.97 |
| Sonnet 5 | $0.89 | $1.39 | $2.39 |
| Haiku 4.5 | $0.44 | $0.69 | $1.19 |
| **Opus 5 + Sonnet 5 (dual, §3.3)** | — | **$4.86** | — |

Via Batch API (eval sweeps, not live uploads) halve all of it — Opus 5 → **$1.74**.

**Scaling on Opus 5 @ ~500 thinking:** 100 = **$3.47** ($0.0347/prescription) ·
1,000 = **$34.65** · 10,000 = **$346**.

Three consequences:

1. **Thinking tokens are the dominant lever, not the model.** Output bills at $25/1M on
   Opus and thinking counts as output. No-thinking → 1500-thinking ($2.22 → $5.97) costs
   more than switching Opus → Sonnet at fixed thinking. **To cut cost, lower `effort`
   before downgrading the model.**
2. **The S0 resize saves 21%** — $4.41 → $3.47. One spike image is 2400×3600 =
   **11,520 image tokens** raw versus 2,185 resized; that single page cost more than the
   other four combined. One line of code.
3. **Dual-VLM would cost $1.39 per 100 pages** — affordable, but **not enabled during the
   pilot**. See §3.3: while a doctor reviews every page their corrections are ground
   truth, which strictly dominates model disagreement. Revisit at the Phase 2 boundary.

---

### 6.6 Spike results — measured on the eval set

Run on the **first 5 of the 129 Kaggle images**, comparing Opus 5 and Gemini against a
manual reading of each page. Raw outputs in `VLM_CHECK/`.

**Headline: no hallucination from either model.** Every medication either model reported
is genuinely on the page. This is the central risk carried over from the LLaVA notebook
(`medical-prescription-ocr.ipynb`), where LLaVA-1.5-7B fabricated five drugs — Thyroxine,
Prednisolone, Amoxicillin, Atorvastatin, Met… — on a clinical note whose second line
reads `∅ meds` (no medications). **It does not reproduce on frontier models.**

That LLaVA prompt is worth preserving as a lesson: *"Extract only medicine names and
dosages from this prescription. List them:"* **asserts** the document is a prescription
and offers no way to answer "it isn't one" or "there are none." A compliant model will
always produce a list. This is exactly why `document_type: "not_a_prescription"` and
requirement 6 exist in S1.

**Opus 5 vs Gemini — image 5 (paediatric note), the decisive comparison:**

| On the page | Opus 5 | Gemini | Correct |
|---|---|---|---|
| `Syp ephedrex 3̶ 5 ml` (3 struck out → 5) | "3–5 ml, the '3' appears struck through" | **"3.5 ml"** | **Opus** |
| `SOS (4 hrly)` | "SOS (4 hourly)" + flagged uncertain | **"SOS (4 mg)"** | **Opus** |
| `SOS (6 hrly)` | "SOS (6 hourly)" | **"SOS (6 mg)"** | **Opus** |
| `twice (o-o)` | "twice (0-0)" | "twice (OD)" — self-contradictory | **Opus** |

Gemini read a **strikethrough correction as a decimal point**, turning a 5 ml paediatric
dose into 3.5 ml. And "Crocin DS 4 ml SOS (4 mg)" is clinically meaningless — Crocin DS is
250 mg/5 ml; the notation is a dosing interval.

**Opus 5's uncertainty flagging is well calibrated, unprompted.** It listed exactly the
genuinely ambiguous items: *"could read 'Azenac-MR' or 'Anevac-MR'"*, *"strength suffix on
Zofer unclear"*, and on the 1921 card the patient surname and final volume symbol. The
`alternatives` + abstention mechanism in S1 works before we have even asked for it.

**One real defect — and it is a prompt bug, not a model bug.** Image 1 reads
**"Dijoxin"**; Opus silently normalised it to **"Digoxin"** with no flag. Gemini kept the
literal reading. Here **Gemini is right**: S1 requires verbatim transcription, with
correction downstream in S2 where it is auditable. The ad-hoc spike prompt never asked for
verbatim. **Make image 1 the first regression test for the S1 prompt.**

**Caveat on scope:** n=5, and four of the five are relatively legible. Two other images
from the same set (102.jpg, 110.jpg, seen via the notebook) are handwritten clinical notes
with no medications at all. **The 129-image set is a mixed bag** — real prescriptions and
medication-free clinical notes. Both are useful: prescriptions as positive examples,
notes as **hard negatives** for the hallucination metric (§11.2).

---

## 7. What happens to the existing code

| File | Fate |
|---|---|
| `ocr/trocr_inference.py` | **Remove from serving.** Keep `_infer_line` only as a research-time benchmark. Delete `split_into_lines`, `predict_prescription`, `_extract_medicines`, `_extract_medicines_from_words`. |
| `ocr/word_detector.py` | **Delete.** S1 replaces it. |
| `preprocessing/{deskew,denoise,binarise}.py` | **Delete from the serving path.** With TrOCR cut they have no consumer; S0 must not binarise. |
| `ocr/trocr_finetune_rxhandbd.py` | **Park.** |
| `ocr/crnn_train.py` | **Park.** |
| `ocr/evaluate_rxhandbd.py` | **Keep** as a word-level component benchmark. Not the system metric. |
| `ocr/tesseract_inference.py` | **Delete.** Imported in `backend/main.py`, never instantiated. |
| `ocr/ensemble.py` | **Delete.** Imports `OCRResult`, which does not exist — raises `ImportError` on import today. |
| `ocr/postprocess_ocr.py` | **Merge into S2.** Currently causes double fuzzy-matching. |
| `drug_interaction/*` | **Keep, fix the loader** (§9). Graph design is sound. |
| `synthetic_data/generate_prescriptions.py` | **Park.** |
| `backend/main.py` | Fix port (runs on **8002**; frontend, `.env.example`, README and docker-compose all say 8000). Remove unused `MODEL_DIR` and the Tesseract import. |
| `web_app`, `pharmacy_dashboard` | **Keep and extend** — the verification flow becomes load-bearing (§8). |

---

## 8. Human-in-the-loop and the correction flywheel

### 8.1 The deployment model

**Phase 1 (now):** only doctors scan. Every extraction is verified and corrected before
it is used.
**Phase 2 (later):** patients scan their own prescriptions to retrieve medicine names.

### 8.2 Why the architecture must target Phase 2 from day one

In Phase 1 a doctor catches every error, so hallucination is an annoyance. In Phase 2 the
safety net is gone, and a confidently hallucinated medicine name reaches a patient with
no one to catch it. **Retrofitting safety after removing the human is how people get
hurt.** Abstention, calibration and the hallucination metric (§11.2) go in now, while a
doctor is still checking — that is precisely when you can *measure* how well they work.

The verification screen should show, per medicine: the extracted fields, the confidence,
and the **cropped image region** (from `bbox`) side by side. Reviewing against the pixels
is a glance; reviewing against memory is a rubber-stamp.

`AMBIGUOUS` items render as **pick-one-of-N**, not free text — a click is cheaper than
typing, so corrections actually get made.

### 8.3 Doctor corrections are the training corpus

**This is the answer to "we don't have a decent dataset."**

We have no page-level training data. The product design *generates* it, continuously, as
a byproduct of normal use, in the exact target domain:

```
doctor corrects "Zofer u-r"  →  "Zofer 4mg"
   ⇒ one labelled field on a real prescription, in our exact target domain
   ⇒ written to the correction log with the raw model output beside it
doctor confirms a page unchanged
   ⇒ one fully labelled page
```

At ~100 prescriptions/week that is **~5,000 labelled real pages per year, free.**

Requirements:

- **Log from day one**, in a schema designed for training, even before we use it:
  `image_hash, image_path, model_version, prompt_version, predicted PageRead,
  corrected PageRead, corrected_by, corrected_at, correction_type`.
- Store the **full before/after**, not just the diff — the model's wrong answer is as
  informative as the right one.
- Version `model_version` and `prompt_version` so a later regression is attributable.
- **Consent and de-identification** apply here as much as to S1 (§10); patient name
  should be redacted before an image enters the training store.

What it unlocks, in order of how soon it pays off:

1. **Regression suite** (~100 corrections). Catches prompt changes that break things.
2. **Prompt tuning / few-shot** (~500). Real failure cases become prompt examples.
3. **Calibration** (~1,000). Fit confidence thresholds to *observed* correction rates
   instead of guesses.
4. **Fine-tuning or distillation** (~5,000+). This is where a smaller or self-hosted
   model becomes viable — and where Donut (§6.3) is worth revisiting.

Note the inversion: the "we have no data" problem is solved by *shipping*, not by
finding a better Kaggle dataset.

---

## 9. The drug-interaction layer

### 9.1 Three stacked breaks (all currently live)

1. **Loader mismatch.** Globs `*.csv`; data is `.json`. Falls back to 6 hardcoded edges,
   advertised as "200+ rules".
2. **Namespace mismatch.** OCR emits brand names; the graph is keyed on generics.
   Raw overlap: 3 drugs. Fixed by S3.
3. **Unused mapping.** The BD CSVs carry 78 brand→generic pairs nothing reads — useful as
   a code-path fixture, but BD brands, not Indian (§5.3.2).

### 9.2 Fix

Load the JSON, expand class-level rows, run lookups on **normalised generics after S3**,
and surface `mechanism` / `Safer_alternative` / `reference` in the UI.

### 9.3 Why the DDI layer stays deterministic (no BioBERT)

A learned classifier would be **worse on every axis that matters here**:

- **Auditability.** A clinician must be able to ask "why was this flagged?" A table row
  with a DrugBank citation answers that. A logit does not.
- **Accuracy.** The curated table is human-verified clinical knowledge; a classifier
  trained on DDIExtraction-2013 would approximate it with added error.
- **Data.** Another data dependency, to reproduce information we already hold verified.
- **Failure mode.** A missing row is a visible, fixable gap. A miscalibrated classifier
  emits confident wrong severities — the worst possible failure in this layer.

**Cut BioBERT from the roadmap; remove the claim from `HomePage.jsx:75`.** Where ML earns
its place in this system is reading (S1–S2), not safety (S4).

---

## 10. Privacy and deployment

This is now a **live clinical question**, not a hypothetical — the system is intended for
real doctors scanning real prescriptions.

**Posture A — hosted API (default).** Images leave the machine. Requires explicit consent
in the upload flow, a retention policy, and patient-name redaction before storage.

**Posture B — fully local.** Qwen2.5-VL 7B via vLLM; nothing leaves the network. Costs
quality, needs a GPU, and requires the eval re-run to quantify the drop.

**This must be decided before S1 is written** — it determines whether the reader is a thin
API wrapper or a local serving stack. The `PageReader` Protocol (§6.4) keeps them
swappable either way.

---

## 11. Evaluation protocol

**Build this first. It is what makes everything else measurable.**

### 11.1 The eval set

**129 Kaggle full-page images** (`mehaksingal/illegible-medical-prescription-images-dataset`).
Verified by inspection (§6.6): the set is **mixed** — genuine prescriptions (Indian clinic
pads, hospital emergency cards, a Dutch form, a 1921 US compounding card) *and* handwritten
clinical notes carrying no medications at all.

**Annotate both classes — the notes are not waste:**

```json
{
  "image": "2.jpg",
  "document_type": "prescription",
  "medicines": [
    {"brand": "Oflazest OZ", "generic": "Ofloxacin + Ornidazole", "dosage": null,
     "frequency": "1-0-1", "duration": "3 days", "legible": true}
  ],
  "illegible_lines": [],
  "notes": "Zofer strength suffix genuinely ambiguous"
}
```

```json
{
  "image": "102.jpg",
  "document_type": "not_a_prescription",
  "medicines": [],
  "notes": "gynae clinical note; line 2 reads '∅ meds'. HARD NEGATIVE — any drug name emitted here is a scored hallucination"
}
```

The medication-free notes are the **hallucination stress test**. A clean negative set is
normally hard to obtain; this one comes free, and it is what makes the top metric in
§11.2 measurable at all.

**Three splits, not two** — the smoke set is what makes the budget work (§14.1):

| Split | Size | Purpose | Cost/sweep |
|---|---|---|---|
| **smoke** | **8** | Prompt iteration. Hard cases only — the strikethrough page, a hard negative, `1.jpg`. Run live for fast feedback. | $0.28 |
| **dev** | 30 | Threshold tuning, model comparison. Batched. | $0.52 |
| **test** | ~91 | Final scoring. **Touched once, at the end.** | $1.58 |

Stratify so prescriptions *and* medication-free notes appear in every split. With only 129
images it is very easy to overfit thresholds and report a meaningless number — **do not
tune on test**, and do not iterate prompts on dev when smoke will do.

**Vocabulary note:** target scope is **English-language prescriptions, primarily Indian**.
The observed brands are Indian — Oflazest-OZ, Azenac-MR, Andial, Zofer, Crocin DS,
Meftal-P, Ephedrex. The 1,440-name **BD** list in `data/rxhandbd/rxhandbd_labels.txt` is
therefore the wrong constraint set for S2 and must be swapped for an Indian brand
vocabulary (CDSCO / Indian pharmacopoeia brand listings). This is a data swap, not an
architecture change — but S2 and S3 both depend on it.

**PII:** these are real documents. Image 2 carries a practising doctor's mobile number,
clinic number and email. Redact before the set is committed, shared, or published.

### 11.2 Metrics

| Metric | Definition | Why |
|---|---|---|
| **Hallucination rate** | Fraction of reported medicines **not present on the page** | **The safety metric. Report it first, always.** |
| **Medicine F1** | Precision/recall over drug names per page | Primary quality number |
| **Coverage** | Fraction of ground-truth medicines auto-resolved without human input | The product number |
| **Dosage EM / Frequency EM** | Exact match, conditioned on correct drug identification | Structured-extraction quality — in scope (§13) |
| **Abstention precision** | Of items marked illegible, fraction genuinely illegible to a human | Is abstention calibrated, or just giving up? |
| **Coverage–accuracy curve** | Sweep S2 thresholds; plot accuracy vs coverage | Pick the operating point defensibly |

**A system that reports 8 of 10 medicines correctly and abstains on 2 is better than one
that reports 9 correct and 1 confidently wrong.** Hallucination rate leads; F1 is never
quoted alone.

### 11.3 Model comparison — bounded by the budget

Same prompt and schema, run on the **dev split (30 images) via the Batch API**, across
Opus 5 / Sonnet 5 / Haiku 4.5 plus the current pipeline as baseline:

**3 models × 30 images × $0.0174 (batch) ≈ $1.57 total.**

Do **not** sweep every candidate across all 129 images — that is ~$11 batched and would
eat a third of the testing budget for a result the dev split already gives you. Promote
the winner to the test split once, at the end. Qwen2.5-VL-7B enters this comparison only
if the privacy posture (§10) forces Posture B; it costs nothing to run but needs a GPU
and setup time.

The **provider-agnostic harness is itself a deliverable** — a reproducible methodology for
evaluating VLMs on handwritten clinical documents outlives any single model release.

---

## 12. Migration plan

| Phase | Work | Gate |
|---|---|---|
| **P00** | **Response cache + spend guard (§14.2)** — before the first full sweep | Cache hit rate reported; hard spend cap enforced. Funds every phase below. |
| **P0** | Annotate the 129 images; build the eval harness; run the **current** pipeline through it | A real baseline number, for the first time |
| **P1** | Fix the DDI JSON loader; import the 78 BD pairs **as a code-path fixture** (§5.3.2); add salt/route normalisation | Interactions fire end-to-end on the fixture; overlap 3 → 7 confirmed |
| **P2** | Build S0 + S1 behind `PageReader`; run the bake-off | Medicine F1 + hallucination rate per candidate model |
| **P3** | Build S2; tune thresholds on the dev split | Coverage–accuracy curve; operating point chosen |
| **P4** | **Swap BD → Indian brand vocabulary** (§11.1); S3 registry mapping + RxNorm resolution | Interaction coverage measured on real pages |
| **P5** | Wire `Outcome` types through backend + dashboard; build the review screen and **the correction log (§8.3)** | End-to-end doctor-verified demo with honest abstention |
| **P6** | *Phase 2 gate:* enable dual-VLM cross-check (§3.3) when the doctor leaves the loop | Disagreement rate measured; disagreements route to human |

P0 and P1 are worth doing regardless of what we decide elsewhere — P0 because we cannot
currently measure anything, P1 because a few hours takes a headline feature from 6 rules
to 180.

**One P2 addition from the spike:** make `1.jpg` ("Dijoxin" → must **not** be silently
normalised to "Digoxin") the first regression test for the S1 prompt. Verbatim
transcription is a requirement that a plausible-looking prompt will quietly violate.

---

## 13. Open questions

**Resolved:**

- ~~What is in the 129 Kaggle images?~~ → **Inspected (§6.6). Mixed set:** real
  prescriptions *and* medication-free clinical notes. Both usable — the notes become hard
  negatives for the hallucination metric. Annotation is P0.
- ~~Which region / language?~~ → **English-language, primarily Indian.** Consequence: the
  1,440-name BD vocabulary is wrong for S2 and must be swapped (§11.1).
- ~~Will a VLM hallucinate drugs on these pages?~~ → **Measured: no**, on Opus 5 and
  Gemini across 5 images (§6.6). LLaVA-1.5-7B did, badly — the difference is model tier
  plus a prompt that presupposed a medicine list existed.
- ~~Is dual-VLM cross-check worth it?~~ → **Yes in principle, but deferred to Phase 2
  (§3.3).** Every material spike error surfaced as a model disagreement, at $1.39/100 —
  but during the pilot the reviewing doctor supplies *ground truth*, which strictly
  dominates "one of these two is possibly wrong". Enable it when the human leaves the loop.
- ~~Cheap/free model as the verifier?~~ → **No (§3.3).** Max saving $1.22 per 100 (~₹1),
  and it catches only hallucination — already measured at zero — while missing the subtle
  clinical misreads that are the actual risk. Free tiers also train on submitted data,
  which is a PHI disclosure.
- ~~Are the RxHandBD images recoverable?~~ → Re-downloadable but **judged low value**;
  deprioritised. Consistent with cutting TrOCR (§3.3).
- ~~Are VLM bboxes accurate enough to crop for TrOCR?~~ → **Moot.** TrOCR is cut. Bboxes
  now serve the review UI (§8.2), where approximate is fine.
- ~~Is dosage/frequency in scope?~~ → **Yes, in scope.** Reflected in the schema (S1) and
  metrics (§11.2).
- ~~Who verifies the LLM-generated brand→generic pairs?~~ → **The doctor-in-the-loop
  model plus the two-source rule (§5.3.2).** Enforced in code via the `verified` flag.

**Open:**

1. **Privacy posture (§10) — blocking P2.** Concretely: (a) will real patient
   prescriptions with real names be uploaded during the pilot? (b) does the institution
   require ethics/IRB approval or a data agreement? (c) is there any rule against health
   data leaving the country or hospital network? If (c) is yes, Posture B is forced and
   S1 is a local serving stack, not an API client.
2. **Does the review screen show the cropped image region per medicine?** Yes → keep
   `bbox` in the schema. No → drop it and simplify. Affects S1's schema and the dashboard.
3. **Is an Indian brand→generic registry obtainable in bulk?** CDSCO listings, NLEM, MIMS
   India, CIMS India — download / scrape / API? **I asserted these exist but have not
   verified format or bulk availability.** Someone should spend 15 minutes confirming
   before the P4 estimate is trusted. If none is bulk-obtainable, S3 falls back to verified
   LLM gap-fill, which is slower and needs more human sign-off.
4. **Where does the correction log live?** The backend is currently an in-memory list
   (`prescriptions_db`) with an unused `config/database.py`. §8.3 needs real persistence —
   this is the point at which SQLite/Postgres stops being optional.

---

## 14. Testing-phase budget and cost control

### 14.1 The testing budget is $20–30. It fits — with two disciplines.

Measured cost is **$0.0347/image** on Opus 5 at `effort: "medium"` (§6.5). A full
129-image sweep is $4.48 live; a $30 budget buys **six of them**. That is not enough to
develop against, so the spend has to be shaped:

| Purpose | Set | Mode | Runs | Cost |
|---|---|---|---|---|
| Prompt iteration | **smoke (8)** | live | 40 | $11.10 |
| Threshold tuning | dev (30) | **batch** | 10 | $5.21 |
| Regression re-runs | dev (30) | **batch** | 6 | $3.12 |
| Final scoring | test (99) | **batch** | 3 | $5.15 |
| | | | | **$24.58** (headroom $5.42) |

**Discipline 1 — iterate on 8 images, not 129.** Prompt work needs fast feedback on hard
cases, not coverage. Promote to the dev split only when the smoke set is clean.

**Discipline 2 — batch everything non-interactive** (50% off). Only prompt iteration
needs live latency.

### 14.2 The response cache is the highest-leverage thing in this document

Key on `(image_sha256, prompt_version, model, effort)`; store the raw response on disk.

| Cache hit rate | Effective spend | |
|---|---|---|
| 0% | $24.58 | no cache |
| **70%** | **$7.38** | **3× the experiments for the same money** |
| 85% | $3.69 | 6× |

During development the large majority of re-runs exercise **downstream logic** — S2
vocabulary matching, S3 mapping, S4 interactions, the review UI — where the VLM output has
not changed at all. Those runs must cost nothing. Only a prompt or model change should
invalidate an entry.

Pair it with a **spend guard**: accumulate real `response.usage` per call into a running
total, log it, and enforce a hard cap that refuses to start a sweep that would exceed the
remaining budget. Default the runner to the smoke set; require an explicit flag for dev or
test. **Build both before the first full sweep** — they pay for themselves immediately.

### 14.3 What the budget does *not* cover

The learning / continuous-improvement work (calibration, few-shot, any training) is **not
in this budget and not in this phase**. Its roadmap, status and pick-up point are §16.

One thing from it lands *now*, in P5, and cannot be deferred: **the correction log**
(§16.3). Fields not captured at write time are unrecoverable, so it must exist before the
pilot starts — not when the learning work begins.

---

## 15. What this changes about the project's contribution

With 4.6K word crops we are not going to beat TrOCR-large's baseline in a way anyone
finds interesting. "We fine-tuned an existing model on a small public dataset" is not a
defensible contribution, and chasing it would have consumed the remaining schedule.

What *is* defensible:

> **A constrained, abstention-aware prescription extraction pipeline with brand-generic
> normalisation, an auditable cited drug-safety layer, and a human-verification loop that
> compounds into a domain-specific training corpus — evaluated on real prescription
> photographs with hallucination rate as a first-class metric.**

The contribution is the **system design, the safety guarantees, and the data flywheel**,
plus a reproducible provider-agnostic evaluation methodology for handwritten clinical
documents. None of it requires data we do not have. All of it is measurable with the 129
images. And it is honest about what the system cannot read — which, for anything that
touches prescribing, is the whole point.

---

## 16. Continuous improvement — roadmap and pick-up point

> **Purpose of this section:** you are stopping here to build. When you come back to the
> learning/RL work — after the pilot, once corrections have accumulated — this is the map.
> It records what was decided, what was deliberately *not* built, and what to do first.
> Nothing below is implemented. **No stub code exists for any of it, by design (§16.3).**

### 16.1 Status legend

| | Meaning |
|---|---|
| ✅ | Built and working |
| 🔨 | Being built now |
| ⬜ | **Specified in this document, not built** |
| 💭 | Idea only — not designed, not costed |
| 🚫 | **Deliberately not built** — reason recorded |

### 16.2 The flow

```
        ┌───────────────────────────────────────────────────────────────┐
        │  S1  VLM PAGE READ   Opus 5 @ effort:medium                   │
        │  ⬜ specified §5/S1 · built in P2                              │
        └──────────────────────────────┬────────────────────────────────┘
                                       │ PageRead + confidence + alternatives
                                       ▼
        ┌───────────────────────────────────────────────────────────────┐
        │  S5  DOCTOR VERIFICATION   every page, Phase 1                │
        │  ⬜ specified §8 · built in P5                                 │
        └──────────────────────────────┬────────────────────────────────┘
                                       │ corrections AND confirmations
                                       │ (an unchanged page is a label too)
                                       ▼
      ╔═════════════════════════════════════════════════════════════════╗
      ║  CORRECTION LOG          ⬜ NOT BUILT — P5                       ║
      ║  ────────────────────────────────────────────────────────────   ║
      ║  raw_response · parsed PageRead · corrected PageRead            ║
      ║  prompt_version · model · effort · confidence · alternatives    ║
      ║  correction_type · corrected_by · corrected_at · image_sha256   ║
      ║                                                                 ║
      ║  ⚠ THIS BLOCKS EVERYTHING BELOW. Fields not captured at write   ║
      ║    time are unrecoverable. Build it before the pilot starts,    ║
      ║    not when the learning work begins.                           ║
      ╚════════════════════════════════╤════════════════════════════════╝
                                       │ accumulates during the pilot
        ┌──────────────┬───────────────┼───────────────┬───────────────┐
        │ ~100         │ ~200          │ ~500          │ ~5,000        │
        ▼              ▼               ▼               ▼               │
  ┌───────────┐  ┌───────────┐  ┌────────────┐  ┌──────────────┐       │
  │ REGRESSION│  │ T0        │  │ T1         │  │ T2           │       │
  │ SUITE     │  │ THRESHOLD │  │ FEW-SHOT   │  │ SFT / DPO    │       │
  │           │  │ CALIBRATE │  │ RETRIEVAL  │  │ open weights │       │
  │ ⬜ not     │  │ ⬜ not     │  │ 💭 idea    │  │ 💭 idea      │       │
  │    built  │  │    built  │  │            │  │              │       │
  │           │  │           │  │            │  │ ⚠ leaves the │       │
  │ replay    │  │ fit S2    │  │ retrieve   │  │   Claude API │       │
  │ past      │  │ cut-offs  │  │ similar    │  │   entirely   │       │
  │ pages,    │  │ to OBSERVED│ │ past       │  │              │       │
  │ diff vs   │  │ correction│  │ corrections│  │ needs GPU +  │       │
  │ known     │  │ rates     │  │ into the   │  │ a separate   │       │
  │ answers   │  │           │  │ S1 prompt  │  │ decision     │       │
  └─────┬─────┘  └─────┬─────┘  └──────┬─────┘  └──────┬───────┘       │
        │              │               │               │               │
        │ catches      │ replaces the  │ real failures │ a smaller or  │
        │ prompt       │ GUESSED 88 /  │ become prompt │ local model   │
        │ regressions  │ 82 / 0.60     │ examples      │ becomes       │
        │              │ with measured │               │ viable        │
        │              │ numbers       │               │               │
        └──────────────┴───────────────┴───────────────┴───────────────┘
                                       │
                                       ▼
                             ┌──────────────────────┐
                             │ T3  RL w/ learned    │
                             │     reward model     │
                             │ 🚫 not planned       │
                             │ rarely beats T2 for  │
                             │ the added complexity │
                             └──────────────────────┘
```

### 16.3 The correction log — build this in P5, it blocks everything

**Do not build:** stub trainer modules, an empty `rl/` package, `# TODO: policy update`
markers. They rot, mislead reviewers, and get deleted unread.

**Do build:** a log rich enough that every tier below stays *possible*. Five fields are
trivial to capture now and **unrecoverable afterwards**:

1. **The raw model response**, not only the parsed `PageRead` — without it, T2 preference
   pairs cannot be constructed.
2. **`prompt_version`, `model`, `effort`** — without these no correction is attributable
   to a configuration, and every later comparison is uninterpretable.
3. **`confidence` and `alternatives`** — the input features for T0's fit.
4. **Full before *and* after** — never a diff.
5. **A correction taxonomy**: `misread` / `hallucinated` / `missed` / `wrong_field`. This
   is the reward signal, and it costs one dropdown in the review screen.

**Justified on today's merits alone.** A clinical tool needs an audit trail of who changed
what and when, irrespective of whether any training ever happens. It is not scaffolding for
a future feature; it is a present requirement that happens to also be the prerequisite.

Also log **confirmations**, not only corrections — a page a doctor passed unchanged is a
fully labelled page, and it is the majority class.

### 16.4 Tier detail

Three constraints shape what "learning" can mean here:

- **Opus cannot be fine-tuned through the API.** Any SFT/DPO/RL path eventually means
  moving to open weights. That is a real architectural fork, deferred by agreement.
- **Most of the value arrives before any training**, and far cheaper.
- **What can be learned early is a *decision* policy** — accept / abstain / escalate —
  not a neural one.

| Tier | Needs | What it actually does | Status |
|---|---|---|---|
| **Regression suite** | ~100 corrections | Replay logged pages through the current prompt; diff against known-correct answers. Catches a prompt edit that silently breaks something. | ⬜ |
| **T0 — threshold calibration** | ~200 corrections, **no GPU, no training** | The S2 cut-offs (88 / 82 / 0.60) are **my guesses**. Fit them to observed correction rates — e.g. logistic regression on `confidence` + `fuzzy_score` + `alternatives` count → P(doctor corrects). Pick the operating point off the coverage–accuracy curve (§11.2). **This is the honest version of "a policy that improves as data grows."** | ⬜ |
| **T1 — few-shot retrieval** | ~500 corrections | Embed past corrections; retrieve the nearest few for the current page; inject as examples into the S1 prompt. No training, works with the API, immediate effect. Costs input tokens per call — recost against §6.5. | 💭 |
| **T2 — SFT / DPO** | ~5,000 pairs + GPU | `(image, raw_output) → corrected_output` is exactly a preference pair. Train an open VLM (Qwen2.5-VL). **This is the point where the project leaves the Claude API** — a separate architectural decision, deferred by agreement. | 💭 |
| **T3 — RL with learned reward** | substantial | A reward model over correction data, then policy optimisation. | 🚫 |

### 16.5 Deliberately not built — so nobody re-litigates it later

| Not built | Why | Revisit when |
|---|---|---|
| 🚫 Stub `rl/` package, trainer skeletons, `# TODO: policy update` | Placeholders rot, mislead reviewers, and get deleted unread. The prerequisite is **data capture**, not code (§16.3). | Never — build T0 directly when the data exists |
| 🚫 T3 (full RL + reward model) | Rarely justifies its complexity over T2. | Only if T2 measurably plateaus |
| 🚫 BioBERT / learned DDI classifier | Worse than a cited lookup table on auditability, accuracy, data cost, and failure mode (§9.3). | Never |
| 🚫 Dual-VLM cross-check | During Phase 1 the doctor supplies ground truth, which dominates model disagreement (§3.3). | **Phase 1 → Phase 2 boundary** |
| 🚫 TrOCR in any form | 6% raw / 14% post-fuzzy measured (§3.3). | Only if T2 needs a component baseline |
| 🚫 Open-weights migration | Deferred by agreement — it is a real architectural fork, not a tuning step. | T2, or if privacy Posture B is forced (§10) |

### 16.6 Pick-up checklist

When you return to this work, in order:

1. **Check the log is actually complete.** Query the correction table for a page and
   confirm `raw_response`, `prompt_version`, `confidence` and `alternatives` are all
   populated and non-null. If any is missing, **stop and fix the writer first** — every
   tier below depends on it, and backfill is impossible.
2. **Count.** `SELECT correction_type, COUNT(*) FROM corrections GROUP BY 1`. The counts
   tell you which tier is unlocked. Below ~100, keep piloting.
3. **Build the regression suite first**, even if you have enough data for T0. It is the
   cheapest, and everything after it needs a way to tell whether a change helped.
4. **Then T0.** Replacing three guessed thresholds with measured ones is the single
   largest accuracy gain available at that point, and it needs no GPU, no training and no
   new dependency — it is a fit over a table you already have.
5. **Re-read §16.4 before anyone says "RL".** Most of the value is in the regression
   suite, T0 and T1. T2 is where the API dependency ends and a genuinely different project
   begins; T3 is not planned.

### 16.7 One decision already taken that keeps this cheap

The S2/S3 thresholds live in **a config file, not as constants** (§5/S2). That means T0 —
"update the policy" — is *writing a file*, not refactoring the pipeline. That single choice
is the entire surface area reserved for this work, and it costs nothing now.
