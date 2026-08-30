"""
S2 — Vocabulary constraint (+ S3 composition & NLEM verification).
(docs/ARCHITECTURE_V2.md §5/S2, §5/S3)

Turns free-form VLM readings into canonical Indian brand names, their
composition, and a per-ingredient verification tier — or into an honest
abstention.

Correction happens HERE, deliberately downstream of S1, so that
"Dijoxin" -> "Digoxin" is an auditable decision with a score attached rather
than a silent rewrite inside the model (§6.6).

Properties worth stating plainly:

  * `raw_reading` is preserved on every result, including corrected ones.
  * Abstention beats guessing: below `abstain_score` we emit NO medicine name.
  * The result is ALWAYS shown to the reviewer. Verification changes the
    strength of the warning, never whether the reading is visible — a blocked
    screen helps nobody and the doctor is the safety net.
  * Only NLEM-verified ingredients reach the interaction check, because that is
    the one place a wrong mapping becomes a wrong SAFETY VERDICT.

MATCHING (issue 1): brand names embed strength, so we score against BOTH a
full-name index ("Crocin 1000mg") and a base-name index ("Crocin") and take the
better. Neither alone works — full breaks "ZOFER", base breaks "Dolo 650".

AMBIGUITY (issue 3): 19% of readings have a competitor within `confirm_margin`
on brand string, but 78% of those resolve to the SAME composition. We compare
compositions, not brand names, so only genuine drug-level ambiguity costs a
human a click.
"""

from __future__ import annotations

import re
import sys
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import List, Optional, Sequence, Tuple

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from normalise.india_medicines import IndiaMedicines, get_medicines, match_key  # noqa: E402
from schemas import (  # noqa: E402
    MedicineLine,
    Outcome,
    PageRead,
    ResolvedMedicine,
    VerificationTier,
)

_ML_DIR = Path(__file__).resolve().parent.parent
CONFIG_PATH = _ML_DIR / "config" / "thresholds.yaml"

_FORM_PREFIXES = {
    "tab", "tabs", "tablet", "cap", "caps", "capsule", "syp", "syr", "syrup",
    "inj", "injection", "susp", "suspension", "oint", "ointment", "drop",
    "drops", "cream", "gel", "sol", "solution",
}


@dataclass(frozen=True)
class Thresholds:
    confirm_score: float
    confirm_margin: float
    abstain_score: float
    candidate_limit: int
    confident_read: float
    abstain_below: float
    collapse_same_composition: bool
    nlem_enabled: bool
    region: str
    is_target_region: bool


@lru_cache(maxsize=1)
def load_config(path: Path = CONFIG_PATH) -> Thresholds:
    cfg = yaml.safe_load(Path(path).read_text())
    m, r, v, n = cfg["matching"], cfg["reading"], cfg["vocabulary"], cfg.get("nlem", {})
    return Thresholds(
        confirm_score=float(m["confirm_score"]),
        confirm_margin=float(m["confirm_margin"]),
        abstain_score=float(m["abstain_score"]),
        candidate_limit=int(m["candidate_limit"]),
        confident_read=float(r["confident_read"]),
        abstain_below=float(r["abstain_below"]),
        collapse_same_composition=bool(m.get("collapse_same_composition", True)),
        nlem_enabled=bool(n.get("enabled", True)),
        region=v.get("region", "unknown"),
        is_target_region=bool(v.get("is_target_region", False)),
    )


# Route and timing tokens. Hospital prescriptions are written
# "Inj Diclofenac 75mg I/M Stat" — the drug is one token in five, and matching
# the whole string scored 89 against a WRONG brand while the correct ingredient
# sat at 100 behind the noise.
_ROUTE_TIMING = {
    "i/m", "im", "i/v", "iv", "p/o", "po", "s/c", "sc", "s/l", "sl", "pr", "pv",
    "stat", "od", "bd", "bid", "tds", "tid", "qid", "hs", "sos", "prn", "ac",
    "pc", "nocte", "mane", "daily", "once", "twice", "thrice",
}
_STRENGTH_TOKEN = re.compile(
    r"^\d[\d\.,/]*\s*(?:mg|mcg|g|gm|ml|iu|%|w/w|w/v)?$", re.IGNORECASE
)


def _strip_form_prefix(reading: str) -> str:
    """Reduce a prescription line to the drug name.

    'Tab. Zofer'                   -> 'Zofer'
    'Inj Diclofenac 75mg I/M Stat' -> 'Diclofenac'

    The S1 prompt asks the model to put only the drug name in `drug_token`, but
    the useful reading often arrives inside `alternatives` as a whole line, so
    this has to cope with the full form. Stripping trailing strength is safe
    because a base-name index exists alongside the full-name one.
    """
    parts = (reading or "").strip().split()
    while parts and parts[0].rstrip(".").lower() in _FORM_PREFIXES:
        parts = parts[1:]
    while parts:
        tail = parts[-1].strip(".,()").lower()
        if tail in _ROUTE_TIMING or tail in _FORM_PREFIXES or _STRENGTH_TOKEN.match(tail):
            parts = parts[:-1]
        else:
            break
    return " ".join(parts) if parts else (reading or "").strip()


