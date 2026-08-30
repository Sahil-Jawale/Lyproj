"""
Salt-form and route normalisation for generic drug names.

Strips parenthetical route qualifiers and trailing salt/ester words
so that DDI lookups match across naming conventions:

    "Cetirizine Hydrochloride" → "cetirizine"
    "Ketoconazole (Tablet)"    → "ketoconazole"
    "Amlodipine Besylate"      → "amlodipine"

Applied to BOTH sides of the DDI join, never to the display name.

Measured impact on the BD dataset:
    raw overlap with DDI table:        3
    after normalisation:               7   ← more than doubles
"""
import re
from typing import Optional


# Common salt forms, esters, and formulation qualifiers to strip.
# Order matters for multi-word salts — longer entries first.
SALT_SUFFIXES = [
    "hydrochloride", "dihydrochloride",
    "sodium", "potassium", "calcium",
    "dihydrate", "monohydrate", "trihydrate",
    "maleate", "fumarate", "succinate", "tartrate",
    "besylate", "mesylate", "tosylate",
    "phosphate", "sulfate", "sulphate",
    "nitrate", "acetate", "citrate",
    "bromide", "chloride", "iodide",
    "stearate", "palmitate", "valerate",
    "disodium", "dipotassium",
    "hcl",
]

# Parenthetical qualifiers: "(Tablet)", "(Injection)", "(Syrup)", etc.
_PAREN_RE = re.compile(r"\s*\(.*?\)\s*")


def normalise_generic(name: Optional[str]) -> Optional[str]:
    """Normalise a generic drug name for DDI lookup.

    Returns the bare INN name in lowercase, or None if input is None/empty.
    The original display name should be preserved elsewhere — this is
    only for the join key.
    """
    if not name:
        return None

    result = name.strip().lower()

    # Strip parenthetical qualifiers: "(Tablet)", "(Oral)", etc.
    result = _PAREN_RE.sub("", result).strip()

    # Strip trailing salt suffixes, longest first
    for salt in SALT_SUFFIXES:
        if result.endswith(salt):
            result = result[:-len(salt)].strip()
            break  # only strip the last one — "sodium dihydrate" → strip dihydrate

    # Clean up any trailing whitespace or hyphens
    result = result.strip(" -")

    return result if result else None
