"""
Environment loading — one place, so every entry point behaves the same.

Reads the project-root `.env` (gitignored) into os.environ. Real environment
variables always win: an exported ANTHROPIC_API_KEY overrides the file, which is
what you want in CI and in production.

The Anthropic SDK reads ANTHROPIC_API_KEY from os.environ itself, so calling
`load_env()` before constructing the client is all that is required.
"""

from __future__ import annotations

import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
ENV_PATH = PROJECT_ROOT / ".env"

_loaded = False


def load_env(path: Path = ENV_PATH, override: bool = False) -> bool:
    """Load .env into os.environ. Idempotent. Returns True if a file was read."""
    global _loaded
    if _loaded and not override:
        return True
    try:
        from dotenv import load_dotenv
    except ImportError:  # keep the pipeline runnable without the extra dep
        return _load_minimal(path)
    ok = load_dotenv(path, override=override)
    _loaded = True
    return ok


def _load_minimal(path: Path) -> bool:
    """Tiny fallback parser so a missing python-dotenv is not fatal."""
    global _loaded
    if not path.exists():
        return False
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        os.environ.setdefault(key.strip(), val.strip().strip("\"'"))
    _loaded = True
    return True


def require(name: str) -> str:
    """Fetch a required variable, with an actionable error if it is missing."""
    load_env()
    val = os.environ.get(name)
    if not val:
        raise RuntimeError(
            f"{name} is not set.\n"
            f"  Add it to {ENV_PATH}  (that file is gitignored)\n"
            f"  or export it:  export {name}=..."
        )
    return val


def has(name: str) -> bool:
    load_env()
    return bool(os.environ.get(name))


if __name__ == "__main__":
    found = load_env()
    print(f".env at {ENV_PATH}: {'loaded' if found else 'NOT FOUND'}")
    key = os.environ.get("ANTHROPIC_API_KEY", "")
    if key:
        print(f"ANTHROPIC_API_KEY: set ({len(key)} chars, ends ...{key[-4:]})")
    else:
        print("ANTHROPIC_API_KEY: NOT SET")
