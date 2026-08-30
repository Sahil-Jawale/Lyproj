"""
Persistence.  (docs/ARCHITECTURE_V2.md §8.3, §16.3)

Three tables. The second one is the important one.

`prescriptions` and `interactions` are ordinary application state. `corrections`
is the training corpus — every doctor edit is a labelled example on a real page,
in our exact target domain, produced as a byproduct of normal use. At ~100
prescriptions/week that is ~5,000 labelled pages a year, free. It is also the
clinical audit trail, which is why it is justified on today's merits alone and
not scaffolding for a future feature.

FIVE FIELDS THAT ARE UNRECOVERABLE IF NOT CAPTURED AT WRITE TIME (§16.3):

  1. `raw_response`      — the model's full reply, not just the parsed PageRead.
                           Without it, T2 preference pairs cannot be built.
  2. `model` / `prompt_version` / `effort` — without these, no correction is
                           attributable to a configuration and every later
                           comparison is uninterpretable.
  3. `page_read_json`    — carries per-line `confidence` and `alternatives`,
                           which are the input features for T0 threshold
                           calibration.
  4. before AND after    — `predicted_value` and `corrected_value`, never a diff.
                           The model's wrong answer is as informative as the
                           right one.
  5. `correction_type`   — misread / hallucinated / missed / wrong_field. This is
                           the reward signal, and it costs one dropdown.

A page a doctor passes UNCHANGED is also a label — the majority class — so
confirmations are recorded too, via `Prescription.reviewed_at`.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import relationship

from config.database import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)


class CorrectionType(str, enum.Enum):
    """Why the doctor changed something. The reward signal for T0/T2."""

    MISREAD = "misread"            # model read the wrong characters
    HALLUCINATED = "hallucinated"  # model reported something not on the page
    MISSED = "missed"              # model failed to report something present
    WRONG_FIELD = "wrong_field"    # right drug, wrong dosage/frequency/duration
    OTHER = "other"


class Prescription(Base):
    __tablename__ = "prescriptions"

    id = Column(String, primary_key=True, default=_uuid)
    created_at = Column(DateTime(timezone=True), default=_now, nullable=False)

    image_path = Column(String, nullable=False)
    image_sha256 = Column(String, index=True)

    # Configuration provenance — field 2. Without these the row is unusable
    # for any later comparison.
    model = Column(String, nullable=False)
    prompt_version = Column(String, nullable=False)
    effort = Column(String)

    # Field 1 and 3: the full raw reply and the parsed read, both kept.
    raw_response = Column(Text)
    page_read_json = Column(Text, nullable=False)
    resolved_json = Column(Text, nullable=False)

    document_type = Column(String)
    overall_legibility = Column(Float)
    patient_name = Column(String)
    prescriber_name = Column(String)
    prescribed_date = Column(String)

    cost_usd = Column(Float, default=0.0)
    from_cache = Column(Boolean, default=False)

    # A page confirmed unchanged is a fully labelled page — the majority class,
    # and worthless to a later training run if we only ever store edits.
    reviewed_at = Column(DateTime(timezone=True))
    reviewed_by = Column(String)

    corrections = relationship(
        "Correction", back_populates="prescription", cascade="all, delete-orphan"
    )
    interaction_runs = relationship(
        "InteractionRun", back_populates="prescription", cascade="all, delete-orphan"
    )


class Correction(Base):
    """One doctor edit. The unit of the training corpus."""

    __tablename__ = "corrections"

    id = Column(String, primary_key=True, default=_uuid)
    prescription_id = Column(
        String, ForeignKey("prescriptions.id", ondelete="CASCADE"), index=True
    )
    created_at = Column(DateTime(timezone=True), default=_now, nullable=False)

    medicine_index = Column(Integer)          # -1 for page-level fields
    field = Column(String, nullable=False)    # brand | dosage | frequency | ...

    # Field 4: full before AND after, never a diff.
    predicted_value = Column(Text)
    corrected_value = Column(Text)

    # Field 5: the reward signal.
    correction_type = Column(
        Enum(CorrectionType), default=CorrectionType.OTHER, nullable=False
    )

    # Snapshot of what the model believed at the time, so a later calibration
    # run does not have to re-derive it from the page JSON.
    model_confidence = Column(Float)
    match_score = Column(Float)
    outcome = Column(String)
    verification = Column(String)

    corrected_by = Column(String, default="doctor")
    note = Column(Text)

    prescription = relationship("Prescription", back_populates="corrections")


class InteractionRun(Base):
    """Result of one safety check. Kept for audit, not for training."""

    __tablename__ = "interaction_runs"

    id = Column(String, primary_key=True, default=_uuid)
    prescription_id = Column(
        String, ForeignKey("prescriptions.id", ondelete="CASCADE"), index=True
    )
    created_at = Column(DateTime(timezone=True), default=_now, nullable=False)

    overall_risk = Column(String)
    total_count = Column(Integer, default=0)
    result_json = Column(Text, nullable=False)

    prescription = relationship("Prescription", back_populates="interaction_runs")
