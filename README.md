# PrescriptAI

**Reads a photo of a handwritten Indian prescription, says what it can and cannot
read, maps each brand to its ingredients, checks those ingredients against a cited
drug-interaction table, and puts every page in front of a doctor before it is used.**

> ⚠️ **Not a medical device.** Every extraction is AI-generated and can be wrong. The
> product is designed around mandatory clinician review (Phase 1): nothing is
> dispensed on the model's word alone.

| | |
|---|---|
| **Status** | Working end to end on real prescriptions (S0 → S5). Testing phase. |
| **Reader** | Claude Opus 5 vision (`claude-opus-5`, `effort: medium`), or a free mock |
| **Target** | English-language prescriptions, primarily Indian |
| **Cost** | ~$0.034 per prescription measured; cached re-runs are free |
| **Stack** | Python 3.12+ · FastAPI · SQLite · React 19 + Vite + Tailwind |
| **Accounts** | Doctor / patient / pharmacy sign-in, MFA, recovery. See [§6a](#6a-authentication). |

---

## Contents

1. [How it works](#1-how-it-works)
2. [Repository layout](#2-repository-layout)
3. [Quick start](#3-quick-start)
4. [Running the pipeline directly](#4-running-the-pipeline-directly)
5. [API reference](#5-api-reference)
6. [Core concepts](#6-core-concepts)
   - [6a. Authentication](#6a-authentication)
7. [Design rules: do not break these](#7-design-rules-do-not-break-these)
8. [Configuration](#8-configuration)
9. [Data](#9-data)
10. [Cost control](#10-cost-control)
11. [Current status](#11-current-status)
12. [Known issues and stale files](#12-known-issues-and-stale-files)
13. [Deliberately not built](#13-deliberately-not-built)
14. [Roadmap](#14-roadmap)
15. [Where to read more](#15-where-to-read-more)

---

## 1. How it works

The pipeline is six stages. Each boundary is a typed contract in
[`ml_pipeline/schemas.py`](ml_pipeline/schemas.py).

```
 photo ─► S0 Ingest      EXIF-rotate, downscale to the VLM's token budget, JPEG.
          │              No binarisation. Hash of the final bytes = cache key.
          ▼
          S1 VLM read    Whole page → PageRead JSON (schema-guaranteed).
          │              Verbatim text, per-line confidence, alternatives, bbox.
          │              Can say "not_a_prescription" or "illegible".
          ▼
          S2 Vocabulary  RapidFuzz against 239k Indian brands (full + base-name
          │              indices) and 1,679 generic ingredients.
          │              → CONFIRMED / PROBABLE / AMBIGUOUS / UNMATCHED / ILLEGIBLE
          ▼
          S3 Brand →     Brand → composition ("Azenac MR" → Aceclofenac + Paracetamol).
          │  generic     Each ingredient checked against NLEM 2022.
          │              → VERIFIED / PARTIAL / UNVERIFIED / UNKNOWN
          ▼
          S4 DDI check   Deterministic lookup: 180 cited rules over 212 drugs
          │              (NetworkX graph). Only NLEM-verified ingredients of
          │              CONFIRMED/PROBABLE medicines enter. Everything else is
          │              listed in `skipped` with a reason.
          ▼
          S5 Doctor      Review screen: page image beside the extraction, per-line
             review      crops. Every edit and every confirmation is logged.
                         That log is the audit trail and the future training corpus.
```

The backend runs S0 → S4 on upload, stores everything, and sends the doctor to the
review screen.

**Why a VLM and not OCR:** the earlier version fine-tuned TrOCR on 4.6k word crops
and reached 6% raw / 14% post-fuzzy accuracy. The product needs whole pages read,
and a VLM reads whole pages with no training data. TrOCR is gone from the serving
path. The reasoning is in [`docs/ARCHITECTURE_V2.md`](docs/ARCHITECTURE_V2.md) §2–3.

---

## 2. Repository layout

```
.
├── README.md                 ← you are here: overview + how to run
├── claude.md                 ← implementation journal: what was built, what broke, why
├── docs/
│   ├── ARCHITECTURE_V2.md    ← design rationale, stage specs, cost model, roadmap (§ refs)
│   └── DAY1_PLAN.md          ← the original 3-track build plan
├── .env.example              ← copy to .env
│
├── ml_pipeline/              ← the pipeline (importable modules + CLIs)
│   ├── schemas.py            shared contracts: PageRead, ResolvedMedicine, Outcome, ...
│   ├── env.py                loads project-root .env (real env vars win)
│   ├── config/thresholds.yaml   S2 matching + confidence thresholds (all guesses, see §8)
│   ├── ingest/normalise.py   S0
│   ├── vlm/
│   │   ├── prompts.py        S1 system prompt; PROMPT_VERSION + fingerprint
│   │   ├── page_reader.py    S1 readers: MockPageReader, ClaudePageReader, CachedPageReader
│   │   ├── spend.py          spend ledger + hard cap
│   │   └── vocab.py          S2 (+ calls S3): resolve_page()
│   ├── normalise/
│   │   ├── india_medicines.py   S2/S3 data: brand indices, compositions, NLEM gate
│   │   └── drug_names.py        salt/ester stripping, INN↔USAN synonyms
│   ├── drug_interaction/
│   │   ├── build_knowledge_graph.py   loads DDI Database.json → NetworkX graph
│   │   ├── interaction_inference.py   S4: InteractionChecker
│   │   └── severity_labels.py
│   └── data/
│       ├── ddi_dataset/DDI Database.json   committed (180 rules)
│       └── india/*.csv                     NOT committed, see §9
│
├── backend/                  ← FastAPI app (port 8000)
│   ├── main.py               all routes; wires S0→S4; READER env var; CSRF + CORS
│   ├── models.py             SQLAlchemy: Prescription, Correction, InteractionRun
│   ├── auth/                 accounts for every stakeholder (§6a)
│   │   ├── routes.py         /api/auth/*; current_user / require_roles dependencies
│   │   ├── models.py         users, auth_sessions, one_time_codes, mfa_challenges,
│   │   │                     recovery_codes, auth_events
│   │   ├── security.py       scrypt, token/code hashing, TOTP (stdlib only)
│   │   ├── notify.py         code delivery: SMTP email, else console
│   │   └── ratelimit.py      in-memory throttling
│   ├── config/               settings.py, database.py (SQLite by default)
│   └── uploads/              uploaded images (gitignored)
│
├── web_app/                  ← main React app (port 5173). Clinical light theme.
│   └── src/
│       ├── pages/            Home, Upload, Review, Results, Interactions, History, Dashboard
│       ├── components/       Layout, Navbar, MedicineCard, MedicalBackdrop, Logo
│       ├── pages/auth/       Login, Register, ForgotPassword, Verify, Account, RoleHome
│       ├── components/auth/  AuthUI (shared form pieces), RequireAuth (route guard)
│       ├── services/api.js   axios client: cookie + CSRF header, 120s timeout
│       ├── services/auth.js  /api/auth/* calls, ROLE_HOME
│       ├── store/            zustand: useAppStore, useAuthStore (who is signed in)
│       └── data/ddiDrugs.js  210 generics generated from DDI Database.json (autocomplete)
│
├── pharmacy_dashboard/       ← separate React app (port 3001). Static demo data only, see §12
└── docker-compose.yml        ← stale, see §12
```

---

## 3. Quick start

### Prerequisites

- **Python 3.12+**. `backend/config/settings.py` nests double quotes inside an
  f-string, which is a syntax error before 3.12.
- **Node.js 18+** and npm
- **The Indian medicine CSVs** in `ml_pipeline/data/india/` (§9). Without them,
  upload fails at S2.
- An **Anthropic API key**. Optional if you use the mock reader.

### 1. Environment

```bash
cp .env.example .env
# edit .env: set ANTHROPIC_API_KEY, and PRESCRIPTAI_SPEND_CAP if you want a lower cap
```

### 2. Python dependencies

The `requirements.txt` files are out of date (§12). Install what the code
actually imports:

```bash
pip install fastapi "uvicorn[standard]" python-multipart sqlalchemy pydantic \
            pillow numpy pandas rapidfuzz networkx pyyaml python-dotenv anthropic
```

### 3. Backend

```bash
cd backend
python main.py                    # real reader → http://localhost:8000  (docs at /docs)
```

To run with no key and no cost, use the mock reader:

```bash
READER=mock python main.py        # bash
$env:READER="mock"; python main.py   # PowerShell
```

`READER` accepts `claude` (default), `mock`, or `mock_negative` (returns
"not a prescription").

### 4. Web app

```bash
cd web_app
npm install
npm run dev                       # → http://localhost:5173
```

`VITE_API_URL` sets the backend URL (default `http://localhost:8000`).

**First run:** open the site and **Create account → Doctor**. Prescription screens
need a signed-in doctor. The email/phone verification code is **printed in the backend
terminal** unless SMTP is configured (§8). Patients and pharmacies can register too,
but their screens are placeholders until Workflow stages 4–7 are built.

**The flow:** Upload → **Review** (image beside extraction; correct or confirm) →
Results. History and Dashboard are computed from real stored records.

Use `http://localhost:5173`, not `127.0.0.1:5173`. The session cookie belongs to
`localhost`, so mixing the two hosts looks like being signed out.

**Demo note:** most real outpatient prescriptions (analgesics, antibiotics, PPIs)
correctly return **no interactions**. To show S4 firing, use a known high-risk pair,
e.g. `Cofarin 1mg` (Warfarin) + `ALFAM 400MG` (Ibuprofen) → SEVERE, GI bleeding. In
the Interactions page, try `Warfarin` + `Ibuprofen` or `Sildenafil` + `Nitroglycerin`.

---

## 4. Running the pipeline directly

All modules are runnable from `ml_pipeline/`:

```bash
cd ml_pipeline

python -m ingest.normalise path/to/*.jpg                  # S0 + image token accounting
python -m vlm.page_reader --reader mock path/to/rx.jpg    # S1, free
python -m vlm.page_reader --reader mock_negative rx.jpg   # S1, "not a prescription" path
python -m vlm.page_reader --reader claude rx.jpg          # S1 for real (needs key)
python -m vlm.vocab --reader mock rx.jpg                  # S1 + S2 + S3 together
python -m vlm.prompts                                     # prompt version + fingerprint
python -m vlm.spend                                       # spend so far vs cap
python env.py                                             # is .env loaded / key set?
```

`page_reader` also takes `--model`, `--effort`, `--no-cache`.

Response cache and spend ledger: `ml_pipeline/.cache/` (gitignored; the cache can
contain patient data). Delete it to force a cold run.

---

## 5. API reference

Base URL `http://localhost:8000`. Interactive docs at `/docs`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Status, reader kind, prompt version, spend / cap / remaining. **Public.** |
| POST | `/api/prescriptions/upload` | Multipart `image`. Runs S0→S4, persists, returns `PrescriptionOut`. `502` if the reader fails (spend cap, auth, API). |
| GET | `/api/prescriptions?limit&offset` | Newest first |
| GET | `/api/prescriptions/{id}` | One prescription |
| POST | `/api/prescriptions/{id}/corrections` | Log one doctor edit (`medicine_index`, `field`, `corrected_value`, `correction_type`). The predicted value is read server-side, never trusted from the client. The edit is also applied. |
| POST | `/api/prescriptions/{id}/review` | Mark a page confirmed. Unchanged pages are labels too. |
| POST | `/api/interactions/check` | Ad-hoc lookup by **generic** names. Bypasses S2/S3; for the manual lookup screen only. **Public.** |
| GET | `/api/stats` | Totals, `coverage` (fraction CONFIRMED/PROBABLE), corrections logged, spend |
| GET | `/api/corrections?limit` | The correction log (training corpus) |

**Access:** every `/api/prescriptions*`, `/api/stats` and `/api/corrections` route
requires a signed-in **doctor** (`401` signed out, `403` other roles). Images are
served at `/uploads/{id}.{ext}` through a doctor-only route, not an open static
directory. `corrected_by` / `reviewed_by` are the signed-in user's id, taken from the
session and never from the request body. Every prescription response carries a
`disclaimer` string. The auth routes are listed in §6a.

**Every POST/PUT/PATCH/DELETE to `/api/*` must send `X-Requested-With: PrescriptAI`**
(CSRF guard). `web_app` sets it on every request; curl and scripts must add it.

**Database** (`backend/models.py`, SQLite at `backend/prescriptai.db` by default):

- `prescriptions`: image path + sha256, `model` / `prompt_version` / `effort`,
  `raw_response`, `page_read_json`, `resolved_json`, header fields, cost,
  `from_cache`, `reviewed_at` / `reviewed_by`
- `corrections`: before **and** after, `correction_type`
  (`misread` / `hallucinated` / `missed` / `wrong_field` / `other`), model
  confidence, match score, outcome, verification, who, when
- `interaction_runs`: S4 result per prescription
- Auth tables: see §6a

---

## 6. Core concepts

Each medicine carries **two independent facts**. The UI shows both.

**`outcome`: how sure we are about what was *written*** (S2)

| Outcome | Meaning |
|---|---|
| `confirmed` | Strong read, clean vocabulary match, clear winner |
| `probable` | Accepted but flagged: weak VLM confidence, or a near-miss match |
| `ambiguous` | Narrowed to N candidates; the doctor picks one (buttons, never free text) |
| `unmatched` | Read clearly, but not in the medicine database |
| `illegible` | Could not read it |

**`verification`: how sure we are about *which drug* it is** (S3, per ingredient, NLEM 2022)

| Tier | Meaning |
|---|---|
| `verified` | Every ingredient is on NLEM |
| `partial` | Some are, some are not (common for combinations) |
| `unverified` | None are. This means "not on the essential list", **not** "not a real drug". |
| `unknown` | Brand not found in the dataset |

**Other fields worth knowing:**

- `raw_reading`: the model's primary reading, verbatim. Always preserved.
- `matched_via`: set when an *alternative* reading, not the primary, produced the match.
- `candidates`: for `ambiguous`
- `needs_hard_confirmation`: the UI must make the doctor confirm this one explicitly
- `skipped` (on the interaction result): every medicine or ingredient excluded from
  S4, with the reason

**Confidence works as a downgrade, not a veto:** VLM confidence ≥ 0.60 can reach
CONFIRMED; below 0.60 it is capped at PROBABLE; below 0.45 it is ILLEGIBLE. Real
Opus 5 confidences on handwritten brands cluster at 0.50–0.62, so a hard veto at
0.60 threw away correct reads.

---

## 6a. Authentication

One account system for the three stakeholders in [`Workflow.md`](Workflow.md):
**doctor**, **patient** and **chemist** (shown as "Pharmacy"). Code lives in
`backend/auth/` and `web_app/src/pages/auth/`. It uses only the Python standard
library, no new backend dependencies.

| Capability | How it works |
|---|---|
| **Register** with email, phone **or** username | At least one. Stored normalised: email lowercased, phone to E.164 (a bare 10-digit number is taken as +91), username lowercased (3–32 chars). Each is unique. Role-specific profile: doctor → speciality, clinic address (+ optional registration no.); chemist → pharmacy name, address (+ optional drug licence no.); patient → name only. |
| **Log in** | Any of the three identifiers + password. Wrong password and unknown user give the same message, the same timing (a dummy hash is computed) and the same throttling, so login can't be used to discover accounts. |
| **Log out** | Ends *this* session server-side and clears the cookie. Account page: end any single session, or every other one. |
| **Password reset / recovery** | 6-digit code to the account's email or phone (10 min, 5 attempts, single use, 60 s resend cooldown), **or** a single-use recovery code. `forgot` answers identically whether or not the account exists. A reset signs in nowhere, ends every session, and leaves MFA on. Username-only accounts get 10 recovery codes at sign-up, because nothing else can recover them. |
| **Sessions** | Opaque 256-bit token in an `HttpOnly`, `SameSite=Lax` cookie; only its SHA-256 is stored. Ends after `SESSION_IDLE_MINUTES` idle (60) or `SESSION_MAX_HOURS` (12). Changing the password ends other sessions. CSRF: required `X-Requested-With` header + explicit CORS origin list. |
| **MFA** | TOTP authenticator app (RFC 6238), QR + manual key. Enabling issues 10 recovery codes. After the password, login returns an `mfa_required` challenge (5 min, 5 tries), and no session exists until the code is right. A TOTP code can't be replayed. Disabling needs password + code. |
| **Email / phone verification** | Code sent at sign-up and whenever a contact is added or changed (which needs the password). A successful reset by code also verifies that channel. |
| **Passwords** | scrypt (n=2¹⁵, r=8), per-password salt, parameters stored in the hash. 10–128 chars, a small common-password blocklist, must not contain the email/phone/username. |
| **Audit** | `auth_events`: register, login, login_failed, mfa_*, logout, password_*, *_verified, *_changed, session(s)_revoked, with ip and user agent. |
| **Throttling** | Per-IP and per-identifier sliding windows: 5 failed logins / 15 min per identifier → `429`. |

**Routes** (`/api/auth/…`): `register`, `login`, `login/mfa`, `logout`, `me` (GET/PATCH),
`me/contact` (PUT), `verify/send`, `verify/confirm`, `password/forgot`,
`password/reset`, `password/change`, `mfa/setup`, `mfa/enable`, `mfa/disable`,
`recovery-codes`, `sessions` (GET), `sessions/{id}` (DELETE), `sessions/revoke-others`.

**Protecting a new route:** add `user: User = Depends(require_roles(Role.DOCTOR))`
(or `current_user` for any signed-in user) from `auth`. Never take the actor's
identity from the request body.

**Frontend:** `useAuthStore` holds the profile only (the token is unreadable by
design). `RequireAuth roles={[...]}` guards routes; a `401` from any API call signs
the UI out. After login: doctor → `/upload`, patient → `/patient`,
chemist → `/pharmacy`. Navbar links depend on the role.

**Not production-ready yet** (see §12): codes are printed to the console when SMTP is
missing, and SMS always goes there; the rate limiter is per-process memory; the TOTP
secret is stored unencrypted; doctors and pharmacies self-register with no licence
check.

---

## 7. Design rules: do not break these

These come from real bugs and measured failures. The details are in `claude.md`.

1. **Never silently correct in S1.** The prompt transcribes verbatim ("Dijoxin" stays
   "Dijoxin"). Correction happens in S2, where it is scored and auditable.
2. **`raw_reading` is always preserved,** even when a match replaces the name.
3. **Nothing is silently dropped from the safety check.** Exclusions go in `skipped`
   with a reason. "Checked 4 of 6" and "checked 6" are different claims.
4. **Only NLEM-verified ingredients of CONFIRMED/PROBABLE medicines enter S4.** A
   wrong mapping becomes a wrong safety verdict.
5. **The reading is always shown.** Verification changes how strong the warning is,
   never whether the result is visible.
6. **Never fabricate results in the frontend.** No mock fallbacks on API failure, no
   client-side interaction tables. A failure says it failed. (Both existed once and
   were removed.)
7. **Abstention is a valid answer.** There is no "Unrecognized" placeholder medicine.
8. **Anything that changes the output belongs in the cache key:** image hash, prompt
   version, prompt fingerprint, model, effort. Editing the prompt without bumping
   `PROMPT_VERSION` is safe because the fingerprint changes too.
9. **Fail loudly on missing data.** The DDI loader raises `DDILoadError` instead of
   falling back to a handful of hardcoded rules. The medicines loader raises if the
   CSVs are missing.
10. **On duplicate DDI rules with conflicting severity, the most severe wins** (e.g.
    Nitroglycerin + Sildenafil was listed as both Major and Minor).
11. **Matching is case- and punctuation-insensitive** (`match_key()`). Prescriptions
    are often in block capitals, and Indian brands mix `-`, `.` and spaces.
12. **Thresholds live in `config/thresholds.yaml`, not in code.** Do not tune them
    against the test split.
13. **Log confirmations, not only corrections.** A corpus of only edits is biased.
14. **The headline metric is coverage, not accuracy.** The system is allowed to abstain.
15. **Patient data is behind a role check on the server.** The UI guard is a
    convenience; the API dependency is the control. The actor in an audit field
    always comes from the session.
16. **Auth endpoints must not reveal whether an account exists** (login, forgot,
    reset). Keep messages, timing and throttling identical.

---

## 8. Configuration

### Environment (`.env` at the project root; real env vars override it)

| Variable | Default | Used by |
|---|---|---|
| `ANTHROPIC_API_KEY` | none | S1 Claude reader (required unless `READER=mock`) |
| `READER` | `claude` | backend: `claude` / `mock` / `mock_negative` |
| `PRESCRIPTAI_SPEND_CAP` | `30` (USD) | spend guard; refuses calls past this |
| `DATABASE_URL` | `sqlite:///backend/prescriptai.db` | backend |
| `SQL_ECHO` | off | set `1` to log SQL |
| `VITE_API_URL` | `http://localhost:8000` | web_app |
| `SECRET_KEY` | dev default (warned at startup) | HMAC key for one-time and recovery codes. **Set it.** |
| `SESSION_IDLE_MINUTES` / `SESSION_MAX_HOURS` | `60` / `12` | session lifetime |
| `COOKIE_SECURE` | `false` | must be `true` behind HTTPS |
| `SESSION_COOKIE_NAME` | `prescriptai_session` | |
| `CORS_ORIGINS` | localhost:5173, 127.0.0.1:5173, :3001, :3000 | origins allowed to send the session cookie |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_FROM` | unset | email delivery for codes; unset → printed to the console |
| `REDIS_URL`, `CELERY_*`, `ML_SERVICE_URL` | | in `settings.py` but **unused**: scaffolding |

### Thresholds ([`ml_pipeline/config/thresholds.yaml`](ml_pipeline/config/thresholds.yaml))

| Key | Value | Meaning |
|---|---|---|
| `matching.confirm_score` | 88 | Fuzzy score needed for CONFIRMED |
| `matching.confirm_margin` | 6 | Required lead over the runner-up |
| `matching.abstain_score` | 82 | Below this, abstain |
| `matching.candidate_limit` | 5 | Candidates shown for AMBIGUOUS |
| `matching.collapse_same_composition` | true | Two brands of the same composition don't count as ambiguous (reviewer load 19% → 4%) |
| `reading.confident_read` | 0.60 | VLM confidence needed to reach CONFIRMED |
| `reading.abstain_below` | 0.45 | Below this, ILLEGIBLE |
| `nlem.enabled` | true | Per-ingredient NLEM verification |

**Every number here is a guess.** Calibrating them against logged doctor corrections
is roadmap tier T0 (§14).

---

## 9. Data

| Data | In git? | Notes |
|---|---|---|
| `ml_pipeline/data/ddi_dataset/DDI Database.json` | ✅ | 180 interactions, 212 drugs, 175 edges, with severity, mechanism, safer alternative, citation (e.g. DrugBank 6.0) |
| `ml_pipeline/data/india/indian_medicines_master.csv` | ❌ gitignored | 239,640 brands. Columns: `Brand Name, Composition, Strength, Form, Manufacturer`. **Required for S2/S3.** |
| `ml_pipeline/data/india/nlem2022_formulations.csv` | ❌ gitignored | NLEM 2022: 241 molecules + 63 aliases. Columns include `molecule`, `aliases`. **Required.** |
| `ml_pipeline/data/india/nlem_verified_medicines.csv` | ❌ gitignored | 40,451 brands pre-joined to NLEM codes. **Not read by any code; optional.** |

**Required formats** (read with `pandas.read_csv`, UTF-8, header row required; extra columns are ignored):

- `indian_medicines_master.csv`: all five columns must exist (blanks are allowed). `Brand Name`
  may include strength (`Crocin 650`), because the loader strips it for a second index.
  `Composition` is ingredient names joined by ` + ` (`Aceclofenac + Paracetamol`).
  Strengths in parentheses (`Paracetamol (500mg)`) are tolerated, but bare strengths
  (`Paracetamol 500mg`) break NLEM and DDI matching.
- `nlem2022_formulations.csv`: `molecule` is one generic name per row; `aliases` holds
  alternative names separated by `;` or `,` (may be blank).
| `VLM_CHECK/` eval images | ❌ gitignored | Real prescriptions with patient names and prescriber details (PHI) |

**Get the CSVs from a teammate**, since they aren't in the repo. Rejected sources,
so nobody re-evaluates them: `India Medicines and Drug Info Dataset.csv` (64.6% of
compositions truncated) and `CDSCO.pdf` (one page, about 4 entries).

**Privacy:** uploaded images, the VLM response cache and the database all contain
patient data and are gitignored. Keep it that way.

---

## 10. Cost control

- **Measured:** ~$0.034 per prescription on Opus 5 at `effort: medium` (input ~1.2k,
  cached prefix ~3.2k, output ~1.1k tokens). Thinking tokens were 0 in practice.
- **Prompt caching** is on. The ~3k-token system prompt is read at 0.1×.
- **Response cache** (`CachedPageReader`): the same image + prompt + model + effort
  never costs twice. Most development re-runs exercise S2–S4 and the UI, so they cost
  nothing.
- **Spend guard** (`vlm/spend.py`): prices from real `response.usage`, keeps a ledger,
  and raises `SpendCapExceeded` before any call that would cross
  `PRESCRIPTAI_SPEND_CAP`. An unknown model raises rather than being priced at $0.
- Check with `GET /api/health` or `python -m vlm.spend`.
- Image downscaling in S0 cut image tokens by 65% on the eval set.

---

## 11. Current status

*As of the last journal entry (Session 6). `claude.md` is the source of truth.*

| Stage | Status |
|---|---|
| Shared contracts (`schemas.py`) | ✅ built, tested |
| S0 ingest | ✅ tested on real images |
| S1 prompt, mock reader, response cache, spend guard | ✅ |
| S1 Claude reader | ✅ verified against the live API (`messages.parse()` with an image works) |
| S2 vocabulary constraint | ✅ all paths tested except AMBIGUOUS on real data |
| S3 brand → generic + NLEM | ✅ rebuilt on Indian data |
| S4 DDI graph + checker | ✅ 180 rules, 8 severity conflicts resolved |
| S5 review screen + correction log | ✅ |
| Backend API | ✅ |
| web_app | ✅ retheme done, `vite build` passes, renamed MedScript → PrescriptAI |
| Authentication (all three roles) | ✅ built (Session 7): 77 API checks + 21 browser checks passed. Patient and pharmacy home pages are placeholders. |
| pharmacy_dashboard | ⚠️ renamed only. Old dark theme, static BD demo data, not wired to the API |

**Open items**

1. A strength suffix in `drug_token` (`Monas 10` vs `Monas`) can fall below the
   abstain floor. Watch real output before changing anything.
2. AMBIGUOUS has not yet fired on a real page.

---

## 12. Known issues and stale files

These come from the pre-v2 prototype. They are wrong, so don't trust them.

| File | Problem |
|---|---|
| `backend/requirements.txt` | Missing `sqlalchemy`, `pyyaml`, `pandas`, `anthropic`, `python-dotenv`. Still lists `torch`, which is no longer used. |
| `ml_pipeline/requirements.txt` | The old TrOCR stack (torch, transformers, opencv, pinned to Python 3.10). Not what the pipeline uses now. |
| `docker-compose.yml` | Refers to `ml_pipeline/model_serving` (deleted) and an `ml_server` on 8001 (gone). Postgres, Redis and Celery are unused. DB name/user are still `medscript_*`, deliberately left alone so existing deployments don't break. |
| `backend/Dockerfile` | `python:3.10-slim` won't parse `settings.py`, which needs 3.12. Also `COPY ../ml_pipeline` is outside the build context. |
| `backend/config/settings.py` | `ML_SERVICE_URL`, JWT, Redis and Celery settings are unused scaffolding. |
| `pharmacy_dashboard/` | Hardcoded demo queue with Bangladeshi brands (Napa, Esoral, ...). Fake confidences. |
| `web_app/README.md` | Vite template boilerplate |
| Upload with no CSVs | `resolve_page` sits outside the upload's `try`, so a missing dataset is a 500, not a 502 |
| Auth: code delivery | No SMS provider; phone codes and (without `SMTP_HOST`) email codes are printed to the backend console. Swap `send_sms` in `backend/auth/notify.py`. |
| Auth: rate limiting | In-process memory. Resets on restart and isn't shared between workers; move to Redis before scaling out. |
| Auth: MFA secret | Stored unencrypted (`users.mfa_secret`). Encrypt with a KMS-held key before production. |
| Auth: vetting | Doctors and pharmacies self-register; the registration / licence number is not checked against any registry (Workflow.md §10 Q5). |
| Auth: record ownership | Any signed-in doctor sees every prescription. Per-doctor sessions arrive with Workflow stage 1. |
| Auth: no automated tests in repo | The 77 API + 21 browser checks ran from a scratch script. `fastapi.testclient` is broken here (`httpx` 0.28 vs Starlette 0.35). |

---

## 13. Deliberately not built

Recorded so these aren't mistaken for oversights or re-proposed:

- **TrOCR in any form.** Measured at 6% / 14%.
- **BioBERT or any learned DDI classifier.** A cited lookup table is better on
  auditability, accuracy, data cost and failure mode (ARCH §9.3).
- **Dual-VLM cross-check.** While a doctor reviews every page, their corrections are
  ground truth. Revisit at the Phase 1 → 2 boundary.
- **S2 VLM tiebreak.** AMBIGUOUS goes to the human instead.
- **RL / training scaffolding, stub `rl/` packages, `# TODO: policy update`.** The
  prerequisite is captured data, not code.
- **Open-weights migration.** A separate architectural decision, deferred.

---

## 14. Roadmap

Continuous improvement is driven by the correction log (ARCH §16):

| Tier | Unlocks at | What |
|---|---|---|
| Regression suite | ~100 corrections | Replay logged pages through the current prompt, diff against known answers |
| **T0 threshold calibration** | ~200 corrections | Fit `thresholds.yaml` to observed correction rates. No GPU. Biggest early win. |
| T1 few-shot retrieval | ~500 | Inject similar past corrections into the S1 prompt |
| T2 SFT / DPO | ~5,000 + GPU | Train an open VLM. Means leaving the Claude API. |
| T3 RL | n/a | Not planned |

**Before starting any of it:** confirm stored rows have `raw_response`,
`prompt_version`, confidence and alternatives populated, then count corrections by
type. Build the regression suite first.

Other next steps: rebuild `pharmacy_dashboard` on the real API, fix the requirements
files and Docker setup, find a way to distribute the medicine CSVs, and possibly
expand DDI coverage for acute outpatient drugs.

---

## 15. Where to read more

| Question | Read |
|---|---|
| Why is it built this way? What was rejected? | [`docs/ARCHITECTURE_V2.md`](docs/ARCHITECTURE_V2.md): §1 TL;DR, §3 rejected approaches, §5 stage specs, §6 VLM choice + cost, §8 human-in-the-loop, §16 roadmap |
| What actually happened, including bugs and measurements? | [`claude.md`](claude.md), the implementation journal, newest session first |
| How was the work split? | [`docs/DAY1_PLAN.md`](docs/DAY1_PLAN.md) |
| Exact data shapes | [`ml_pipeline/schemas.py`](ml_pipeline/schemas.py) |

`§` references in code comments point to `docs/ARCHITECTURE_V2.md`.