def _rank(reading: str, med: IndiaMedicines, limit: int) -> List[Tuple[str, float, str]]:
    """Best (brand, score) candidates across BOTH brand indices (issue 1).

    Both sides go through `match_key`: case-folded AND punctuation-flattened.
    `fuzz.ratio` is case-sensitive (prescriptions are often block capitals —
    "ZOFER" vs "Zofer" scores 20, not 100) and treats "-" and " " as different,
    which ranks the wrong drug first for hyphenated Indian brands.
    """
    from rapidfuzz import fuzz, process

    probe = match_key(_strip_form_prefix(reading))
    if not probe:
        return []

    merged: dict[str, Tuple[float, str]] = {}
    indices = (
        (med.full_keys, med.full_names, "brand"),
        (med.base_keys, med.base_names, "brand"),
        # Prescriptions are frequently written in generics — matching brands
        # only made every such page fail outright.
        (med.ingredient_keys, med.ingredient_names, "ingredient"),
    )
    for keys, names, kind in indices:
        for _, score, idx in process.extract(probe, keys, scorer=fuzz.ratio, limit=limit):
            name = names[idx]
            if float(score) > merged.get(name, (-1.0, ""))[0]:
                merged[name] = (float(score), kind)
    ranked = sorted(merged.items(), key=lambda kv: -kv[1][0])[:limit]
    return [(n, sc, kind) for n, (sc, kind) in ranked]


def _unknown() -> dict:
    return dict(
        generic=None, ingredients=[], verified_ingredients=[],
        unverified_ingredients=[], verification=VerificationTier.UNKNOWN,
    )


def _describe_ingredient(name: str, med: IndiaMedicines, t: Thresholds) -> dict:
    """S3 for a prescription written in generics rather than a brand."""
    canonical = med.ingredient(name) or name
    if not t.nlem_enabled:
        return dict(generic=canonical, ingredients=[canonical],
                    verified_ingredients=[canonical], unverified_ingredients=[],
                    verification=VerificationTier.VERIFIED)
    v = med.verify_ingredients([canonical])
    return dict(generic=canonical, ingredients=[canonical],
                verified_ingredients=v.verified,
                unverified_ingredients=v.unverified, verification=v.tier)


def _describe(
    brand: Optional[str], med: IndiaMedicines, t: Thresholds
) -> dict:
    """S3: composition + per-ingredient NLEM verification for a brand."""
    if not brand:
        return _unknown()
    info = med.lookup(brand)
    if info is None:
        return _unknown()
    ingredients = list(info.ingredients)
    if not t.nlem_enabled:
        return dict(
            generic=info.composition, ingredients=ingredients,
            verified_ingredients=ingredients, unverified_ingredients=[],
            verification=VerificationTier.VERIFIED,
        )
    v = med.verify_ingredients(ingredients)
    return dict(
        generic=info.composition,
        ingredients=ingredients,
        verified_ingredients=v.verified,
        unverified_ingredients=v.unverified,
        verification=v.tier,
    )


