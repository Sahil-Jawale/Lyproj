"""
Shared pipeline contracts — the single source of truth for every stage boundary.

These types are the interface between the three tracks (see docs/DAY1_PLAN.md §2).
Nothing else in the pipeline should define its own version of these shapes.

Stage flow (docs/ARCHITECTURE_V2.md §4):

    S0 ingest ──► S1 VLM read ──► S2 vocab constraint ──► S3 brand→generic
                    PageRead        ResolvedMedicine         (generic filled)
                                          │
                                          ▼
                                    S4 DDI lookup ──► S5 doctor verification
                                    InteractionResult

Two rules that fall out of this file and are NOT negotiable:

  1. `ResolvedMedicine.raw_reading` is ALWAYS preserved, even when a vocabulary
     match overwrites the name. Losing what the model actually saw makes every
     later bug unfixable and blocks the correction log (§16.3).

  2. `InteractionResult.skipped` exists because an AMBIGUOUS or ILLEGIBLE
     medicine must NEVER silently participate in a safety check. Skipping has
     to be visible in the output, not implicit in its absence.
"""

from __future__ import annotations

from enum import Enum
from typing import List, Literal, Optional

from pydantic import BaseModel, Field

# ─────────────────────────────────────────────────────────────────────────────
# S1 — VLM page read
# ─────────────────────────────────────────────────────────────────────────────


class MedicineLine(BaseModel):
    """One prescription line as the VLM read it — verbatim, uncorrected.

    Correction happens downstream in S2 where it is auditable and reversible.
    See docs/ARCHITECTURE_V2.md §6.6: a spike run silently normalised "Dijoxin"
    to "Digoxin", which is exactly what this stage must not do.
    """

    line_index: int
    raw_text: str = Field(description="Verbatim, exactly as written on the page")
    drug_token: Optional[str] = Field(
        default=None, description="The substring believed to be the drug name"
    )
    alternatives: List[str] = Field(
        default_factory=list,
        description="Other readings seriously considered — the uncertainty channel",
    )
    dosage: Optional[str] = None
    frequency: Optional[str] = None
    duration: Optional[str] = None
    instructions: Optional[str] = None
    confidence: float = Field(ge=0.0, le=1.0)
    legible: bool
    bbox: Optional[List[float]] = Field(
        default=None,
        description="[x0,y0,x1,y1] normalised 0-1. Drives the review UI, not any crop.",
    )


class PageRead(BaseModel):
    """The complete S1 output for one page. Schema-guaranteed by the API.

    `document_type` is load-bearing: without a way to say "this is not a
    prescription", a model asked to list medicines will always list some.
    That is the LLaVA failure recorded in §6.6.
    """

    document_type: Literal["prescription", "not_a_prescription", "illegible"]
    patient_name: Optional[str] = None
    prescriber_name: Optional[str] = None
    date: Optional[str] = None
    medicines: List[MedicineLine] = Field(default_factory=list)
    unreadable_regions: List[str] = Field(
        default_factory=list,
        description="Plain-language notes, e.g. 'line 4 obscured by stamp'",
    )
    overall_legibility: float = Field(ge=0.0, le=1.0)


# ─────────────────────────────────────────────────────────────────────────────
# S2 — vocabulary constraint
# ─────────────────────────────────────────────────────────────────────────────


class VerificationTier(str, Enum):
    """How confident we are about WHAT DRUG a brand actually is.

    Orthogonal to `Outcome`, which is about how confident we are about what was
    WRITTEN. A perfectly legible brand can still be unverified, and a barely
    legible one can map to a well-known essential medicine. The reviewer needs
    both facts, so they are separate fields.

    Verification is per INGREDIENT, against the NLEM 2022 essential-medicines
    list. NLEM is deliberately selective (241 molecules), so "unverified" means
    "not on the national essential list" — NOT "not a real drug".
    """

    VERIFIED = "verified"      # every ingredient is on the NLEM list
    PARTIAL = "partial"        # some ingredients are; others are not
    UNVERIFIED = "unverified"  # no ingredient is on the list
    UNKNOWN = "unknown"        # brand not found in the medicines dataset at all


class Outcome(str, Enum):
    """What the pipeline is willing to claim about one medicine.

    Abstention is a first-class result. The prototype this replaces emitted a
    fake "Unrecognized" medicine entry — a failure state wearing the costume of
    a result. There is no such row any more.
    """

    CONFIRMED = "confirmed"  # high confidence, clean vocabulary match
    PROBABLE = "probable"    # accepted, but flagged for reviewer attention
    AMBIGUOUS = "ambiguous"  # narrowed to N candidates, needs a human choice
    UNMATCHED = "unmatched"  # READ CLEARLY, but not in our medicine database
    ILLEGIBLE = "illegible"  # genuinely could not read the handwriting

    # UNMATCHED vs ILLEGIBLE is a distinction that matters. Collapsing them
    # tells a doctor "could not read" about text the model read perfectly —
    # which is both false and makes a working system look broken. A 1921
    # apothecary prescription reading "Cocaine Hydrochlor" at confidence 0.78 is
    # not illegible; it is simply absent from a modern Indian formulary. The
    # doctor can read the name we surface and act on it.


