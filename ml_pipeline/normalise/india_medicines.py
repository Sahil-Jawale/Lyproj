"""
Indian medicine vocabulary, brand→composition, and NLEM verification.
(docs/ARCHITECTURE_V2.md §5/S2, §5/S3)

Replaces the Bangladeshi 1,440-name list, which was the wrong region entirely.

DATA
----
  india/indian_medicines_master.csv   239,640 brands, zero nulls, clean.
                                      Brand Name, Composition, Strength, Form, Manufacturer
  india/nlem2022_formulations.csv     NLEM 2022: 241 molecules + 63 aliases
  india/nlem_verified_medicines.csv   40,451 brands pre-joined to NLEM codes

VERIFICATION IS PER INGREDIENT
------------------------------
NLEM is India's *essential medicines* list and is deliberately selective. Absent
from NLEM means "not on the national essential list", NOT "not a real drug" —
Ofloxacin and Aceclofenac are both genuinely absent. So a combination product is
usually part-verified, and the honest thing is to say which component is which:

    Azenac MR = Aceclofenac + Paracetamol
                ^ unverified   ^ verified   ->  PARTIAL

Only verified ingredients enter the interaction check, because that is the one
place a wrong mapping becomes a wrong SAFETY VERDICT. Everything else is shown
to the reviewer with the unverified components named.

FOUR DATA ISSUES THIS MODULE FIXES (all measured, see the journal)
-----------------------------------------------------------------
  1. Strength is embedded in Brand Name ("Crocin 1000mg"), so a single brand
     list cannot match both "ZOFER" and "Dolo 650". We build TWO indices and
     take the better score.
  2. 1.2% of base brands map to >1 composition ("A Rex" is Hydroxyzine at 10mg
     but Diphenhydramine + Ammonium Chloride plain). Stripping strength is
     lossy, so a full-name match always wins over a base-name match, and a
     base-name match onto a multi-composition brand is flagged ambiguous.
  3. Brand-name crowding puts 19% of readings within the ambiguity margin — but
     78% of those collisions are the SAME composition. Comparing compositions
     instead of brand strings cuts reviewer burden to ~4%. (`same_composition`)
  4. The master file and the NLEM file use different brand conventions
     ("A 250" vs "Biopurin 50mg Tablet"). Joining naively loses 94% of the
     match. Both sides are normalised before joining.
"""

from __future__ import annotations

import re
import sys
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from normalise.drug_names import normalise_generic  # noqa: E402
from schemas import VerificationTier  # noqa: E402

_ML_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = _ML_DIR / "data" / "india"
MASTER_CSV = DATA_DIR / "indian_medicines_master.csv"
NLEM_FORMULATIONS_CSV = DATA_DIR / "nlem2022_formulations.csv"

# Dosage forms that appear as a trailing word on brand names.
_FORM_WORDS = (
    r"Tablet(?:s)?(?:\s+(?:SR|DT|MR|XR|ER|CR))?|Capsule(?:s)?|Injection|Syrup|"
    r"Oral\s+Suspension|Suspension|Cream|Ointment|Gel|Drops?|Solution|Lotion|"
    r"Powder|Sachet|Inhaler|Respules?|Kit|Spray|Eye\s+Drops?|Infusion|Granules"
)
_FORM_RE = re.compile(rf"\s+(?:{_FORM_WORDS})\s*$", re.IGNORECASE)
# Trailing strength: "1000mg", "5 mg/10 mg", "0.75% w/w", "2mg/ml"
_STRENGTH_RE = re.compile(
    r"\s*\d[\d\.\,]*\s*(?:mg|mcg|g|ml|iu|%|w/w|w/v)?"
    r"(?:\s*/\s*\d[\d\.\,]*\s*(?:mg|mcg|g|ml|iu|%|w/w|w/v)?)*\s*$",
    re.IGNORECASE,
)


_PUNCT_RE = re.compile(r"[^a-z0-9]+")


