"""
Authentication API for every stakeholder in Workflow.md: doctor, patient, chemist.

    POST /api/auth/register              email, phone or username + password
    POST /api/auth/login                 → session, or an MFA challenge
    POST /api/auth/login/mfa             authenticator code or recovery code
    POST /api/auth/logout                ends THIS session only
    GET  /api/auth/me                    who am I
    PATCH /api/auth/me                   name / profile
    PUT  /api/auth/me/contact            add or change email / phone (password required)
    POST /api/auth/verify/send           send an email / phone verification code
    POST /api/auth/verify/confirm
    POST /api/auth/password/forgot       always answers the same, account or not
    POST /api/auth/password/reset        with a code, or a recovery code
    POST /api/auth/password/change       signed in; signs out every other session
    POST /api/auth/mfa/setup             TOTP secret + otpauth:// URI
    POST /api/auth/mfa/enable            confirm a code → MFA on, recovery codes issued
    POST /api/auth/mfa/disable           password + code
    POST /api/auth/recovery-codes        regenerate (password required)
    GET  /api/auth/sessions              every signed-in browser
    DELETE /api/auth/sessions/{id}
    POST /api/auth/sessions/revoke-others

Rules this module keeps everywhere:

  * NO ACCOUNT ENUMERATION on login or password reset. Wrong password and
    unknown user get the same message, the same timing (a dummy hash is
    computed) and the same throttling (keyed on the identifier, not the row).
  * A password reset never signs anyone in, and never bypasses MFA: the next
    login still asks for the second factor.
  * Changing or resetting a password ends other sessions. A stolen session
    must not outlive the password that was changed because of it.
  * Every security-relevant action writes an `auth_events` row.
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from config.database import get_db
from config.settings import settings

from . import ratelimit as rl
from .models import (
    AuthEvent,
    AuthSession,
    CodePurpose,
    MfaChallenge,
    OneTimeCode,
    RecoveryCode,
    Role,
    User,
    aware,
)
from .notify import deliver
from .security import (
    hash_code,
    hash_password,
    hash_token,
    new_code,
    new_recovery_code,
    new_token,
    new_totp_secret,
    normalise_recovery_code,
    password_problem,
    totp_uri,
    verify_password,
    verify_totp,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])

CODE_TTL_MIN = 10
CODE_MAX_ATTEMPTS = 5
CODE_RESEND_SECONDS = 60
MFA_CHALLENGE_TTL_MIN = 5
RECOVERY_CODE_COUNT = 10

LOGIN_FAIL_LIMIT, LOGIN_FAIL_WINDOW = 5, 15 * 60

GENERIC_LOGIN_ERROR = "Incorrect sign-in details."
GENERIC_CODE_ERROR = "That code is invalid or has expired."


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ─── identifiers ─────────────────────────────────────────────────────────────

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_USERNAME_RE = re.compile(r"^[a-z][a-z0-9._-]{2,31}$")
_E164_RE = re.compile(r"^\+[1-9]\d{7,14}$")
_PHONEISH_RE = re.compile(r"^[+\d\s\-().]+$")


def norm_email(v: str) -> str:
    v = (v or "").strip().lower()
    if len(v) > 254 or not _EMAIL_RE.match(v):
        raise HTTPException(422, "Enter a valid email address.")
    return v


def norm_phone(v: str) -> str:
    """E.164. A bare 10-digit number is taken as Indian (+91) — the target region."""
    d = re.sub(r"[\s\-().]", "", v or "")
    if d.startswith("00"):
        d = "+" + d[2:]
    if re.fullmatch(r"0?\d{10}", d):
        d = "+91" + d[-10:]
    if not _E164_RE.match(d):
        raise HTTPException(422, "Enter a valid phone number, e.g. +91 98765 43210.")
    return d


def norm_username(v: str) -> str:
    v = (v or "").strip().lower()
    if not _USERNAME_RE.match(v):
        raise HTTPException(
            422,
            "Usernames are 3–32 characters: letters, numbers, dot, dash or underscore, "
            "starting with a letter.",
        )
    return v


def classify(identifier: str) -> tuple[str, str]:
    """Sign-in box → (kind, normalised value). Raises 422 on nonsense."""
    raw = (identifier or "").strip()
    if "@" in raw:
        return "email", norm_email(raw)
    if raw and _PHONEISH_RE.match(raw) and sum(c.isdigit() for c in raw) >= 8:
        return "phone", norm_phone(raw)
    return "username", norm_username(raw)


def _find_user(db: Session, kind: str, value: str) -> Optional[User]:
    col = {"email": User.email, "phone": User.phone, "username": User.username}[kind]
    return db.query(User).filter(col == value).first()


def _mask(channel: str, value: str) -> str:
    if channel == "email":
        name, _, domain = value.partition("@")
        return f"{name[:1]}{'•' * max(len(name) - 1, 2)}@{domain}"
    return f"{value[:3]}{'•' * max(len(value) - 6, 2)}{value[-3:]}"


# ─── profile rules per role (Workflow.md §4 Stage 1, §2) ─────────────────────

_PROFILE_FIELDS: Dict[Role, Dict[str, bool]] = {
    # field: required?
    Role.DOCTOR: {"speciality": True, "clinic_address": True, "registration_no": False},
    Role.CHEMIST: {"pharmacy_name": True, "pharmacy_address": True, "drug_licence_no": False},
    Role.PATIENT: {},
}
_PROFILE_LABELS = {
    "speciality": "Speciality", "clinic_address": "Clinic address",
    "registration_no": "Registration number", "pharmacy_name": "Pharmacy name",
    "pharmacy_address": "Pharmacy address", "drug_licence_no": "Drug licence number",
}


def _clean_profile(role: Role, profile: Dict[str, str], partial: bool = False) -> Dict[str, str]:
    allowed = _PROFILE_FIELDS[role]
    out: Dict[str, str] = {}
    for key, val in (profile or {}).items():
        if key not in allowed:
            continue
        val = str(val or "").strip()
        if len(val) > 300:
            raise HTTPException(422, f"{_PROFILE_LABELS[key]} is too long.")
        out[key] = val
    if not partial:
        missing = [_PROFILE_LABELS[k] for k, req in allowed.items() if req and not out.get(k)]
        if missing:
            raise HTTPException(422, f"Required: {', '.join(missing)}.")
    return out


# ─── request / response models ───────────────────────────────────────────────


class UserOut(BaseModel):
    id: str
    role: str
    full_name: str
    username: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    email_verified: bool
    phone_verified: bool
    mfa_enabled: bool
    recovery_codes_remaining: int
    profile: Dict[str, str]
    created_at: str


def user_out(u: User) -> UserOut:
    return UserOut(
        id=u.id, role=u.role.value, full_name=u.full_name,
        username=u.username, email=u.email, phone=u.phone,
        email_verified=u.email_verified_at is not None,
        phone_verified=u.phone_verified_at is not None,
        mfa_enabled=bool(u.mfa_enabled),
        recovery_codes_remaining=sum(1 for c in u.recovery_codes if c.used_at is None),
        profile=json.loads(u.profile_json or "{}"),
        created_at=aware(u.created_at).isoformat() if u.created_at else "",
    )


class RegisterIn(BaseModel):
    role: Role
    full_name: str = Field(min_length=1, max_length=120)
    email: Optional[str] = None
    phone: Optional[str] = None
    username: Optional[str] = None
    password: str
    profile: Dict[str, str] = {}


class RegisterOut(BaseModel):
    user: UserOut
    verification_sent_to: List[str] = []
    # Shown ONCE, only for accounts with no email or phone — for them this is
    # the only way back in if the password is forgotten.
    recovery_codes: Optional[List[str]] = None


class LoginIn(BaseModel):
    identifier: str
    password: str


class LoginOut(BaseModel):
    status: Literal["ok", "mfa_required"]
    user: Optional[UserOut] = None
    challenge: Optional[str] = None


class MfaLoginIn(BaseModel):
    challenge: str
    code: Optional[str] = None
    recovery_code: Optional[str] = None


class ChannelIn(BaseModel):
    channel: Literal["email", "phone"]


class VerifyConfirmIn(ChannelIn):
    code: str


class ContactIn(ChannelIn):
    value: str
    password: str


class ProfileIn(BaseModel):
    full_name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    profile: Optional[Dict[str, str]] = None


class ForgotIn(BaseModel):
    identifier: str
    channel: Optional[Literal["email", "phone"]] = None


class ResetIn(BaseModel):
    identifier: str
    new_password: str
    code: Optional[str] = None
    recovery_code: Optional[str] = None


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str


class CodeIn(BaseModel):
    code: str


class PasswordIn(BaseModel):
    password: str


class DisableMfaIn(BaseModel):
    password: str
    code: Optional[str] = None
    recovery_code: Optional[str] = None


class SessionOut(BaseModel):
    id: str
    created_at: str
    last_seen_at: str
    user_agent: Optional[str] = None
    ip: Optional[str] = None
    current: bool


# ─── helpers ─────────────────────────────────────────────────────────────────


def _ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _event(db: Session, request: Request, event: str, user_id: Optional[str] = None,
           detail: Optional[str] = None) -> None:
    db.add(AuthEvent(
        user_id=user_id, event=event, ip=_ip(request),
        user_agent=(request.headers.get("user-agent") or "")[:300], detail=detail,
    ))


def _throttle(bucket: str, key: str, limit: int, window: float) -> None:
    wait = rl.hit(bucket, key, limit, window)
    if wait:
        raise HTTPException(429, f"Too many attempts. Try again in {wait // 60 + 1} min.",
                            headers={"Retry-After": str(wait)})


def _start_session(db: Session, request: Request, response: Response, user: User,
                   mfa_passed: bool) -> None:
    token, token_hash = new_token()
    now = _now()
    db.add(AuthSession(
        user_id=user.id, token_hash=token_hash, created_at=now, last_seen_at=now,
        expires_at=now + timedelta(hours=settings.SESSION_MAX_HOURS),
        mfa_passed=mfa_passed, ip=_ip(request),
        user_agent=(request.headers.get("user-agent") or "")[:300],
    ))
    response.set_cookie(
        settings.SESSION_COOKIE_NAME, token,
        max_age=settings.SESSION_MAX_HOURS * 3600, httponly=True,
        secure=settings.COOKIE_SECURE, samesite="lax", path="/",
    )


def _clear_cookie(response: Response) -> None:
    response.delete_cookie(settings.SESSION_COOKIE_NAME, path="/",
                           secure=settings.COOKIE_SECURE, httponly=True, samesite="lax")


def _revoke_sessions(db: Session, user_id: str, keep_id: Optional[str] = None) -> int:
    now, n = _now(), 0
    for s in db.query(AuthSession).filter(AuthSession.user_id == user_id,
                                          AuthSession.revoked_at.is_(None)):
        if s.id != keep_id:
            s.revoked_at = now
            n += 1
    return n


def _issue_code(db: Session, user: User, purpose: CodePurpose, channel: str) -> str:
    """Create, store (hashed) and deliver a code. Returns the masked destination."""
    destination = user.email if channel == "email" else user.phone
    now = _now()
    previous = (
        db.query(OneTimeCode)
        .filter(OneTimeCode.user_id == user.id, OneTimeCode.purpose == purpose,
                OneTimeCode.consumed_at.is_(None))
        .all()
    )
    latest = max((aware(c.created_at) for c in previous), default=None)
    if latest and (now - latest).total_seconds() < CODE_RESEND_SECONDS:
        wait = CODE_RESEND_SECONDS - int((now - latest).total_seconds())
        raise HTTPException(429, f"A code was just sent. You can request another in {wait} s.",
                            headers={"Retry-After": str(wait)})
    for c in previous:          # one live code per purpose
        c.consumed_at = now
    code = new_code()
    db.add(OneTimeCode(
        user_id=user.id, purpose=purpose, channel=channel, destination=destination,
        code_hash=hash_code(code, purpose.value, user.id), created_at=now,
        expires_at=now + timedelta(minutes=CODE_TTL_MIN),
    ))
    db.commit()
    deliver(channel, destination, purpose.value, code, CODE_TTL_MIN)
    return _mask(channel, destination)


def _consume_code(db: Session, user: User, purpose: CodePurpose, code: str) -> OneTimeCode:
    row = (
        db.query(OneTimeCode)
        .filter(OneTimeCode.user_id == user.id, OneTimeCode.purpose == purpose,
                OneTimeCode.consumed_at.is_(None))
        .order_by(OneTimeCode.created_at.desc())
        .first()
    )
    if not row or aware(row.expires_at) < _now() or row.attempts >= CODE_MAX_ATTEMPTS:
        raise HTTPException(400, GENERIC_CODE_ERROR)
    if hash_code(code or "", purpose.value, user.id) != row.code_hash:
        row.attempts += 1
        if row.attempts >= CODE_MAX_ATTEMPTS:
            row.consumed_at = _now()   # burned: request a new one
        db.commit()
        raise HTTPException(400, GENERIC_CODE_ERROR)
    row.consumed_at = _now()
    return row


def _new_recovery_codes(db: Session, user: User) -> List[str]:
    db.query(RecoveryCode).filter(RecoveryCode.user_id == user.id).delete()
    codes = [new_recovery_code() for _ in range(RECOVERY_CODE_COUNT)]
    for c in codes:
        db.add(RecoveryCode(user_id=user.id, code_hash=hash_code(c, "recovery", user.id)))
    return codes


def _use_recovery_code(db: Session, user: User, code: str) -> bool:
    h = hash_code(normalise_recovery_code(code), "recovery", user.id)
    row = (
        db.query(RecoveryCode)
        .filter(RecoveryCode.user_id == user.id, RecoveryCode.code_hash == h,
                RecoveryCode.used_at.is_(None))
        .first()
    )
    if not row:
        return False
    row.used_at = _now()
    return True


def _check_second_factor(db: Session, user: User, code: Optional[str],
                         recovery_code: Optional[str]) -> Optional[str]:
    """Returns 'totp' / 'recovery' on success, None on failure."""
    if code:
        step = verify_totp(user.mfa_secret, code, user.mfa_last_step)
        if step is not None:
            user.mfa_last_step = step
            return "totp"
    if recovery_code and _use_recovery_code(db, user, recovery_code):
        return "recovery"
    return None


# ─── dependencies (used by main.py to protect existing routes) ───────────────


def _session_from_request(request: Request, db: Session) -> Optional[AuthSession]:
    token = request.cookies.get(settings.SESSION_COOKIE_NAME)
    if not token:
        return None
    s = db.query(AuthSession).filter(AuthSession.token_hash == hash_token(token)).first()
    if not s or s.revoked_at is not None:
        return None
    now = _now()
    idle = timedelta(minutes=settings.SESSION_IDLE_MINUTES)
    if aware(s.expires_at) <= now or aware(s.last_seen_at) + idle <= now:
        s.revoked_at = now
        db.commit()
        return None
    if not s.user or not s.user.is_active:
        return None
    # Sliding idle window; write at most once a minute.
    if (now - aware(s.last_seen_at)).total_seconds() > 60:
        s.last_seen_at = now
        db.commit()
    return s


def current_session(request: Request, db: Session = Depends(get_db)) -> AuthSession:
    s = _session_from_request(request, db)
    if not s:
        raise HTTPException(401, "Sign in to continue.")
    request.state.auth_session = s
    return s


def current_user(s: AuthSession = Depends(current_session)) -> User:
    return s.user


def require_roles(*roles: Role):
    allowed = {r.value if isinstance(r, Role) else r for r in roles}

    def dep(user: User = Depends(current_user)) -> User:
        if user.role.value not in allowed:
            raise HTTPException(403, "Your account does not have access to this.")
        return user

    return dep


# ─── registration ────────────────────────────────────────────────────────────


@router.post("/register", response_model=RegisterOut, status_code=201)
def register(body: RegisterIn, request: Request, response: Response,
             db: Session = Depends(get_db)):
    _throttle("register_ip", _ip(request), 10, 15 * 60)

    email = norm_email(body.email) if body.email else None
    phone = norm_phone(body.phone) if body.phone else None
    username = norm_username(body.username) if body.username else None
    if not (email or phone or username):
        raise HTTPException(422, "Register with an email address, a phone number or a username.")

    for kind, value, label in (("email", email, "email address"),
                               ("phone", phone, "phone number"),
                               ("username", username, "username")):
        if value and _find_user(db, kind, value):
            raise HTTPException(409, f"That {label} is already registered. Try signing in.")

    problem = password_problem(body.password, email and email.split("@")[0], phone, username)
    if problem:
        raise HTTPException(422, problem)

    user = User(
        role=body.role, full_name=body.full_name.strip(),
        email=email, phone=phone, username=username,
        password_hash=hash_password(body.password),
        profile_json=json.dumps(_clean_profile(body.role, body.profile)),
    )
    db.add(user)
    db.flush()

    recovery = None
    if not (email or phone):
        recovery = _new_recovery_codes(db, user)

    _event(db, request, "register", user.id, body.role.value)
    _start_session(db, request, response, user, mfa_passed=False)
    db.commit()
    db.refresh(user)

    sent = []
    for channel, purpose in (("email", CodePurpose.VERIFY_EMAIL), ("phone", CodePurpose.VERIFY_PHONE)):
        if getattr(user, channel):
            try:
                sent.append(_issue_code(db, user, purpose, channel))
            except Exception as exc:  # delivery failure must not lose the account
                print(f"[AUTH] could not send {channel} verification: {exc}", flush=True)

    return RegisterOut(user=user_out(user), verification_sent_to=sent, recovery_codes=recovery)


# ─── login / logout ──────────────────────────────────────────────────────────


@router.post("/login", response_model=LoginOut)
def login(body: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)):
    _throttle("login_ip", _ip(request), 30, 60)
    try:
        kind, value = classify(body.identifier)
    except HTTPException:
        kind, value = "invalid", (body.identifier or "").strip().lower()
    key = f"{kind}:{value}"

    wait = rl.blocked("login_fail", key, LOGIN_FAIL_LIMIT, LOGIN_FAIL_WINDOW)
    if wait:
        raise HTTPException(429, f"Too many failed attempts. Try again in {wait // 60 + 1} min.",
                            headers={"Retry-After": str(wait)})

    user = _find_user(db, kind, value) if kind != "invalid" else None
    ok = verify_password(body.password or "", user.password_hash if user else None)
    if not ok or not user.is_active:
        rl.hit("login_fail", key, LOGIN_FAIL_LIMIT, LOGIN_FAIL_WINDOW)
        _event(db, request, "login_failed", user.id if user else None, key)
        db.commit()
        raise HTTPException(401, GENERIC_LOGIN_ERROR)

    rl.reset("login_fail", key)

    if user.mfa_enabled:
        token, token_hash = new_token()
        db.add(MfaChallenge(user_id=user.id, token_hash=token_hash,
                            expires_at=_now() + timedelta(minutes=MFA_CHALLENGE_TTL_MIN)))
        _event(db, request, "mfa_challenge", user.id)
        db.commit()
        return LoginOut(status="mfa_required", challenge=token)

    _start_session(db, request, response, user, mfa_passed=False)
    _event(db, request, "login", user.id)
    db.commit()
    return LoginOut(status="ok", user=user_out(user))


@router.post("/login/mfa", response_model=LoginOut)
def login_mfa(body: MfaLoginIn, request: Request, response: Response,
              db: Session = Depends(get_db)):
    _throttle("mfa_ip", _ip(request), 30, 60)
    ch = db.query(MfaChallenge).filter(MfaChallenge.token_hash == hash_token(body.challenge or "")).first()
    if (not ch or ch.consumed_at or aware(ch.expires_at) < _now()
            or ch.attempts >= CODE_MAX_ATTEMPTS):
        raise HTTPException(401, "This sign-in has expired. Enter your password again.")

    user = db.get(User, ch.user_id)
    method = _check_second_factor(db, user, body.code, body.recovery_code)
    if not method:
        ch.attempts += 1
        _event(db, request, "mfa_failed", user.id)
        db.commit()
        left = CODE_MAX_ATTEMPTS - ch.attempts
        raise HTTPException(401, "That code is not right." + (f" {left} attempt(s) left." if left else
                                                              " Enter your password again."))

    ch.consumed_at = _now()
    _start_session(db, request, response, user, mfa_passed=True)
    _event(db, request, "login", user.id, f"mfa:{method}")
    db.commit()
    db.refresh(user)
    return LoginOut(status="ok", user=user_out(user))


@router.post("/logout")
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    s = _session_from_request(request, db)
    if s:
        s.revoked_at = _now()
        _event(db, request, "logout", s.user_id)
        db.commit()
    _clear_cookie(response)
    return {"ok": True}


# ─── me / profile / contact ──────────────────────────────────────────────────


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(current_user)):
    return user_out(user)


@router.patch("/me", response_model=UserOut)
def update_me(body: ProfileIn, request: Request, user: User = Depends(current_user),
              db: Session = Depends(get_db)):
    if body.full_name is not None:
        user.full_name = body.full_name.strip()
    if body.profile is not None:
        merged = {**json.loads(user.profile_json or "{}"), **_clean_profile(user.role, body.profile, partial=True)}
        _clean_profile(user.role, merged)  # still complete after the edit
        user.profile_json = json.dumps(merged)
    _event(db, request, "profile_updated", user.id)
    db.commit()
    db.refresh(user)
    return user_out(user)


@router.put("/me/contact", response_model=UserOut)
def set_contact(body: ContactIn, request: Request, user: User = Depends(current_user),
                db: Session = Depends(get_db)):
    """Add or change the email / phone. Password required: this is the account
    recovery channel, so changing it is as sensitive as changing the password."""
    _throttle("contact_user", user.id, 5, 15 * 60)
    if not verify_password(body.password, user.password_hash):
        raise HTTPException(403, "Your password is not right.")
    value = norm_email(body.value) if body.channel == "email" else norm_phone(body.value)
    other = _find_user(db, body.channel, value)
    if other and other.id != user.id:
        raise HTTPException(409, f"That {'email address' if body.channel == 'email' else 'phone number'} "
                                 "is already registered to another account.")
    if getattr(user, body.channel) != value:
        setattr(user, body.channel, value)
        setattr(user, f"{body.channel}_verified_at", None)
        _event(db, request, f"{body.channel}_changed", user.id)
        db.commit()
        _issue_code(db, user, CodePurpose.VERIFY_EMAIL if body.channel == "email"
                    else CodePurpose.VERIFY_PHONE, body.channel)
    db.refresh(user)
    return user_out(user)


# ─── email / phone verification ──────────────────────────────────────────────


@router.post("/verify/send")
def verify_send(body: ChannelIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if not getattr(user, body.channel):
        raise HTTPException(400, f"Add a {'email address' if body.channel == 'email' else 'phone number'} first.")
    if getattr(user, f"{body.channel}_verified_at"):
        raise HTTPException(400, "Already verified.")
    purpose = CodePurpose.VERIFY_EMAIL if body.channel == "email" else CodePurpose.VERIFY_PHONE
    return {"ok": True, "sent_to": _issue_code(db, user, purpose, body.channel),
            "expires_in_minutes": CODE_TTL_MIN}


@router.post("/verify/confirm", response_model=UserOut)
def verify_confirm(body: VerifyConfirmIn, request: Request, user: User = Depends(current_user),
                   db: Session = Depends(get_db)):
    _throttle("verify_user", user.id, 20, 15 * 60)
    purpose = CodePurpose.VERIFY_EMAIL if body.channel == "email" else CodePurpose.VERIFY_PHONE
    row = _consume_code(db, user, purpose, body.code)
    if row.destination != getattr(user, body.channel):   # contact changed since send
        db.commit()
        raise HTTPException(400, GENERIC_CODE_ERROR)
    setattr(user, f"{body.channel}_verified_at", _now())
    _event(db, request, f"{body.channel}_verified", user.id)
    db.commit()
    db.refresh(user)
    return user_out(user)


# ─── password reset / recovery ───────────────────────────────────────────────

FORGOT_MESSAGE = ("If an account matches, a reset code has been sent to its email or phone. "
                  "No email or phone on the account? Use one of your recovery codes instead.")


@router.post("/password/forgot")
def password_forgot(body: ForgotIn, request: Request, db: Session = Depends(get_db)):
    _throttle("forgot_ip", _ip(request), 10, 15 * 60)
    try:
        kind, value = classify(body.identifier)
        user = _find_user(db, kind, value)
    except HTTPException:
        user = None
    if user and user.is_active:
        channel = body.channel if body.channel and getattr(user, body.channel) else (
            "email" if user.email else "phone" if user.phone else None)
        if channel:
            try:
                _issue_code(db, user, CodePurpose.RESET_PASSWORD, channel)
                _event(db, request, "password_reset_requested", user.id, channel)
                db.commit()
            except HTTPException:
                pass  # resend cooldown — answer identically, reveal nothing
    # Identical answer either way: this endpoint must not confirm an account exists.
    return {"ok": True, "message": FORGOT_MESSAGE, "expires_in_minutes": CODE_TTL_MIN}


@router.post("/password/reset")
def password_reset(body: ResetIn, request: Request, db: Session = Depends(get_db)):
    _throttle("reset_ip", _ip(request), 20, 15 * 60)
    try:
        kind, value = classify(body.identifier)
    except HTTPException:
        raise HTTPException(400, GENERIC_CODE_ERROR)
    _throttle("reset_ident", f"{kind}:{value}", 10, 15 * 60)
    user = _find_user(db, kind, value)
    if not user or not user.is_active or not (body.code or body.recovery_code):
        raise HTTPException(400, GENERIC_CODE_ERROR)

    problem = password_problem(body.new_password, user.email and user.email.split("@")[0],
                               user.phone, user.username)
    if problem:
        raise HTTPException(422, problem)

    if body.code:
        row = _consume_code(db, user, CodePurpose.RESET_PASSWORD, body.code)
        # Receiving the code proves control of that channel.
        if row.destination == getattr(user, row.channel):
            setattr(user, f"{row.channel}_verified_at", aware(getattr(user, f"{row.channel}_verified_at")) or _now())
        method = row.channel
    else:
        if not _use_recovery_code(db, user, body.recovery_code):
            db.commit()
            raise HTTPException(400, GENERIC_CODE_ERROR)
        method = "recovery_code"

    user.password_hash = hash_password(body.new_password)
    user.password_changed_at = _now()
    ended = _revoke_sessions(db, user.id)
    rl.reset("login_fail", f"{kind}:{value}")
    _event(db, request, "password_reset", user.id, f"{method}; ended {ended} session(s)")
    db.commit()
    # Deliberately no session: sign in normally, which still enforces MFA.
    return {"ok": True}


@router.post("/password/change")
def password_change(body: ChangePasswordIn, request: Request,
                    s: AuthSession = Depends(current_session), db: Session = Depends(get_db)):
    user = s.user
    _throttle("change_pw_user", user.id, 5, 15 * 60)
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(403, "Your current password is not right.")
    problem = password_problem(body.new_password, user.email and user.email.split("@")[0],
                               user.phone, user.username)
    if problem:
        raise HTTPException(422, problem)
    user.password_hash = hash_password(body.new_password)
    user.password_changed_at = _now()
    ended = _revoke_sessions(db, user.id, keep_id=s.id)
    _event(db, request, "password_changed", user.id, f"ended {ended} other session(s)")
    db.commit()
    return {"ok": True, "other_sessions_ended": ended}


# ─── MFA (TOTP authenticator app) ────────────────────────────────────────────


@router.post("/mfa/setup")
def mfa_setup(user: User = Depends(current_user), db: Session = Depends(get_db)):
    if user.mfa_enabled:
        raise HTTPException(400, "Two-step verification is already on.")
    user.mfa_pending_secret = new_totp_secret()
    db.commit()
    account = user.email or user.phone or user.username
    return {"secret": user.mfa_pending_secret, "otpauth_uri": totp_uri(user.mfa_pending_secret, account)}


@router.post("/mfa/enable")
def mfa_enable(body: CodeIn, request: Request, s: AuthSession = Depends(current_session),
               db: Session = Depends(get_db)):
    user = s.user
    _throttle("mfa_enable_user", user.id, 10, 15 * 60)
    if user.mfa_enabled:
        raise HTTPException(400, "Two-step verification is already on.")
    if not user.mfa_pending_secret:
        raise HTTPException(400, "Start set-up first.")
    step = verify_totp(user.mfa_pending_secret, body.code)
    if step is None:
        raise HTTPException(400, "That code is not right. Check the time on your phone is set automatically.")
    user.mfa_secret, user.mfa_pending_secret = user.mfa_pending_secret, None
    user.mfa_enabled, user.mfa_last_step = True, step
    s.mfa_passed = True
    codes = _new_recovery_codes(db, user)
    _event(db, request, "mfa_enabled", user.id)
    db.commit()
    return {"ok": True, "recovery_codes": codes}


@router.post("/mfa/disable", response_model=UserOut)
def mfa_disable(body: DisableMfaIn, request: Request, user: User = Depends(current_user),
                db: Session = Depends(get_db)):
    _throttle("mfa_disable_user", user.id, 5, 15 * 60)
    if not user.mfa_enabled:
        raise HTTPException(400, "Two-step verification is not on.")
    if not verify_password(body.password, user.password_hash):
        raise HTTPException(403, "Your password is not right.")
    if not _check_second_factor(db, user, body.code, body.recovery_code):
        db.commit()
        raise HTTPException(403, "That code is not right.")
    user.mfa_enabled, user.mfa_secret, user.mfa_last_step = False, None, None
    _event(db, request, "mfa_disabled", user.id)
    db.commit()
    db.refresh(user)
    return user_out(user)


@router.post("/recovery-codes")
def regenerate_recovery_codes(body: PasswordIn, request: Request, user: User = Depends(current_user),
                              db: Session = Depends(get_db)):
    _throttle("recovery_user", user.id, 5, 15 * 60)
    if not verify_password(body.password, user.password_hash):
        raise HTTPException(403, "Your password is not right.")
    codes = _new_recovery_codes(db, user)
    _event(db, request, "recovery_codes_regenerated", user.id)
    db.commit()
    return {"recovery_codes": codes}


# ─── sessions ────────────────────────────────────────────────────────────────


@router.get("/sessions", response_model=List[SessionOut])
def list_sessions(s: AuthSession = Depends(current_session), db: Session = Depends(get_db)):
    now = _now()
    idle = timedelta(minutes=settings.SESSION_IDLE_MINUTES)
    rows = (
        db.query(AuthSession)
        .filter(AuthSession.user_id == s.user_id, AuthSession.revoked_at.is_(None))
        .order_by(AuthSession.last_seen_at.desc())
        .all()
    )
    return [
        SessionOut(id=r.id, created_at=aware(r.created_at).isoformat(),
                   last_seen_at=aware(r.last_seen_at).isoformat(),
                   user_agent=r.user_agent, ip=r.ip, current=r.id == s.id)
        for r in rows
        if aware(r.expires_at) > now and aware(r.last_seen_at) + idle > now
    ]


@router.delete("/sessions/{session_id}")
def revoke_session(session_id: str, request: Request, response: Response,
                   s: AuthSession = Depends(current_session), db: Session = Depends(get_db)):
    target = db.get(AuthSession, session_id)
    if not target or target.user_id != s.user_id:
        raise HTTPException(404, "Session not found.")
    target.revoked_at = _now()
    _event(db, request, "session_revoked", s.user_id, session_id)
    db.commit()
    if target.id == s.id:
        _clear_cookie(response)
    return {"ok": True}


@router.post("/sessions/revoke-others")
def revoke_other_sessions(request: Request, s: AuthSession = Depends(current_session),
                          db: Session = Depends(get_db)):
    n = _revoke_sessions(db, s.user_id, keep_id=s.id)
    _event(db, request, "sessions_revoked", s.user_id, f"{n} other session(s)")
    db.commit()
    return {"ok": True, "ended": n}