class ResolvedMedicine(BaseModel):
    """One medicine after S2 (and S3, which fills `generic`)."""

    brand: Optional[str] = Field(
        default=None, description="Canonical brand name; None when ILLEGIBLE"
    )
    generic: Optional[str] = Field(
        default=None,
        description="Composition string from S3, e.g. 'Aceclofenac + Paracetamol'. "
        "None means the brand could not be resolved.",
    )
    ingredients: List[str] = Field(
        default_factory=list, description="Composition split into single ingredients"
    )
    verified_ingredients: List[str] = Field(
        default_factory=list,
        description="Ingredients on the NLEM list. ONLY these enter the DDI check — "
        "an unverified mapping is not a basis for a safety verdict.",
    )
    unverified_ingredients: List[str] = Field(
        default_factory=list,
        description="Ingredients absent from NLEM. Shown to the reviewer by name, "
        "never silently dropped.",
    )
    verification: VerificationTier = Field(
        default=VerificationTier.UNKNOWN,
        description="Per-ingredient NLEM verification tier. See VerificationTier.",
    )
    candidates: List[str] = Field(
        default_factory=list, description="Populated when AMBIGUOUS — pick-one-of-N"
    )
    dosage: Optional[str] = None
    frequency: Optional[str] = None
    duration: Optional[str] = None
    instructions: Optional[str] = None
    outcome: Outcome
    confidence: float = Field(ge=0.0, le=1.0)
    raw_reading: str = Field(
        description="The VLM's PRIMARY reading. Never dropped — see module docstring."
    )
    matched_via: Optional[str] = Field(
        default=None,
        description="Set only when an `alternatives` entry beat the primary reading. "
        "Records that the primary read was wrong and the uncertainty channel "
        "rescued it — a reviewer and the correction log both need to know.",
    )
    match_score: Optional[float] = Field(
        default=None, description="RapidFuzz score for the accepted match, 0-100"
    )
    bbox: Optional[List[float]] = None

    @property
    def safe_for_interaction_check(self) -> bool:
        """Whether this READING is solid enough to act on.

        Necessary but not sufficient: the DDI layer additionally requires
        NLEM-verified ingredients (see `checkable_ingredients`).
        """
        return self.outcome in (Outcome.CONFIRMED, Outcome.PROBABLE)

    @property
    def checkable_ingredients(self) -> List[str]:
        """Ingredients that may enter the interaction check.

        Both gates must pass: the reading was accepted AND the ingredient is
        NLEM-verified. This is the narrow path where a mistake becomes a wrong
        SAFETY VERDICT, so it is the one place we are deliberately strict.
        """
        if not self.safe_for_interaction_check:
            return []
        return list(self.verified_ingredients)

    @property
    def needs_hard_confirmation(self) -> bool:
        """True when a doctor must actively confirm before this is usable.

        Note this does NOT hide the reading — the result is always shown. It
        raises the strength of the ask, because a blocked screen helps nobody
        and the doctor is the safety net.
        """
        return (
            self.verification in (VerificationTier.UNVERIFIED, VerificationTier.UNKNOWN)
            or self.outcome in (Outcome.AMBIGUOUS, Outcome.UNMATCHED)
        )


# ─────────────────────────────────────────────────────────────────────────────
# S4 — drug-interaction lookup
# ─────────────────────────────────────────────────────────────────────────────


class Interaction(BaseModel):
    """One pairwise interaction, carrying its citation.

    `mechanism` / `safer_alternative` / `reference` are what make the output
    trustworthy to a clinician — surface them, do not hide them behind a
    severity dot (§9.2).
    """

    drug_a: str
    drug_b: str
    severity: str  # none | minor | moderate | severe | contraindicated
    severity_color: str
    mechanism: str = ""
    effect: str = ""
    safer_alternative: str = ""
    rationale: str = ""
    reference: str = ""


class InteractionResult(BaseModel):
    interactions: List[Interaction] = Field(default_factory=list)
    total_count: int = 0
    overall_risk: str = "none"
    medicines_checked: List[str] = Field(default_factory=list)
    skipped: List[str] = Field(
        default_factory=list,
        description="AMBIGUOUS/ILLEGIBLE readings excluded from the check. "
        "Never silently dropped — see module docstring.",
    )