def resolve_line(
    line: MedicineLine,
    thresholds: Optional[Thresholds] = None,
    med: Optional[IndiaMedicines] = None,
) -> Optional[ResolvedMedicine]:
    """Resolve one MedicineLine.

    Returns None when the line is legible but carries no drug name — that is an
    instruction, not a failed medicine, and inventing a row for it would be its
    own kind of hallucination.
    """
    t = thresholds or load_config()
    med = med or get_medicines()

    raw = line.drug_token or line.raw_text

    common = dict(
        dosage=line.dosage, frequency=line.frequency, duration=line.duration,
        instructions=line.instructions, confidence=line.confidence,
        raw_reading=raw, bbox=line.bbox,
    )

    def abstain(cands: Sequence[str], outcome: Outcome) -> ResolvedMedicine:
        """Emit no medicine name. ILLEGIBLE = could not read the handwriting;
        UNMATCHED = read it fine, but it is not in the database."""
        return ResolvedMedicine(
            brand=None, candidates=list(cands)[: t.candidate_limit],
            outcome=outcome, match_score=None, matched_via=None,
            **common, **_unknown(),
        )

    # 1. Genuinely unreadable -> ILLEGIBLE. Note this is a LOWER bar than
    #    `confident_read`: between the two we still resolve, but cap the
    #    outcome at PROBABLE rather than throwing the reading away.
    if not line.legible or line.confidence < t.abstain_below:
        return abstain(line.alternatives, Outcome.ILLEGIBLE)

    # 2. Legible, but no drug name -> not a medicine line at all.
    if not line.drug_token:
        return None

    # 3. Score the primary reading AND the alternatives; the uncertainty channel
    #    is free evidence and sometimes the runner-up reading is the real drug.
    scored = [(raw, _rank(raw, med, t.candidate_limit))]
    for alt in line.alternatives:
        scored.append((alt, _rank(alt, med, t.candidate_limit)))

    winning_reading, ranked = max(
        scored, key=lambda pair: pair[1][0][1] if pair[1] else 0.0
    )
    if not ranked:
        return abstain([], Outcome.UNMATCHED)

    top_name, top_score, top_kind = ranked[0]
    margin = top_score - (ranked[1][1] if len(ranked) > 1 else 0.0)
    common["raw_reading"] = raw
    matched_via = winning_reading if winning_reading != raw else None
    shortlist = [n for n, _, _ in ranked[: t.candidate_limit]]

    # 4. We read it, but nothing in the database is close. That is NOT
    #    "could not read" — the doctor can see the name we surfaced and act on
    #    it. Reporting it as illegible would be false and would make a working
    #    system look broken.
    if top_score < t.abstain_score:
        return abstain(shortlist, Outcome.UNMATCHED)

    scoring = dict(match_score=round(top_score, 1), matched_via=matched_via)

    def resolved(outcome: Outcome, name: Optional[str], cands: Sequence[str], kind: str):
        described = (
            _describe_ingredient(name, med, t) if (name and kind == "ingredient")
            else _describe(name, med, t)
        )
        # A generic-written line has no brand — surfacing the ingredient as a
        # brand name would be a small lie in a place that must not lie.
        brand = name if kind == "brand" else None
        return ResolvedMedicine(
            brand=brand, candidates=list(cands), outcome=outcome,
            **common, **scoring, **described,
        )

    strong = top_score >= t.confirm_score
    clear = margin >= t.confirm_margin
    confident = line.confidence >= t.confident_read

    # 5. Strong and clearly ahead -> accept (CONFIRMED only if the read was
    #    also confident; otherwise PROBABLE, which flags it for the reviewer).
    if strong and clear:
        return resolved(
            Outcome.CONFIRMED if confident else Outcome.PROBABLE,
            top_name, [], top_kind,
        )

    # 6. A near-tie on BRAND STRING is not necessarily ambiguity about the DRUG.
    #    78% of collisions are the same composition (issue 3) — collapse those.
    tied = [n for n, sc, _ in ranked if top_score - sc < t.confirm_margin]
    if strong and t.collapse_same_composition and len(tied) > 1 and med.same_composition(tied):
        return resolved(
            Outcome.CONFIRMED if confident else Outcome.PROBABLE,
            top_name, [], top_kind,
        )

    # 7. Strong but genuinely ambiguous about the drug -> human picks.
    if strong:
        return resolved(Outcome.AMBIGUOUS, None, shortlist, top_kind)

    # 8. Between the floor and the confirm bar -> accept, but flag it.
    return resolved(Outcome.PROBABLE, top_name, shortlist, top_kind)


def resolve_page(
    page: PageRead,
    thresholds: Optional[Thresholds] = None,
    med: Optional[IndiaMedicines] = None,
) -> List[ResolvedMedicine]:
    """Resolve every medicine line on a page. Order preserved."""
    t = thresholds or load_config()
    med = med or get_medicines()
    out = []
    for line in page.medicines:
        r = resolve_line(line, t, med)
        if r is not None:
            out.append(r)
    return out


if __name__ == "__main__":
    import argparse

    from vlm.page_reader import build_reader

    ap = argparse.ArgumentParser(description="Run S1 + S2 + S3 on one or more pages.")
    ap.add_argument("images", nargs="+")
    ap.add_argument("--reader", default="mock", choices=["claude", "mock", "mock_negative"])
    args = ap.parse_args()

    t = load_config()
    med = get_medicines()
    print(f"vocabulary : {med.stats()['brands_full']:,} brands "
          f"({med.stats()['brands_base']:,} base) region={t.region}")
    print(f"NLEM       : {med.stats()['nlem_keys']} molecule keys, enabled={t.nlem_enabled}")
    print(f"thresholds : confirm>={t.confirm_score} margin>={t.confirm_margin} "
          f"abstain<{t.abstain_score} conf>={t.confident_read} collapse={t.collapse_same_composition}\n")

    reader = build_reader(args.reader)
    for path in args.images:
        page = reader.read(path)
        meds = resolve_page(page, t, med)
        print(f"=== {Path(path).name}  ({page.document_type}) ===")
        for m in meds:
            score = f"{m.match_score:.0f}" if m.match_score is not None else "  -"
            print(f"  {m.outcome.value:10} {m.verification.value:11} score={score:>3}  "
                  f"{(m.brand or '—'):22} {m.generic or ''}")
            if m.unverified_ingredients:
                print(f"       unverified: {', '.join(m.unverified_ingredients)}")
            if m.candidates:
                print(f"       candidates: {m.candidates}")
            if m.needs_hard_confirmation:
                print(f"       -> HARD DOCTOR CONFIRMATION REQUIRED")
        checkable = sorted({i for m in meds for i in m.checkable_ingredients})
        print(f"  -> ingredients eligible for interaction check: {checkable}\n")
