"""
S4 — Drug-interaction knowledge graph.  (docs/ARCHITECTURE_V2.md §5/S4, §9)

THE BUG THIS FILE FIXES
-----------------------
The previous loader globbed for `*.csv` in `data/ddi_dataset/`. The data is
`DDI Database.json`. The glob found nothing, the exception path was never taken,
and it silently fell through to `INTERACTION_DATA` — six hardcoded edges — while
the README advertised "200+ interaction rules". Nothing logged, nothing raised.

So the fix is not only "read the JSON". It is: **make a silent fallback
impossible.** This module now loads loudly, counts what it loaded, and raises
when a dataset it was pointed at cannot be read. A safety layer that quietly
degrades to 3% of its rules is worse than one that fails.

Lookups run on NORMALISED generic names (see normalise/drug_names.py) because
the two sides of the join spell drugs differently. That normalisation takes the
overlap with our dataset's generics from 3 drugs to 9.

This layer stays deterministic and cited — no learned classifier (§9.3). A
clinician must be able to ask "why was this flagged?" and get a table row with a
DrugBank reference, not a logit.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Dict, List, Optional

import networkx as nx

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from .severity_labels import Severity  # noqa: E402
from normalise.drug_names import normalise_variants  # noqa: E402

_ML_DIR = Path(__file__).resolve().parent.parent
DEFAULT_DDI_PATH = _ML_DIR / "data" / "ddi_dataset" / "DDI Database.json"

# Severity strings in the JSON -> our enum.
_SEVERITY_MAP = {
    "major": Severity.SEVERE,
    "severe": Severity.SEVERE,
    "high": Severity.SEVERE,
    "contraindicated": Severity.CONTRAINDICATED,
    "moderate": Severity.MODERATE,
    "medium": Severity.MODERATE,
    "minor": Severity.MINOR,
    "low": Severity.MINOR,
}

# Ordering for conflict resolution. Higher wins.
_SEVERITY_RANK = {
    Severity.NONE: 0,
    Severity.MINOR: 1,
    Severity.MODERATE: 2,
    Severity.SEVERE: 3,
    Severity.CONTRAINDICATED: 4,
}

# Kept ONLY for the no-dataset case, and loudly announced when used.
# This is not a fallback for a failed load — that raises.
FALLBACK_INTERACTION_DATA = [
    ("Napa", "Ace", "minor", "Both contain paracetamol — risk of overdose if combined"),
    ("Napa", "Aceta", "minor", "Duplicate paracetamol — do not combine"),
    ("Rivotril", "Baclofen", "severe", "CNS depression — combined sedation risk"),
    ("Aspirin", "Ibuprofen", "moderate", "NSAIDs combined — increased GI bleeding risk"),
]


class DDILoadError(RuntimeError):
    """Raised when a dataset we were pointed at cannot be loaded.

    Deliberately fatal: silently serving 4 rules while claiming 180 is the
    failure mode this module exists to prevent.
    """


class DrugInteractionGraph:
    def __init__(self, dataset_path: Optional[str | Path] = None, quiet: bool = False):
        self.graph = nx.Graph()
        self.source: str = "none"
        self.quiet = quiet
        # Pairs whose severity disagrees between duplicate source rows.
        self._conflicts: list[tuple[str, str, str, str]] = []

        path = Path(dataset_path) if dataset_path else DEFAULT_DDI_PATH
        if path.exists():
            self._load_from_json(path)
        elif dataset_path is not None:
            # We were told where the data is and it is not there. Do not guess.
            raise DDILoadError(
                f"DDI dataset not found at {path}. Refusing to fall back to "
                f"{len(FALLBACK_INTERACTION_DATA)} hardcoded edges — that is how "
                f"a safety layer silently becomes decorative."
            )
        else:
            self._build_fallback_graph()

    # ── loading ──────────────────────────────────────────────────────────

    def _log(self, msg: str) -> None:
        if not self.quiet:
            print(msg, flush=True)

    def _load_from_json(self, path: Path) -> None:
        try:
            payload = json.loads(Path(path).read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as exc:
            raise DDILoadError(f"Could not read DDI dataset {path}: {exc}") from exc

        buckets = payload.get("drug_interactions")
        if not isinstance(buckets, dict):
            raise DDILoadError(
                f"{path} has no 'drug_interactions' object — unexpected schema."
            )

        rows = 0
        skipped = 0
        for bucket_name, entries in buckets.items():
            for row in entries or []:
                if self._add_row(row, bucket_name):
                    rows += 1
                else:
                    skipped += 1

        if rows == 0:
            raise DDILoadError(f"{path} parsed but produced zero interactions.")

        self.source = str(path)
        if self._conflicts:
            self._log(
                f"[DDI] {len(self._conflicts)} pair(s) appear twice with CONFLICTING "
                f"severity in the source data; kept the more severe assessment:"
            )
            for a, b, kept, dropped in self._conflicts:
                self._log(f"[DDI]     {a} + {b}: kept {kept}, ignored {dropped}")
        self._log(
            f"[DDI] Loaded {rows} interactions "
            f"({self.graph.number_of_nodes()} drugs, "
            f"{self.graph.number_of_edges()} edges) from {path.name}"
            + (f"; skipped {skipped} malformed rows" if skipped else "")
        )

    def _add_row(self, row: dict, bucket_name: str) -> bool:
        drug_a = str(row.get("drug_a", "")).strip()
        drug_b = str(row.get("drug_b", "")).strip()
        if not drug_a or not drug_b:
            return False

        severity = _SEVERITY_MAP.get(
            str(row.get("severity", bucket_name)).strip().casefold(), Severity.MINOR
        )

        attrs = dict(
            severity=severity,
            drug_a=drug_a,
            drug_b=drug_b,
            mechanism=str(row.get("mechanism", "") or ""),
            effect=str(row.get("effect", "") or ""),
            safer_alternative=str(row.get("Safer_alternative", "") or ""),
            rationale=str(row.get("rationale", "") or ""),
            reference=str(row.get("reference", "") or ""),
        )
        # `description` keeps the old call sites working.
        attrs["description"] = attrs["effect"] or attrs["mechanism"] or (
            f"Interaction between {drug_a} and {drug_b}"
        )

        # Index under every normalised variant, so a class-level row like
        # "ACE Inhibitors (e.g., Lisinopril)" is reachable via "lisinopril",
        # and a combination product is reachable via each component.
        added = False
        for key_a in normalise_variants(drug_a):
            for key_b in normalise_variants(drug_b):
                if not (key_a and key_b) or key_a == key_b:
                    continue

                existing = self.graph.get_edge_data(key_a, key_b)
                if existing is not None:
                    # The source data contains the same pair twice with
                    # DIFFERENT severities (8 such pairs — Sildenafil +
                    # Nitroglycerin is listed as both Major and Minor).
                    # networkx would let the last write win, which for that pair
                    # means reporting a contraindicated combination as MINOR.
                    #
                    # In a safety layer the only defensible rule is: the most
                    # severe assessment wins, and the conflict is surfaced.
                    if _SEVERITY_RANK[existing["severity"]] != _SEVERITY_RANK[severity]:
                        self._conflicts.append(
                            (drug_a, drug_b,
                             existing["severity"].value, severity.value)
                        )
                    if _SEVERITY_RANK[existing["severity"]] >= _SEVERITY_RANK[severity]:
                        added = True
                        continue

                self.graph.add_edge(key_a, key_b, **attrs)
                added = True
        return added

    def _build_fallback_graph(self) -> None:
        for a, b, sev, desc in FALLBACK_INTERACTION_DATA:
            for ka in normalise_variants(a):
                for kb in normalise_variants(b):
                    self.graph.add_edge(
                        ka, kb,
                        severity=Severity(sev), drug_a=a, drug_b=b,
                        description=desc, mechanism="", effect=desc,
                        safer_alternative="", rationale="", reference="",
                    )
        self.source = "fallback"
        self._log(
            f"[DDI] WARNING: no dataset supplied. Using "
            f"{len(FALLBACK_INTERACTION_DATA)} hardcoded demo edges. "
            f"This is NOT the real interaction table."
        )

    # ── queries ──────────────────────────────────────────────────────────

    def _edge(self, a: str, b: str) -> Optional[dict]:
        for ka in normalise_variants(a):
            for kb in normalise_variants(b):
                if self.graph.has_edge(ka, kb):
                    return self.graph[ka][kb]
        return None

    def check_interaction(self, drug_a: str, drug_b: str) -> Optional[Dict]:
        data = self._edge(drug_a, drug_b)
        if data is None:
            return None
        return {
            "drug_a": data["drug_a"],
            "drug_b": data["drug_b"],
            "severity": data["severity"].value,
            "severity_color": data["severity"].color,
            "description": data["description"],
            "mechanism": data["mechanism"],
            "effect": data["effect"],
            "safer_alternative": data["safer_alternative"],
            "rationale": data["rationale"],
            "reference": data["reference"],
        }

    def check_all_interactions(self, drugs: List[str]) -> List[Dict]:
        found: List[Dict] = []
        seen: set[tuple[str, str]] = set()
        for i in range(len(drugs)):
            for j in range(i + 1, len(drugs)):
                result = self.check_interaction(drugs[i], drugs[j])
                if result is None:
                    continue
                pair = tuple(sorted((result["drug_a"], result["drug_b"])))
                if pair in seen:
                    continue
                seen.add(pair)
                found.append(result)
        return found

    def get_drug_info(self, drug: str) -> Dict:
        for key in normalise_variants(drug):
            if key in self.graph:
                ints = []
                for nb in self.graph.neighbors(key):
                    d = self.graph[key][nb]
                    other = (
                        d["drug_b"]
                        if normalise_variants(d["drug_a"])[0] == key
                        else d["drug_a"]
                    )
                    ints.append(
                        {
                            "drug": other,
                            "severity": d["severity"].value,
                            "description": d["description"],
                            "reference": d["reference"],
                        }
                    )
                return {"drug": drug, "interactions_count": len(ints), "interactions": ints}
        return {"drug": drug, "interactions_count": 0, "interactions": []}

    def stats(self) -> Dict:
        by_sev: Dict[str, int] = {}
        for _, _, d in self.graph.edges(data=True):
            by_sev[d["severity"].value] = by_sev.get(d["severity"].value, 0) + 1
        return {
            "source": self.source,
            "drugs": self.graph.number_of_nodes(),
            "edges": self.graph.number_of_edges(),
            "by_severity": by_sev,
            "severity_conflicts": len(self._conflicts),
        }


if __name__ == "__main__":
    g = DrugInteractionGraph()
    print(json.dumps(g.stats(), indent=2))
    print("\n--- sample lookups ---")
    for a, b in [
        ("Warfarin", "Ibuprofen"),
        ("Paracetamol", "Warfarin"),       # exercises the INN/USAN synonym
        ("Lisinopril", "Lithium"),          # exercises the class-level row
        ("Cetirizine Hydrochloride", "Ketoconazole (Tablet)"),  # salts + routes
        ("Zofer", "Crocin"),                # brand names: correctly finds nothing
    ]:
        r = g.check_interaction(a, b)
        if r:
            print(f"  {a} + {b}\n      {r['severity'].upper()}: {r['effect']}")
            print(f"      alt: {r['safer_alternative']}")
        else:
            print(f"  {a} + {b}\n      no interaction found")