def match_key(name: str) -> str:
    """Case-folded, punctuation-flattened key used for ALL fuzzy matching.

    Indian brand names use hyphen, dot and space interchangeably — "Meftal-P"
    and "Meftal P", "Azenac-MR" and "Azenac MR" are the same product. Measured:
    without this, "AZENAC-MR" scores 89 against BOTH "Azenac MR" (correct,
    Aceclofenac + Paracetamol) and "Acenac-MR" (a DIFFERENT drug,
    Thiocolchicoside + Aceclofenac) — a tie that ranks the wrong drug first and
    forces a needless human decision. Flattened, the correct match scores 100
    and the margin is decisive.
    """
    return _PUNCT_RE.sub(" ", (name or "").casefold()).strip()


def base_brand(name: str) -> str:
    """Strip a trailing form word and trailing strength. Idempotent-ish.

    "Azenac MR Tablet" -> "Azenac MR"      (MR is part of the brand, kept)
    "Crocin 1000mg"    -> "Crocin"
    "Dolo 650"         -> "Dolo"
    """
    s = (name or "").strip()
    prev = None
    while prev != s:
        prev = s
        s = _FORM_RE.sub("", s).strip()
        s = _STRENGTH_RE.sub("", s).strip()
    return s or (name or "").strip()


@dataclass(frozen=True)
class BrandInfo:
    brand: str
    composition: str
    ingredients: Tuple[str, ...]
    strength: str = ""
    form: str = ""
    manufacturer: str = ""


@dataclass
class Verification:
    verified: List[str] = field(default_factory=list)
    unverified: List[str] = field(default_factory=list)

    @property
    def tier(self) -> VerificationTier:
        if not self.verified and not self.unverified:
            return VerificationTier.UNKNOWN
        if not self.unverified:
            return VerificationTier.VERIFIED
        if not self.verified:
            return VerificationTier.UNVERIFIED
        return VerificationTier.PARTIAL


def split_ingredients(composition: str) -> List[str]:
    """'Aceclofenac + Paracetamol' -> ['Aceclofenac', 'Paracetamol']"""
    if not composition:
        return []
    return [p.strip() for p in re.split(r"\s*\+\s*", composition) if p.strip()]


