"""
S1 — VLM page read.  (docs/ARCHITECTURE_V2.md §5/S1, §6.4)

The reader takes a normalised page and returns a schema-guaranteed `PageRead`.
It is the only stage that talks to a model.

Three implementations of one Protocol:

  MockPageReader    — fixed realistic output. No API, no key, no cost.
                      Ships FIRST so Tracks B and C are never blocked (DAY1 §3/A1).
  ClaudePageReader  — the real one, Opus 5 @ effort:medium.
  CachedPageReader  — wraps any reader with an on-disk response cache.

The cache is not an optimisation, it is what makes the testing budget work:
at a 70% hit rate the phase costs $7.38 instead of $24.58 (§14.2). Most
development re-runs exercise S2-S4 and the UI against an UNCHANGED VLM output;
those must cost nothing.
"""

from __future__ import annotations

import base64
import json
from pathlib import Path
from typing import Optional, Protocol, Union, runtime_checkable

from PIL import Image

import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from env import load_env  # noqa: E402
from ingest.normalise import NormalisedImage, normalise  # noqa: E402
from schemas import MedicineLine, PageRead  # noqa: E402
from vlm.prompts import (  # noqa: E402
    PAGE_READER_SYSTEM_PROMPT,
    PROMPT_VERSION,
    USER_TURN_TEXT,
    prompt_fingerprint,
)
from vlm.spend import CallCost, get_guard, price_call  # noqa: E402

DEFAULT_MODEL = "claude-opus-5"
DEFAULT_EFFORT = "medium"  # §6.5 — effort is the dominant cost lever
MAX_TOKENS = 16000  # never lower this to save money: a truncated PageRead is a failed read

_ML_DIR = Path(__file__).resolve().parent.parent
CACHE_DIR = _ML_DIR / ".cache" / "vlm"

PageSource = Union[str, Path, bytes, Image.Image, NormalisedImage]


def _as_normalised(source: PageSource) -> NormalisedImage:
    return source if isinstance(source, NormalisedImage) else normalise(source)


@runtime_checkable
class PageReader(Protocol):
    """Swappable so hosted and self-hosted paths are interchangeable (§10)."""

    model: str

    def read(self, source: PageSource) -> PageRead: ...


# ─────────────────────────────────────────────────────────────────────────────
# Mock — built first, on purpose
# ─────────────────────────────────────────────────────────────────────────────


class MockPageReader:
    """Fixed, realistic output. Modelled on VLM_CHECK/2.jpg (a real eval image).

    The third medicine is deliberately ILLEGIBLE. Track C must build the
    abstention UI from the start rather than bolting it on once the real reader
    lands — a mock where everything succeeds produces a UI that cannot express
    failure.
    """

    def __init__(self, document_type: str = "prescription"):
        self.document_type = document_type
        # `model` is the reader's cache identity, so two mock variants must not
        # share it — otherwise the negative fixture serves the positive one's
        # cached entry. Anything that changes the output belongs in the key.
        self.model = f"mock-{document_type.replace('_', '-')}"

    def read(self, source: PageSource) -> PageRead:
        _as_normalised(source)  # exercise the real S0 path so bugs surface here too

        if self.document_type == "not_a_prescription":
            # The hard-negative case: a clinical note with no medications.
            return PageRead(
                document_type="not_a_prescription",
                patient_name=None,
                prescriber_name=None,
                date=None,
                medicines=[],
                unreadable_regions=[
                    "Gynaecology progress note. No medications are prescribed on this page."
                ],
                overall_legibility=0.62,
            )

        return PageRead(
            document_type="prescription",
            patient_name="Ms. Prathna",
            prescriber_name="Dr. R. Keshwani",
            date="15-03-17",
            medicines=[
                MedicineLine(
                    line_index=0,
                    raw_text="1. TAB OFLAZEST OZ - (6)  1 ---- 1",
                    drug_token="OFLAZEST OZ",
                    alternatives=[],
                    dosage=None,
                    frequency="1-0-1",
                    duration="3 days",
                    instructions=None,
                    confidence=0.93,
                    legible=True,
                    bbox=[0.08, 0.30, 0.55, 0.36],
                ),
                MedicineLine(
                    line_index=1,
                    raw_text="2. TAB AZENAC-MR - (6)  1 ---- 1",
                    drug_token="AZENAC-MR",
                    alternatives=["ANEVAC-MR"],
                    dosage=None,
                    frequency="1-0-1",
                    duration="3 days",
                    instructions=None,
                    confidence=0.71,
                    legible=True,
                    bbox=[0.08, 0.38, 0.55, 0.44],
                ),
                MedicineLine(
                    line_index=2,
                    raw_text="4. TAB ZOFER u-r - (6)  1 ---- 1",
                    drug_token=None,
                    alternatives=["ZOFER 4mg", "ZOFER 4-V"],
                    dosage=None,
                    frequency="1-0-1",
                    duration="3 days",
                    instructions=None,
                    confidence=0.34,
                    legible=False,
                    bbox=[0.08, 0.54, 0.55, 0.60],
                ),
            ],
            unreadable_regions=[
                "Strength suffix on line 4 ('u-r') is unclear.",
                "A brace groups all four drugs with the note '3 days'.",
            ],
            overall_legibility=0.74,
        )


