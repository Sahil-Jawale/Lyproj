"""
PrescriptAI Backend — FastAPI REST API.  (docs/ARCHITECTURE_V2.md §8)

Wires the pipeline:

    S0 normalise -> S1 VLM read -> S2 vocab -> S3 brand/generic + NLEM
                 -> S4 interaction check -> S5 doctor verification

Two behaviours this API is deliberately built around:

  * THE READING IS ALWAYS RETURNED. Verification changes the strength of the
    warning, never whether the result is visible. A blocked screen helps nobody
    and the doctor is the safety net.

  * NOTHING IS SILENTLY DROPPED. `skipped` names every medicine and every
    ingredient excluded from the safety check, with the reason. "We checked 4 of
    6" and "we checked 6" are very different claims to put in front of a
    clinician.

Set READER=mock to run the whole product with no API key and no cost.
"""

from __future__ import annotations

import io
import json
import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

from fastapi import Depends, FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR / "ml_pipeline"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from env import load_env  # noqa: E402

load_env()

from config.database import Base, engine, get_db  # noqa: E402
from drug_interaction.interaction_inference import InteractionChecker  # noqa: E402
from ingest.normalise import normalise  # noqa: E402
from models import Correction, CorrectionType, InteractionRun, Prescription  # noqa: E402
from vlm.page_reader import CachedPageReader, build_reader  # noqa: E402
from vlm.prompts import PROMPT_VERSION  # noqa: E402
from vlm.spend import get_guard  # noqa: E402
from vlm.vocab import load_config, resolve_page  # noqa: E402

UPLOAD_DIR = Path(__file__).resolve().parent / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# "mock" runs the entire product with no key and no cost — that is how Track C
# was built before the reader existed, and how the UI is developed cheaply.
READER_KIND = os.environ.get("READER", "claude")

app = FastAPI(title="PrescriptAI API", version="2.0.0")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

_reader = None
_checker = None


@app.on_event("startup")
def _startup() -> None:
    global _reader, _checker
    Base.metadata.create_all(bind=engine)
    print(f"[API] reader={READER_KIND} prompt={PROMPT_VERSION}", flush=True)
    _reader = build_reader(READER_KIND)
    _checker = InteractionChecker()
    cfg = load_config()
    print(f"[API] vocabulary region={cfg.region} nlem={cfg.nlem_enabled}", flush=True)


# ─── response models ─────────────────────────────────────────────────────────


class MedicineOut(BaseModel):
    index: int
    brand: Optional[str] = None
    generic: Optional[str] = None
    ingredients: List[str] = []
    verified_ingredients: List[str] = []
    unverified_ingredients: List[str] = []
    verification: str
    outcome: str
    confidence: float
    match_score: Optional[float] = None
    raw_reading: str
    matched_via: Optional[str] = None
    candidates: List[str] = []
    dosage: Optional[str] = None
    frequency: Optional[str] = None
    duration: Optional[str] = None
    instructions: Optional[str] = None
    bbox: Optional[List[float]] = None
    needs_hard_confirmation: bool


class InteractionOut(BaseModel):
    drug_a: str
    drug_b: str
    severity: str
    severity_color: str
    effect: str = ""
    mechanism: str = ""
    safer_alternative: str = ""
    reference: str = ""


class InteractionOutcome(BaseModel):
    interactions: List[InteractionOut] = []
    total_count: int = 0
    overall_risk: str = "none"
    medicines_checked: List[str] = []
    skipped: List[str] = Field(
        default=[], description="Excluded from the safety check, with reasons. Never hidden."
    )


class PrescriptionOut(BaseModel):
    id: str
    created_at: str
    image_url: str
    document_type: str
    overall_legibility: float
    patient_name: Optional[str] = None
    prescriber_name: Optional[str] = None
    date: Optional[str] = None
    unreadable_regions: List[str] = []
    medicines: List[MedicineOut] = []
    interactions: InteractionOutcome
    reviewed: bool = False
    disclaimer: str


class CorrectionIn(BaseModel):
    medicine_index: int = Field(description="-1 for page-level fields")
    field: str
    corrected_value: Optional[str] = None
    correction_type: CorrectionType = CorrectionType.OTHER
    note: Optional[str] = None
    corrected_by: str = "doctor"


DISCLAIMER = (
    "AI-extracted. Verify against the original prescription before dispensing — "
    "this can be wrong. Only ingredients on the NLEM 2022 essential-medicines "
    "list are checked for interactions; anything else is listed under 'skipped'."
)


# ─── helpers ─────────────────────────────────────────────────────────────────


