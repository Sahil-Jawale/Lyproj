"""
In-memory sliding-window limiter.

Keyed by whatever the caller chooses — IP, or a normalised identifier. Keying
failed logins on the IDENTIFIER (not the account row) is deliberate: an unknown
username is throttled exactly like a real one, so the 429 reveals nothing about
which accounts exist.

Process-local: it resets on restart and is not shared between workers. Move to
Redis before running more than one backend process.
"""

from __future__ import annotations

import threading
import time
from collections import defaultdict, deque
from typing import Deque, Dict, Tuple

_lock = threading.Lock()
_hits: Dict[Tuple[str, str], Deque[float]] = defaultdict(deque)


def _prune(q: Deque[float], window: float, now: float) -> None:
    while q and now - q[0] > window:
        q.popleft()


def hit(bucket: str, key: str, limit: int, window: float) -> int:
    """Record one event. Returns seconds to wait if over the limit, else 0."""
    now = time.monotonic()
    with _lock:
        q = _hits[(bucket, key)]
        _prune(q, window, now)
        if len(q) >= limit:
            return int(window - (now - q[0])) + 1
        q.append(now)
        return 0


def blocked(bucket: str, key: str, limit: int, window: float) -> int:
    """Check without recording. Seconds to wait, or 0."""
    now = time.monotonic()
    with _lock:
        q = _hits[(bucket, key)]
        _prune(q, window, now)
        return int(window - (now - q[0])) + 1 if len(q) >= limit else 0


def reset(bucket: str, key: str) -> None:
    with _lock:
        _hits.pop((bucket, key), None)
