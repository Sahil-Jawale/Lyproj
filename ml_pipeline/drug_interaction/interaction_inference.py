"""
S4 — Interaction inference.  (docs/ARCHITECTURE_V2.md §5/S4, §8)

Takes what S2/S3 were willing to claim and checks it against the knowledge graph.

THE RULE THAT MATTERS
---------------------
Only CONFIRMED and PROBABLE medicines enter the check. An AMBIGUOUS or ILLEGIBLE
reading must NEVER silently participate in a drug-safety check — and skipping it
must be VISIBLE, which is why `skipped` is a populated field rather than an
absence. "We checked 4 of 6 medicines" and "we checked 6 medicines" are very
different claims to put in front of a clinician.

A medicine with no resolved generic is also skipped: S3 returns None for an
unverified mapping, and checking an unverified mapping is how a wrong safety
verdict gets produced.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Union

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from .build_knowledge_graph import DrugInteractionGraph  # noqa: E402


class InteractionChecker:
    def __init__(self, dataset_path: Optional[str] = None, quiet: bool = False):
        self.graph = DrugInteractionGraph(dataset_path, quiet=quiet)

    def check(self, medicines: Sequence[Union[str, object]]) -> Dict:
        """Accepts a list of ResolvedMedicine, or plain strings for ad-hoc use.

        Plain strings are treated as already-eligible generic names — that path
        exists for tests and the /api/interactions/check endpoint, not for the
        prescription pipeline.
        """
        checked: List[str] = []
        skipped: List[str] = []
        display: Dict[str, str] = {}  # generic key -> what to show the user

        for med in medicines:
            if isinstance(med, str):
                if med.strip():
                    checked.append(med.strip())
                    display[med.strip()] = med.strip()
                continue

            label = med.brand or med.raw_reading or "(unreadable)"

            # 1. The pipeline was not willing to claim this reading.
            if not med.safe_for_interaction_check:
                skipped.append(f"{label} [{med.outcome.value}]")
                continue

            # 2. Per-ingredient gate. `checkable_ingredients` is the intersection
            #    of "reading accepted" and "ingredient is NLEM-verified". A
            #    combination product contributes only its verified components —
            #    Azenac MR checks Paracetamol but not Aceclofenac — because an
            #    unverified mapping is not a basis for a safety verdict.
            usable = med.checkable_ingredients
            if not usable:
                why = "no NLEM-verified ingredient" if med.ingredients else "unresolved"
                skipped.append(f"{label} [{why}]")
                continue

            for ing in usable:
                checked.append(ing)
                display[ing] = f"{ing} (in {label})" if len(med.ingredients) > 1 else label

            # 3. Unverified components of an otherwise usable medicine are named,
            #    never silently dropped — the reviewer must see what was NOT checked.
            for ing in med.unverified_ingredients:
                skipped.append(f"{ing} (in {label}) [not on NLEM list]")

        interactions = self.graph.check_all_interactions(checked)

        has_severe = any(
            i["severity"] in ("severe", "contraindicated") for i in interactions
        )
        has_moderate = any(i["severity"] == "moderate" for i in interactions)
        overall = (
            "severe" if has_severe
            else "moderate" if has_moderate
            else "minor" if interactions
            else "none"
        )

        return {
            "interactions": interactions,
            "total_count": len(interactions),
            "overall_risk": overall,
            "has_severe": has_severe,
            "has_moderate": has_moderate,
            "medicines_checked": [display.get(c, c) for c in checked],
            "skipped": skipped,
        }


if __name__ == "__main__":
    checker = InteractionChecker()
    print()
    for names in (
        ["Warfarin", "Ibuprofen"],
        ["Paracetamol", "Warfarin"],
        ["Sildenafil", "Nitroglycerin"],
        ["Cetirizine", "Paracetamol"],
    ):
        r = checker.check(names)
        print(f"{' + '.join(names):32} -> {r['overall_risk']:9} ({r['total_count']})")
        for i in r["interactions"]:
            print(f"      {i['severity'].upper()}: {i['effect']}")
            if i["reference"]:
                print(f"      ref: {i['reference'][:78]}")
