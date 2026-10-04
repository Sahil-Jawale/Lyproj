"""
Credential primitives. Standard library only — no new dependency to audit.

  * Passwords: scrypt (memory-hard), per-password random salt, parameters stored
    in the hash so they can be raised later without invalidating old hashes.
  * Session tokens / MFA challenges: 256-bit random, stored as SHA-256. The
    database never holds a usable token, so a leaked DB is not a leaked login.
  * One-time codes (6 digits): HMAC-SHA256 keyed with SECRET_KEY. A 6-digit
    code has only ~20 bits of entropy, so the hash alone would be brute-forced
    offline; the key makes the hash useless without the server secret, and the
    attempt limit is what actually protects the online path.
  * TOTP: RFC 6238 (SHA-1, 30 s, 6 digits) — what every authenticator app speaks.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import struct
import time
from typing import Optional, Tuple
from urllib.parse import quote

from config.settings import settings

# ─── passwords ───────────────────────────────────────────────────────────────

# n=2^15, r=8 → 32 MiB per hash, ~50-100 ms. Raise n as hardware gets faster;
# old hashes keep verifying because their parameters travel with them.
_SCRYPT_N, _SCRYPT_R, _SCRYPT_P = 2**15, 8, 1
_SCRYPT_MAXMEM = 64 * 1024 * 1024

PASSWORD_MIN = 10
PASSWORD_MAX = 128

# The handful that survive a length rule. Not a substitute for a breach-corpus
# check (e.g. HIBP k-anonymity) — a candidate for later, not a guess to grow.
_COMMON = {
    "password12", "password123", "1234567890", "qwertyuiop", "iloveyou12",
    "welcome123", "admin12345", "letmein123", "abcdefghij", "0987654321",
    "prescriptai", "doctor1234", "pharmacy123", "patient123", "1111111111",
}


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.scrypt(
        password.encode(), salt=salt, n=_SCRYPT_N, r=_SCRYPT_R, p=_SCRYPT_P,
        maxmem=_SCRYPT_MAXMEM, dklen=32,
    )
    return "scrypt${}${}${}${}${}".format(
        _SCRYPT_N, _SCRYPT_R, _SCRYPT_P,
        base64.b64encode(salt).decode(), base64.b64encode(dk).decode(),
    )


def verify_password(password: str, encoded: Optional[str]) -> bool:
    if not encoded:
        # Burn the same time as a real check, so "no such user" is not
        # distinguishable from "wrong password" by response time.
        hash_password(password or "x")
        return False
    try:
        algo, n, r, p, salt_b64, dk_b64 = encoded.split("$")
        if algo != "scrypt":
            return False
        dk = hashlib.scrypt(
            password.encode(), salt=base64.b64decode(salt_b64),
            n=int(n), r=int(r), p=int(p), maxmem=_SCRYPT_MAXMEM, dklen=32,
        )
        return hmac.compare_digest(dk, base64.b64decode(dk_b64))
    except (ValueError, TypeError):
        return False


def password_problem(password: str, *identifiers: Optional[str]) -> Optional[str]:
    """Return a human-readable reason the password is unacceptable, or None."""
    if not password or len(password) < PASSWORD_MIN:
        return f"Use at least {PASSWORD_MIN} characters."
    if len(password) > PASSWORD_MAX:
        return f"Use at most {PASSWORD_MAX} characters."
    low = password.lower()
    if low in _COMMON or len(set(low)) < 4:
        return "That password is too easy to guess."
    for ident in identifiers:
        if ident and len(ident) >= 4 and ident.lower().lstrip("+") in low:
            return "Don't include your email, phone or username in the password."
    return None


# ─── opaque tokens ───────────────────────────────────────────────────────────


def new_token() -> Tuple[str, str]:
    """(token for the client, hash for the database)."""
    token = secrets.token_urlsafe(32)
    return token, hash_token(token)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


# ─── one-time codes ──────────────────────────────────────────────────────────


def new_code(digits: int = 6) -> str:
    return f"{secrets.randbelow(10**digits):0{digits}d}"


def hash_code(code: str, purpose: str, user_id: str) -> str:
    msg = f"{purpose}:{user_id}:{code.strip()}".encode()
    return hmac.new(settings.SECRET_KEY.encode(), msg, hashlib.sha256).hexdigest()


# Recovery codes: 10 chars from an alphabet with no 0/O/1/l confusion, shown
# as xxxxx-xxxxx. ~50 bits each — high enough that HMAC + single use is ample.
_RECOVERY_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"


def new_recovery_code() -> str:
    raw = "".join(secrets.choice(_RECOVERY_ALPHABET) for _ in range(10))
    return f"{raw[:5]}-{raw[5:]}"


def normalise_recovery_code(code: str) -> str:
    raw = "".join(ch for ch in (code or "").lower() if ch.isalnum())
    return f"{raw[:5]}-{raw[5:]}" if len(raw) == 10 else raw


# ─── TOTP (RFC 6238) ─────────────────────────────────────────────────────────

TOTP_STEP = 30
TOTP_DIGITS = 6


def new_totp_secret() -> str:
    return base64.b32encode(secrets.token_bytes(20)).decode().rstrip("=")


def _hotp(secret_b32: str, counter: int) -> str:
    key = base64.b32decode(secret_b32 + "=" * (-len(secret_b32) % 8), casefold=True)
    digest = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    value = struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF
    return f"{value % 10**TOTP_DIGITS:0{TOTP_DIGITS}d}"


def totp_now(secret_b32: str, at: Optional[float] = None) -> str:
    return _hotp(secret_b32, int((at or time.time()) // TOTP_STEP))


def verify_totp(
    secret_b32: str, code: str, last_step: Optional[int] = None, window: int = 1
) -> Optional[int]:
    """Return the matched time step, or None.

    Accepts ±`window` steps for clock drift, and rejects any step at or before
    `last_step` so a code that was just used (or shoulder-surfed) cannot be
    replayed inside its 30-second life.
    """
    code = "".join(ch for ch in (code or "") if ch.isdigit())
    if len(code) != TOTP_DIGITS or not secret_b32:
        return None
    now = int(time.time() // TOTP_STEP)
    for step in range(now - window, now + window + 1):
        if last_step is not None and step <= last_step:
            continue
        if hmac.compare_digest(_hotp(secret_b32, step), code):
            return step
    return None


def totp_uri(secret_b32: str, account: str, issuer: str = "PrescriptAI") -> str:
    label = quote(f"{issuer}:{account}")
    return (
        f"otpauth://totp/{label}?secret={secret_b32}&issuer={quote(issuer)}"
        f"&algorithm=SHA1&digits={TOTP_DIGITS}&period={TOTP_STEP}"
    )