# ─────────────────────────────────────────────────────────────────────────────
# Response cache
# ─────────────────────────────────────────────────────────────────────────────


class CachedPageReader:
    """On-disk response cache around any PageReader.

    Key: (image_sha256, prompt_version, prompt_fingerprint, model, effort).

    `prompt_fingerprint` is in the key on purpose — editing the prompt without
    bumping PROMPT_VERSION would otherwise serve stale reads forever, which is
    the single most confusing bug this design can produce.

    The raw model response is stored alongside the parsed one because §16.3
    needs it for the correction log, and it cannot be reconstructed later.
    """

    def __init__(self, inner: PageReader, cache_dir: Path = CACHE_DIR, enabled: bool = True):
        self.inner = inner
        self.cache_dir = Path(cache_dir)
        self.enabled = enabled
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.hits = 0
        self.misses = 0

    @property
    def model(self) -> str:
        return self.inner.model

    @staticmethod
    def _safe(part: str) -> str:
        """Cache keys become filenames, so keep them to a filesystem-safe set."""
        return "".join(c if (c.isalnum() or c in "-.") else "-" for c in str(part))

    def _key(self, img: NormalisedImage) -> str:
        effort = getattr(self.inner, "effort", None) or "none"
        return "_".join(
            self._safe(p)
            for p in (
                img.sha256[:16],
                PROMPT_VERSION,
                prompt_fingerprint(),
                self.inner.model,
                effort,
            )
        )

    def _path(self, key: str) -> Path:
        return self.cache_dir / f"{key}.json"

    def read(self, source: PageSource) -> PageRead:
        img = _as_normalised(source)

        if not self.enabled:
            return self.inner.read(img)

        path = self._path(self._key(img))
        if path.exists():
            self.hits += 1
            payload = json.loads(path.read_text())
            return PageRead.model_validate(payload["page_read"])

        self.misses += 1
        page = self.inner.read(img)

        path.write_text(
            json.dumps(
                {
                    "page_read": page.model_dump(),
                    "raw_response": getattr(self.inner, "last_raw_response", None),
                    "usage": getattr(self.inner, "last_usage", None),
                    "model": self.inner.model,
                    "effort": getattr(self.inner, "effort", None),
                    "prompt_version": PROMPT_VERSION,
                    "prompt_fingerprint": prompt_fingerprint(),
                    "image_sha256": img.sha256,
                    "image_size": [img.width, img.height],
                },
                indent=2,
                default=str,
            )
        )
        return page

    def stats(self) -> str:
        total = self.hits + self.misses
        rate = 100 * self.hits / total if total else 0.0
        return f"cache: {self.hits} hits / {self.misses} misses ({rate:.0f}% hit rate)"


# ─────────────────────────────────────────────────────────────────────────────
# The real reader
# ─────────────────────────────────────────────────────────────────────────────