class IndiaMedicines:
    """Brand vocabulary + composition lookup + NLEM verification."""

    def __init__(
        self,
        master_csv: Path = MASTER_CSV,
        nlem_csv: Path = NLEM_FORMULATIONS_CSV,
    ):
        import pandas as pd

        if not Path(master_csv).exists():
            raise FileNotFoundError(
                f"Medicine dataset not found at {master_csv}. S2/S3 cannot run."
            )

        df = pd.read_csv(master_csv, dtype=str).fillna("")

        self._by_full: Dict[str, BrandInfo] = {}
        self._by_base: Dict[str, List[BrandInfo]] = {}

        for brand, comp, strength, form, mfr in zip(
            df["Brand Name"], df["Composition"], df["Strength"],
            df["Form"], df["Manufacturer"],
        ):
            brand = brand.strip()
            if not brand:
                continue
            info = BrandInfo(
                brand=brand,
                composition=comp.strip(),
                ingredients=tuple(split_ingredients(comp)),
                strength=strength.strip(),
                form=form.strip(),
                manufacturer=mfr.strip(),
            )
            self._by_full.setdefault(match_key(brand), info)
            self._by_base.setdefault(match_key(base_brand(brand)), []).append(info)

        # Two parallel index lists for fuzzy matching (issue 1).
        self.full_keys: Tuple[str, ...] = tuple(self._by_full)
        self.full_names: Tuple[str, ...] = tuple(i.brand for i in self._by_full.values())
        self.base_keys: Tuple[str, ...] = tuple(self._by_base)
        self.base_names: Tuple[str, ...] = tuple(
            v[0].brand and base_brand(v[0].brand) for v in self._by_base.values()
        )

        # Prescriptions are often written in GENERICS, not brands — hospital
        # cards especially ("Inj. Diclofenac 75mg"), and Indian policy actively
        # encourages generic prescribing. Matching brands only made every such
        # prescription fail. 1,679 distinct ingredients, indexed the same way.
        ingredients: Dict[str, str] = {}
        for info in self._by_full.values():
            for ing in info.ingredients:
                ingredients.setdefault(match_key(ing), ing)
        self._ingredients = ingredients
        self.ingredient_keys: Tuple[str, ...] = tuple(ingredients)
        self.ingredient_names: Tuple[str, ...] = tuple(ingredients.values())

        self.nlem_keys = self._load_nlem(nlem_csv)

    # ── NLEM ─────────────────────────────────────────────────────────────

    @staticmethod
    def _load_nlem(path: Path) -> frozenset:
        import pandas as pd

        if not Path(path).exists():
            raise FileNotFoundError(
                f"NLEM list not found at {path}. Verification cannot run, and "
                f"without it every mapping would be treated as unverified."
            )
        f = pd.read_csv(path, dtype=str).fillna("")
        keys = set()
        for mol in f["molecule"]:
            k = normalise_generic(mol)
            if k:
                keys.add(k)
        for aliases in f["aliases"]:
            for a in re.split(r"[;,]", aliases):
                k = normalise_generic(a)
                if k:
                    keys.add(k)
        return frozenset(keys)

    def verify_ingredients(self, ingredients: Sequence[str]) -> Verification:
        """Split ingredients into NLEM-verified and not. Order preserved."""
        v = Verification()
        for ing in ingredients:
            (v.verified if normalise_generic(ing) in self.nlem_keys else v.unverified).append(
                ing
            )
        return v

    # ── lookup ───────────────────────────────────────────────────────────

    def lookup(self, brand: Optional[str]) -> Optional[BrandInfo]:
        """Exact lookup: full name first, then base name (issue 2).

        A base-name hit that spans multiple compositions returns None — the
        strength that distinguishes them was thrown away, so we do not guess.
        """
        if not brand:
            return None
        key = match_key(brand)
        if key in self._by_full:
            return self._by_full[key]

        hits = self._by_base.get(match_key(base_brand(brand)))
        if not hits:
            return None
        if len({h.composition for h in hits}) > 1:
            return None  # ambiguous without the strength — caller must ask
        return hits[0]

    def ingredient(self, name: Optional[str]) -> Optional[str]:
        """Canonical ingredient name, for a prescription written in generics."""
        if not name:
            return None
        return self._ingredients.get(match_key(name))

    def compositions_for(self, brand: Optional[str]) -> List[str]:
        """Every composition a brand string could refer to (for issue 3)."""
        if not brand:
            return []
        key = match_key(brand)
        if key in self._by_full:
            return [self._by_full[key].composition]
        return sorted({h.composition for h in self._by_base.get(match_key(base_brand(brand)), [])})

    def same_composition(self, brands: Sequence[str]) -> bool:
        """True when every candidate brand resolves to the same drug.

        This is issue 3: 78% of brand-name collisions are the same composition,
        so they are not real ambiguity and should not cost a human a click.
        """
        seen = set()
        for b in brands:
            comps = self.compositions_for(b)
            if not comps:
                return False
            seen.update(comps)
            if len(seen) > 1:
                return False
        return len(seen) == 1

    def stats(self) -> dict:
        return {
            "brands_full": len(self._by_full),
            "brands_base": len(self._by_base),
            "ingredients": len(self._ingredients),
            "nlem_keys": len(self.nlem_keys),
        }


@lru_cache(maxsize=1)
def get_medicines() -> IndiaMedicines:
    """Process-wide singleton; the CSV load takes a second or two."""
    return IndiaMedicines()


if __name__ == "__main__":
    import time

    t0 = time.time()
    med = get_medicines()
    print(f"loaded in {time.time()-t0:.1f}s   {med.stats()}\n")

    print(f"{'brand':16}{'composition':38}{'tier':11}unverified")
    print("-" * 88)
    for probe in ["Crocin 1000mg", "Crocin", "Zofer", "Dolo 650", "Azenac MR",
                  "Oflazest 200mg", "Ephedrex", "Pantop", "A Rex"]:
        info = med.lookup(probe)
        if not info:
            print(f"{probe:16}{'(ambiguous or unknown)':38}{'-':11}")
            continue
        v = med.verify_ingredients(info.ingredients)
        print(f"{probe:16}{info.composition[:36]:38}{v.tier.value:11}{', '.join(v.unverified)}")

    print(f"\nsame_composition(['Oflazest 200mg','Oflaset OZ']) = "
          f"{med.same_composition(['Oflazest 200mg','Oflaset OZ'])}   <- harmless collision")
    print(f"same_composition(['Rolay 20mg','Olay 20mg'])       = "
          f"{med.same_composition(['Rolay 20mg','Olay 20mg'])}   <- genuinely dangerous")
