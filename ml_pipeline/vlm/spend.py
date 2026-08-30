"""
Spend guard.  (docs/ARCHITECTURE_V2.md §14.2)

The testing budget is $5 and must cover a demo. At a measured $0.034/prescription
that is ~145 pages, and cached re-runs are free — but the spend has to be visible
and capped rather than discovered afterwards.

This module does two things:
  1. Turns a real `response.usage` into a real dollar figure.
  2. Refuses to keep spending past a hard cap.

Prices are $ per 1M tokens, from docs/ARCHITECTURE_V2.md §6.2. Cache reads bill
at 0.1x the input rate and cache writes at 1.25x (5-minute TTL).
"""

from __future__ import annotations

import json
import os
import sys
import threading
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

_ML_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_ML_DIR))

from env import load_env  # noqa: E402

# The cap is read from the environment, so .env must be loaded before any
# SpendGuard is constructed — otherwise the configured cap is silently ignored
# and the default applies. That is a budget bug, so it happens at import.
load_env()

LEDGER_PATH = _ML_DIR / ".cache" / "spend_ledger.json"

# $ per 1M tokens: (input, output)
PRICES: dict[str, tuple[float, float]] = {
    "claude-opus-5": (5.0, 25.0),
    "claude-sonnet-5": (2.0, 10.0),
    "claude-haiku-4-5": (1.0, 5.0),
}

CACHE_READ_MULTIPLIER = 0.10
CACHE_WRITE_MULTIPLIER = 1.25

# Hard ceiling for the whole testing phase. Override with PRESCRIPTAI_SPEND_CAP.
DEFAULT_CAP_USD = 30.0


class SpendCapExceeded(RuntimeError):
    """Raised before a call that would push cumulative spend past the cap."""


@dataclass
class CallCost:
    model: str
    input_tokens: int
    output_tokens: int
    cache_read_tokens: int
    cache_write_tokens: int
    usd: float

    def __str__(self) -> str:
        return (
            f"${self.usd:.5f}  in={self.input_tokens} out={self.output_tokens} "
            f"cache_r={self.cache_read_tokens} cache_w={self.cache_write_tokens}"
        )


def price_call(model: str, usage: Any) -> CallCost:
    """Convert an SDK usage object (or dict) into a costed line item.

    `input_tokens` from the API excludes cached tokens; they are reported
    separately, so the three input buckets are summed at their own rates.
    """
    get = usage.get if isinstance(usage, dict) else lambda k, d=0: getattr(usage, k, d) or 0

    inp = get("input_tokens", 0) or 0
    out = get("output_tokens", 0) or 0
    c_read = get("cache_read_input_tokens", 0) or 0
    c_write = get("cache_creation_input_tokens", 0) or 0

    if model not in PRICES:
        raise KeyError(
            f"No price for model {model!r}. Add it to PRICES rather than guessing."
        )
    p_in, p_out = PRICES[model]

    usd = (
        inp * p_in
        + c_read * p_in * CACHE_READ_MULTIPLIER
        + c_write * p_in * CACHE_WRITE_MULTIPLIER
        + out * p_out
    ) / 1_000_000

    return CallCost(model, inp, out, c_read, c_write, usd)


class SpendGuard:
    """Append-only ledger of real spend, with a hard cap.

    Deliberately simple and file-backed: it must survive a crashed sweep, and a
    developer must be able to read it without running anything.
    """

    def __init__(self, ledger_path: Path = LEDGER_PATH, cap_usd: Optional[float] = None):
        self.ledger_path = Path(ledger_path)
        self.ledger_path.parent.mkdir(parents=True, exist_ok=True)
        self.cap_usd = (
            cap_usd
            if cap_usd is not None
            else float(os.environ.get("PRESCRIPTAI_SPEND_CAP", DEFAULT_CAP_USD))
        )
        self._lock = threading.Lock()

    def _read(self) -> list[dict]:
        if not self.ledger_path.exists():
            return []
        try:
            return json.loads(self.ledger_path.read_text())
        except json.JSONDecodeError:
            # A truncated ledger must not block work; keep the bad file for
            # inspection rather than silently discarding spend history.
            self.ledger_path.rename(self.ledger_path.with_suffix(".corrupt.json"))
            return []

    def total_usd(self) -> float:
        return sum(e["usd"] for e in self._read())

    def remaining_usd(self) -> float:
        return self.cap_usd - self.total_usd()

    def check_before_call(self, estimated_usd: float = 0.05) -> None:
        """Refuse a call that would breach the cap. Call this BEFORE spending."""
        total = self.total_usd()
        if total + estimated_usd > self.cap_usd:
            raise SpendCapExceeded(
                f"Spend cap reached: ${total:.2f} spent of ${self.cap_usd:.2f}; "
                f"this call is estimated at ${estimated_usd:.4f}. "
                f"Raise PRESCRIPTAI_SPEND_CAP deliberately, or clear "
                f"{self.ledger_path}."
            )

    def record(self, cost: CallCost, tag: str = "") -> CallCost:
        with self._lock:
            entries = self._read()
            entries.append(
                {
                    **asdict(cost),
                    "tag": tag,
                    "at": datetime.now(timezone.utc).isoformat(),
                }
            )
            self.ledger_path.write_text(json.dumps(entries, indent=2))
        return cost

    def summary(self) -> str:
        entries = self._read()
        if not entries:
            return f"No spend recorded. Cap ${self.cap_usd:.2f}."
        by_model: dict[str, tuple[int, float]] = {}
        for e in entries:
            n, usd = by_model.get(e["model"], (0, 0.0))
            by_model[e["model"]] = (n + 1, usd + e["usd"])
        lines = [f"Spend ledger  ({self.ledger_path})"]
        for m, (n, usd) in sorted(by_model.items()):
            lines.append(f"  {m:20} {n:5} calls  ${usd:7.4f}")
        total = self.total_usd()
        lines.append(f"  {'TOTAL':20} {len(entries):5} calls  ${total:7.4f}")
        lines.append(f"  cap ${self.cap_usd:.2f}, remaining ${self.remaining_usd():.4f}")
        return "\n".join(lines)


_default_guard: Optional[SpendGuard] = None


def get_guard() -> SpendGuard:
    global _default_guard
    if _default_guard is None:
        _default_guard = SpendGuard()
    return _default_guard


if __name__ == "__main__":
    print(get_guard().summary())