def _med_out(i: int, m) -> MedicineOut:
    return MedicineOut(
        index=i, brand=m.brand, generic=m.generic, ingredients=m.ingredients,
        verified_ingredients=m.verified_ingredients,
        unverified_ingredients=m.unverified_ingredients,
        verification=m.verification.value, outcome=m.outcome.value,
        confidence=m.confidence, match_score=m.match_score,
        raw_reading=m.raw_reading, matched_via=m.matched_via,
        candidates=m.candidates, dosage=m.dosage, frequency=m.frequency,
        duration=m.duration, instructions=m.instructions, bbox=m.bbox,
        needs_hard_confirmation=m.needs_hard_confirmation,
    )


def _to_out(rx: Prescription) -> PrescriptionOut:
    page = json.loads(rx.page_read_json)
    meds = json.loads(rx.resolved_json)
    run = rx.interaction_runs[-1] if rx.interaction_runs else None
    inter = json.loads(run.result_json) if run else {}
    return PrescriptionOut(
        id=rx.id,
        created_at=rx.created_at.isoformat() if rx.created_at else "",
        image_url=f"/uploads/{Path(rx.image_path).name}",
        document_type=rx.document_type or "prescription",
        overall_legibility=rx.overall_legibility or 0.0,
        patient_name=rx.patient_name, prescriber_name=rx.prescriber_name,
        date=rx.prescribed_date,
        unreadable_regions=page.get("unreadable_regions", []),
        medicines=[MedicineOut(**m) for m in meds],
        interactions=InteractionOutcome(**inter) if inter else InteractionOutcome(),
        reviewed=rx.reviewed_at is not None,
        disclaimer=DISCLAIMER,
    )


# ─── routes ──────────────────────────────────────────────────────────────────


@app.get("/api/health")
def health():
    guard = get_guard()
    return {
        "status": "healthy", "version": "2.0.0", "reader": READER_KIND,
        "prompt_version": PROMPT_VERSION,
        "spend_usd": round(guard.total_usd(), 4),
        "spend_cap_usd": guard.cap_usd,
        "spend_remaining_usd": round(guard.remaining_usd(), 4),
    }


@app.post("/api/prescriptions/upload", response_model=PrescriptionOut)
async def upload_prescription(
    image: UploadFile = File(...), db: Session = Depends(get_db)
):
    if not image.content_type or not image.content_type.startswith("image/"):
        raise HTTPException(400, "File must be an image (jpg, png, ...)")

    contents = await image.read()
    ext = (image.filename or "x.jpg").rsplit(".", 1)[-1].lower()
    img_id = str(uuid.uuid4())
    img_path = UPLOAD_DIR / f"{img_id}.{ext}"
    img_path.write_bytes(contents)

    try:
        norm = normalise(contents)                       # S0
        page = _reader.read(norm)                        # S1
    except Exception as exc:  # spend cap, auth, API failure
        raise HTTPException(502, f"Reader failed: {exc}") from exc

    meds = resolve_page(page)                            # S2 + S3
    result = _checker.check(meds)                        # S4

    inner = getattr(_reader, "inner", _reader)
    cost = getattr(inner, "last_cost", None)

    rx = Prescription(
        id=img_id, image_path=str(img_path), image_sha256=norm.sha256,
        model=_reader.model, prompt_version=PROMPT_VERSION,
        effort=getattr(inner, "effort", None),
        raw_response=json.dumps(getattr(inner, "last_raw_response", None)),
        page_read_json=page.model_dump_json(),
        resolved_json=json.dumps([_med_out(i, m).model_dump()
                                  for i, m in enumerate(meds)]),
        document_type=page.document_type,
        overall_legibility=page.overall_legibility,
        patient_name=page.patient_name, prescriber_name=page.prescriber_name,
        prescribed_date=page.date,
        cost_usd=cost.usd if cost else 0.0,
        from_cache=isinstance(_reader, CachedPageReader) and cost is None,
    )
    db.add(rx)
    db.add(InteractionRun(
        prescription_id=rx.id, overall_risk=result["overall_risk"],
        total_count=result["total_count"], result_json=json.dumps(result),
    ))
    db.commit()
    db.refresh(rx)
    return _to_out(rx)


@app.get("/api/prescriptions", response_model=List[PrescriptionOut])
def list_prescriptions(
    limit: int = Query(20, ge=1, le=100), offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(Prescription).order_by(Prescription.created_at.desc())
        .offset(offset).limit(limit).all()
    )
    return [_to_out(r) for r in rows]


@app.get("/api/prescriptions/{prescription_id}", response_model=PrescriptionOut)
def get_prescription(prescription_id: str, db: Session = Depends(get_db)):
    rx = db.get(Prescription, prescription_id)
    if not rx:
        raise HTTPException(404, "Prescription not found")
    return _to_out(rx)


