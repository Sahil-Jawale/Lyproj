"""
Generic drug-name normalisation.  (docs/ARCHITECTURE_V2.md §5/S3, join B)

Both sides of the brand->generic->interaction join spell drugs differently:

    dataset generics carry salts and routes : "Cetirizine Hydrochloride", "Ketoconazole (Tablet)"
    the DDI table carries bare INN names    : "Cetirizine",               "Ketoconazole"

Measured on the shipped data, normalising both sides takes the overlap from
3 drugs to 7 — it more than doubles the join for pure string work.

Two things string normalisation CANNOT fix, handled separately below:

  * Synonyms. "Paracetamol" (INN) and "Acetaminophen" (USAN) are the same drug
    with zero string similarity. Needs a real synonym table.
  * Class-level rows. The DDI table has exactly one ("ACE Inhibitors (e.g.,
    Lisinopril)") — a smaller problem than first assumed, but still a row that
    can never match a specific generic unless its member is extracted.

SCOPE OF THE SYNONYM TABLE BELOW: it is deliberately tiny and restricted to
INN<->USAN pairs, which are a well-defined published correspondence rather than
clinical judgement. It is NOT a substitute for RxNorm/RxNav, which is the real
answer (§5.3.2 step 3). Do not grow it by recall — every addition should come
from a registry.
"""

from __future__ import annotations

import re
from typing import Optional

# Salt / ester / hydrate forms. These qualify a generic, they do not change
# which drug it is, so they are noise for the purpose of an interaction lookup.
_SALT_WORDS = {
    "hydrochloride", "hcl", "sodium", "potassium", "calcium", "magnesium",
    "sulphate", "sulfate", "phosphate", "nitrate", "acetate", "maleate",
    "tartrate", "succinate", "fumarate", "citrate", "besylate", "mesylate",
    "tosylate", "oxalate", "malate", "gluconate", "carbonate", "bromide",
    "chloride", "dihydrate", "monohydrate", "trihydrate", "anhydrous",
    "hemihydrate", "hydrate", "dipropionate", "propionate", "valerate",
    "furoate", "xinafoate", "bitartrate", "hydrobromide", "lactate",
}

# Anything in parentheses on a generic name in this data is a route or form
# qualifier: "Ketoconazole (Cream)", "Azithromycin Dihydrate (Ophthalmic)".
_PAREN_RE = re.compile(r"\s*\([^)]*\)")

# INN <-> USAN pairs. A published correspondence, not a clinical judgement.
# Keys and values are stored casefolded; the table is symmetric at load time.
_SYNONYM_PAIRS = [
    ("paracetamol", "acetaminophen"),
    ("salbutamol", "albuterol"),
    ("adrenaline", "epinephrine"),
    ("noradrenaline", "norepinephrine"),
    ("frusemide", "furosemide"),
    ("lignocaine", "lidocaine"),
    ("rifampicin", "rifampin"),
    ("ciclosporin", "cyclosporine"),
    ("glibenclamide", "glyburide"),
    ("pethidine", "meperidine"),
]

SYNONYMS: dict[str, str] = {}
for _a, _b in _SYNONYM_PAIRS:
    # Canonical form is whichever sorts first, so the mapping is stable and
    # direction-independent.
    _canon = min(_a, _b)
    SYNONYMS[_a] = _canon
    SYNONYMS[_b] = _canon


def strip_qualifiers(name: str) -> str:
    """Remove route/form parentheticals and trailing salt words.

    "Ketoconazole (Tablet)"       -> "ketoconazole"
    "Cetirizine Hydrochloride"    -> "cetirizine"
    "Azithromycin Dihydrate (Ophthalmic)" -> "azithromycin"
    """
    s = _PAREN_RE.sub("", name or "").strip()
    parts = s.split()
    # Salts appear at the end. Strip repeatedly: "X Sodium Dihydrate".
    while len(parts) > 1 and parts[-1].casefold().strip(".,") in _SALT_WORDS:
        parts.pop()
    return " ".join(parts).casefold().strip()


def extract_class_member(name: str) -> Optional[str]:
    """Pull the example drug out of a class-level row.

    "ACE Inhibitors (e.g., Lisinopril)" -> "lisinopril"

    Returns None when the parenthetical is not an example (routes and forms
    are qualifiers, not members).
    """
    m = re.search(r"\(\s*e\.?g\.?,?\s*([^)]+)\)", name or "", re.IGNORECASE)
    if not m:
        return None
    return normalise_generic(m.group(1).split(",")[0])


def normalise_generic(name: str) -> str:
    """Canonical key for a generic drug name. Use on BOTH sides of any join."""
    base = strip_qualifiers(name)
    if not base:
        return ""
    return SYNONYMS.get(base, base)


def normalise_variants(name: str) -> list[str]:
    """Every key a name should be indexed under.

    Combination products ("Vitamin B Complex + Zinc", "Ofloxacin + Ornidazole")
    are indexed under the whole string AND each component, because an
    interaction may be recorded against a single component.
    """
    out: list[str] = []
    whole = normalise_generic(name)
    if whole:
        out.append(whole)

    for part in re.split(r"\s*[+/]\s*", name or ""):
        key = normalise_generic(part)
        if key and key not in out:
            out.append(key)

    member = extract_class_member(name)
    if member and member not in out:
        out.append(member)

    return out


if __name__ == "__main__":
    samples = [
        "Cetirizine Hydrochloride",
        "Ketoconazole (Tablet)",
        "Azithromycin Dihydrate (Ophthalmic)",
        "Montelukast Sodium",
        "Paracetamol",
        "Acetaminophen",
        "Vitamin B Complex + Zinc",
        "ACE Inhibitors (e.g., Lisinopril)",
        "Warfarin",
    ]
    print(f"{'input':38} {'normalised':24} variants")
    print("-" * 92)
    for s in samples:
        print(f"{s:38} {normalise_generic(s):24} {normalise_variants(s)}")
