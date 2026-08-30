"""
Brand → Generic normalisation (S3).

Loads a brand→generic map from CSV and exposes:
  - to_generic(brand) → Optional[str]   — with the safety gate
  - attach_generics(meds) → List[ResolvedMedicine]  — pipeline helper

Hard safety rule (enforced in code, not by convention):
  A pair is used only when row.verified == True.
  Unverified rows never reach the DDI layer.
"""
import os
import csv
from typing import Optional, List, Dict, NamedTuple

from .salt_normalise import normalise_generic


# ── B4: Synonyms that string normalisation cannot fix ─────────────────
# Paracetamol (BD/UK/India) == Acetaminophen (US/DDI table). Same drug,
# zero string similarity. RxNorm comes later; this dict is correct for now.
SYNONYMS: Dict[str, str] = {
    "paracetamol": "acetaminophen",
    "acetaminophen": "paracetamol",
    # Add more as encountered:
    "adrenaline": "epinephrine",
    "epinephrine": "adrenaline",
    "salbutamol": "albuterol",
    "albuterol": "salbutamol",
}


# ── Brand→Generic Map ─────────────────────────────────────────────────

class BrandRow(NamedTuple):
    generic: str
    source: str
    verified: bool


# Module-level map — loaded once
_MAP: Dict[str, BrandRow] = {}
_LOADED = False


def _load_map() -> None:
    """Load brand_generic_map.csv into _MAP. Called once on first use."""
    global _MAP, _LOADED
    if _LOADED:
        return

    csv_path = os.path.join(
        os.path.dirname(os.path.abspath(__file__)),
        "..", "data", "brand_generic_map.csv"
    )

    if not os.path.exists(csv_path):
        print(f"[S3] WARNING: brand_generic_map.csv not found at {csv_path}")
        _LOADED = True
        return

    with open(csv_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            brand_key = row["brand"].strip().lower()
            verified = row.get("verified", "false").strip().lower() == "true"
            _MAP[brand_key] = BrandRow(
                generic=row["generic"].strip(),
                source=row.get("source", "unknown"),
                verified=verified,
            )

    print(f"[S3] Loaded {len(_MAP)} brand->generic pairs "
          f"({sum(1 for r in _MAP.values() if r.verified)} verified)")
    _LOADED = True


# ── B5: The safety gate ───────────────────────────────────────────────

def to_generic(brand: str) -> Optional[str]:
    """Convert a brand name to its normalised generic (INN) name.

    Returns None if:
      - the brand is not in the map, OR
      - the mapping is not verified (row.verified == False)

    This is the hard safety rule: unverified pairs never reach the DDI layer.
    """
    _load_map()
    row = _MAP.get(brand.strip().lower())
    if row is None or not row.verified:
        return None
    return normalise_generic(row.generic)


def get_synonyms(generic: str) -> List[str]:
    """Return known synonyms for a normalised generic name.

    For DDI lookup: check both the original and all synonyms against
    the interaction graph.
    """
    normalised = normalise_generic(generic)
    if not normalised:
        return []
    synonym = SYNONYMS.get(normalised)
    if synonym:
        return [normalised, synonym]
    return [normalised]


# ── B2/Pipeline helper ────────────────────────────────────────────────

def attach_generics(meds: list) -> list:
    """Attach generic names to a list of ResolvedMedicine objects.

    For each medicine with a resolved brand name, looks up the generic
    and sets med.generic. Leaves med.generic as None if not found or
    not verified — this is the safety gate working as designed.
    """
    for med in meds:
        if med.brand and med.generic is None:
            med.generic = to_generic(med.brand)
    return meds