@app.post("/api/prescriptions/{prescription_id}/corrections")
def add_correction(
    prescription_id: str, body: CorrectionIn, db: Session = Depends(get_db)
):
    """Record one doctor edit.

    This is the training corpus (§8.3) and the clinical audit trail. The
    predicted value is read from the stored result rather than trusted from the
    client, so before/after is always the model's actual output.
    """
    rx = db.get(Prescription, prescription_id)
    if not rx:
        raise HTTPException(404, "Prescription not found")

    meds = json.loads(rx.resolved_json)
    predicted, conf, score, outcome, verification = None, None, None, None, None
    if 0 <= body.medicine_index < len(meds):
        m = meds[body.medicine_index]
        predicted = str(m.get(body.field))
        conf, score = m.get("confidence"), m.get("match_score")
        outcome, verification = m.get("outcome"), m.get("verification")

    c = Correction(
        prescription_id=rx.id, medicine_index=body.medicine_index,
        field=body.field, predicted_value=predicted,
        corrected_value=body.corrected_value,
        correction_type=body.correction_type, model_confidence=conf,
        match_score=score, outcome=outcome, verification=verification,
        corrected_by=body.corrected_by, note=body.note,
    )
    db.add(c)

    # Apply the edit so the UI reflects it immediately.
    if 0 <= body.medicine_index < len(meds):
        meds[body.medicine_index][body.field] = body.corrected_value
        rx.resolved_json = json.dumps(meds)
    db.commit()
    return {"ok": True, "correction_id": c.id}


@app.post("/api/prescriptions/{prescription_id}/review")
def mark_reviewed(
    prescription_id: str, reviewed_by: str = "doctor", db: Session = Depends(get_db)
):
    """Confirm a page. An unchanged page is a fully labelled page — the majority
    class — and is worthless to a later training run if only edits are stored."""
    rx = db.get(Prescription, prescription_id)
    if not rx:
        raise HTTPException(404, "Prescription not found")
    rx.reviewed_at = datetime.now(timezone.utc)
    rx.reviewed_by = reviewed_by
    db.commit()
    return {"ok": True, "reviewed_at": rx.reviewed_at.isoformat()}


class InteractionCheckIn(BaseModel):
    medicines: List[str] = Field(description="Generic/molecule names")


@app.post("/api/interactions/check", response_model=InteractionOutcome)
def check_interactions(body: InteractionCheckIn):
    """Ad-hoc lookup against the 180-rule table.

    Takes GENERIC names — this path bypasses S2/S3, so the caller is asserting
    the names are correct. The prescription pipeline never uses it; it exists
    for the manual lookup screen.
    """
    if len([m for m in body.medicines if m.strip()]) < 2:
        return InteractionOutcome(medicines_checked=body.medicines)
    return InteractionOutcome(**_checker.check(body.medicines))


@app.get("/api/stats")
def stats(db: Session = Depends(get_db)):
    total = db.query(Prescription).count()
    reviewed = db.query(Prescription).filter(Prescription.reviewed_at.isnot(None)).count()
    corrections = db.query(Correction).count()
    meds = confirmed = 0
    for (blob,) in db.query(Prescription.resolved_json).all():
        rows = json.loads(blob)
        meds += len(rows)
        confirmed += sum(1 for m in rows if m["outcome"] in ("confirmed", "probable"))
    guard = get_guard()
    return {
        "total_prescriptions": total,
        "reviewed": reviewed,
        "total_medicines": meds,
        # Coverage is the honest headline number for a system that may abstain.
        "coverage": round(confirmed / meds, 3) if meds else 0.0,
        "corrections_logged": corrections,
        "spend_usd": round(guard.total_usd(), 4),
        "spend_remaining_usd": round(guard.remaining_usd(), 4),
    }


@app.get("/api/corrections")
def list_corrections(limit: int = Query(100, ge=1, le=1000), db: Session = Depends(get_db)):
    """The training corpus so far. Also how you check the log is complete
    before trusting any calibration run (§16.6 step 1)."""
    rows = db.query(Correction).order_by(Correction.created_at.desc()).limit(limit).all()
    return [
        {
            "id": c.id, "prescription_id": c.prescription_id,
            "medicine_index": c.medicine_index, "field": c.field,
            "predicted_value": c.predicted_value,
            "corrected_value": c.corrected_value,
            "correction_type": c.correction_type.value,
            "model_confidence": c.model_confidence, "match_score": c.match_score,
            "outcome": c.outcome, "verification": c.verification,
            "corrected_by": c.corrected_by,
            "created_at": c.created_at.isoformat() if c.created_at else "",
        }
        for c in rows
    ]


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