class ClaudePageReader:
    """Opus 5 @ effort:medium, structured output guaranteed by the schema."""

    def __init__(
        self,
        model: str = DEFAULT_MODEL,
        effort: str = DEFAULT_EFFORT,
        enforce_spend_cap: bool = True,
    ):
        import anthropic

        # Reads the project-root .env if present; a real env var still wins.
        load_env()
        self.client = anthropic.Anthropic()
        self.model = model
        self.effort = effort
        self.enforce_spend_cap = enforce_spend_cap
        self.last_raw_response: Optional[dict] = None
        self.last_usage: Optional[dict] = None
        self.last_cost: Optional[CallCost] = None

    def read(self, source: PageSource) -> PageRead:
        img = _as_normalised(source)
        guard = get_guard()
        if self.enforce_spend_cap:
            guard.check_before_call()

        img_b64 = base64.standard_b64encode(img.jpeg_bytes).decode("utf-8")

        response = self.client.messages.parse(
            model=self.model,
            max_tokens=MAX_TOKENS,
            thinking={"type": "adaptive"},
            output_config={"effort": self.effort},
            system=[
                {
                    "type": "text",
                    "text": PAGE_READER_SYSTEM_PROMPT,
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": "image/jpeg",
                                "data": img_b64,
                            },
                        },
                        {"type": "text", "text": USER_TURN_TEXT},
                    ],
                }
            ],
            output_format=PageRead,
        )

        # Keep the raw response: §16.3 needs it and it cannot be rebuilt later.
        #
        # `warnings=False` because the SDK's ParsedMessage carries a
        # ParsedTextBlock that does not match the declared ContentBlock union,
        # so a plain model_dump emits ~15 PydanticSerializationUnexpectedValue
        # lines per call. The dump itself is correct; only the validation
        # chatter is wrong, and it would otherwise bury real output.
        self.last_raw_response = response.model_dump(mode="json", warnings=False)
        self.last_usage = (
            response.usage.model_dump() if hasattr(response.usage, "model_dump") else dict(response.usage)
        )
        self.last_cost = guard.record(
            price_call(self.model, response.usage), tag=img.sha256[:12]
        )

        return response.parsed_output


def build_reader(
    kind: str = "claude",
    model: str = DEFAULT_MODEL,
    effort: str = DEFAULT_EFFORT,
    cache: bool = True,
) -> PageReader:
    """One place to construct the reader, so swapping it is a single argument."""
    inner: PageReader
    if kind == "mock":
        inner = MockPageReader()
    elif kind == "mock_negative":
        inner = MockPageReader(document_type="not_a_prescription")
    elif kind == "claude":
        inner = ClaudePageReader(model=model, effort=effort)
    else:
        raise ValueError(f"unknown reader kind {kind!r}")
    return CachedPageReader(inner) if cache else inner


if __name__ == "__main__":
    import argparse

    ap = argparse.ArgumentParser(description="Run S1 on one or more pages.")
    ap.add_argument("images", nargs="+")
    ap.add_argument("--reader", default="claude", choices=["claude", "mock", "mock_negative"])
    ap.add_argument("--model", default=DEFAULT_MODEL)
    ap.add_argument("--effort", default=DEFAULT_EFFORT)
    ap.add_argument("--no-cache", action="store_true")
    args = ap.parse_args()

    reader = build_reader(args.reader, args.model, args.effort, cache=not args.no_cache)

    for path in args.images:
        page = reader.read(path)
        print(f"\n=== {Path(path).name} ===")
        print(f"document_type    : {page.document_type}")
        print(f"legibility       : {page.overall_legibility}")
        print(f"patient          : {page.patient_name}")
        print(f"prescriber       : {page.prescriber_name}")
        print(f"medicines        : {len(page.medicines)}")
        for m in page.medicines:
            flag = "" if m.legible else "   <- ILLEGIBLE"
            alts = f"  alts={m.alternatives}" if m.alternatives else ""
            print(f"   [{m.confidence:.2f}] {m.raw_text!r}{alts}{flag}")
        for note in page.unreadable_regions:
            print(f"   note: {note}")

    if isinstance(reader, CachedPageReader):
        print(f"\n{reader.stats()}")
    print(get_guard().summary())
