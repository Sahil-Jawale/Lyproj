"""
PrescriptAI — Shared Pipeline Schemas
Single source of truth for every stage boundary.
Commit as 'feat: shared pipeline schemas' before anyone writes track code.
"""
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
    brand: Optional[str] = None          # canonical brand name, None if ILLEGIBLE
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
