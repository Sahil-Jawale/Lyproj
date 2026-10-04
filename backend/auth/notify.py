"""
Delivery of one-time codes.

  email — sent over SMTP when SMTP_HOST is set; otherwise printed to the
          backend console.
  phone — printed to the backend console. There is no SMS provider wired in;
          `send_sms` is the single function to replace (MSG91, Twilio, ...).

Console delivery is a development convenience, not a fallback to rely on: it
puts live codes in the server log. Configure a real channel before anyone but
a developer uses the system.
"""

from __future__ import annotations

import os
import smtplib
from email.message import EmailMessage

SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM = os.getenv("SMTP_FROM", SMTP_USER or "no-reply@prescriptai.local")

_SUBJECTS = {
    "verify_email": "Verify your email",
    "verify_phone": "Verify your phone",
    "reset_password": "Reset your password",
}


def _console(channel: str, destination: str, purpose: str, code: str) -> None:
    print(
        f"[AUTH] {channel} code for {destination} ({purpose}): {code}"
        "   <- dev delivery; configure SMTP / an SMS provider for real use",
        flush=True,
    )


def send_email(to: str, purpose: str, code: str, minutes: int) -> None:
    if not SMTP_HOST:
        _console("email", to, purpose, code)
        return
    msg = EmailMessage()
    msg["Subject"] = f"PrescriptAI — {_SUBJECTS.get(purpose, 'Your code')}"
    msg["From"] = SMTP_FROM
    msg["To"] = to
    msg.set_content(
        f"Your PrescriptAI code is {code}\n\n"
        f"It expires in {minutes} minutes and can be used once.\n"
        "If you did not ask for this, ignore this email — nothing changes "
        "until the code is entered."
    )
    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15) as s:
        s.starttls()
        if SMTP_USER:
            s.login(SMTP_USER, SMTP_PASSWORD)
        s.send_message(msg)


def send_sms(to: str, purpose: str, code: str, minutes: int) -> None:
    _console("sms", to, purpose, code)


def deliver(channel: str, destination: str, purpose: str, code: str, minutes: int) -> None:
    (send_email if channel == "email" else send_sms)(destination, purpose, code, minutes)
