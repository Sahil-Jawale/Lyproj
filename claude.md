# PrescriptAI — Implementation Journal

A running log of what was built, why, what broke, and what is still open.
Newest session at the top. Design rationale lives in
[`docs/ARCHITECTURE_V2.md`](docs/ARCHITECTURE_V2.md); the day plan lives in
[`docs/DAY1_PLAN.md`](docs/DAY1_PLAN.md). **This file is the narrative** — what
actually happened, including the things that did not work.

---

## Where the project is right now

**Track A (the reader) is built and tested, except for the live API call.**
Tracks B and C are unblocked: `MockPageReader` exists and produces realistic
output including an illegible line.

| Stage | Status | Notes |
|---|---|---|
| Shared contracts (`schemas.py`) | ✅ built, tested | The interface all three tracks code against |
| S0 ingest (`ingest/normalise.py`) | ✅ built, tested on real images | 65% image-token reduction measured |
| S1 prompt (`vlm/prompts.py`) | ✅ built, versioned | 949 tokens; no vocabulary leakage (verified) |
| S1 mock reader | ✅ built, tested | Includes a deliberate ILLEGIBLE line |
| S1 response cache | ✅ built, tested | 0% → 100% hit rate verified |
| S1 spend guard (`vlm/spend.py`) | ✅ built | $30 cap, real `usage`-based pricing |
| S1 Claude reader | ✅ **verified against the live API** | `messages.parse()` + image confirmed working |
| S2 vocabulary constraint (`vlm/vocab.py`) | ✅ built, all paths tested | 4 bugs found and fixed |
| S3 brand→generic + NLEM verify | ✅ **rebuilt on Indian data** | 239,541 brands; per-ingredient NLEM gate |
| S4 DDI graph + checker | ✅ built, tested | **6 → 180 rules**; 8 severity conflicts resolved |
| S5 doctor verification | ✅ built | Review screen + correction log persisted |
| Backend API | ✅ built | SQLite, 8 routes, all tested |
| Frontend | ✅ built | Review + results screens, vite build passes |
| Authentication (3 roles) | ✅ built, tested | Session 7. 77 API + 21 browser checks |

### Live API status: verified

`messages.parse()` with an image content block **works** — that was the last
unverified SDK assumption (§6.4). Structured output, prompt caching, the spend
ledger and the verbatim rule all confirmed on real calls.

Spend so far: **$0.0686 across 2 calls**, cap $5.00.

---

## Session 7: Accounts for every stakeholder

[`Workflow.md`](Workflow.md) names three actors: doctor, patient and chemist. Until
now the API had no identity at all: anyone who could reach port 8000 could list
every prescription, and `/uploads` served patient photographs as an open
directory. This session adds one account system for all three roles. The full
reference is README §6a.

### Decisions

**Server-side sessions, not JWTs.** The token is opaque (256 bits), lives in an
`HttpOnly; SameSite=Lax` cookie, and only its SHA-256 is stored. Logout and "end
this session" therefore take effect immediately, which a stateless JWT cannot do
without a denylist. The cost is one indexed lookup per request.

**CSRF by custom header.** A cookie session needs CSRF protection. Every unsafe
`/api/*` request must carry `X-Requested-With: PrescriptAI`, and CORS moved from
`*` to an explicit origin list. A foreign site can't set the header without a
preflight, and the preflight is refused.

**Standard library only.** No auth packages were installed (no bcrypt, argon2,
pyotp or cryptography), so: `hashlib.scrypt` for passwords, `secrets` for tokens,
and RFC 6238 TOTP in about 20 lines of `hmac`. That adds nothing new to audit.
The cost is that `mfa_secret` is stored unencrypted (open item 6).

**No account enumeration.** Login, forgot and reset answer an unknown account
exactly as they answer a real one: same message, a dummy scrypt for the same
timing, and throttling keyed on the *identifier* rather than the account row. A
real account and a made-up one both hit `429` after 5 failures.

**Recovery is never silent.** Reset ends every session and does not sign in. MFA
stays on, so a reset only gets you as far as the second factor. Username-only
accounts get recovery codes at sign-up, because they have no channel to reset
through.

**Doctor-only patient data.** Every prescription route depends on
`require_roles(Role.DOCTOR)`, and `/uploads` became a guarded route.
`corrected_by` / `reviewed_by` are now the signed-in user's id from the session.
Before this, the client sent `"doctor"` in the body, which made the audit trail
something the client wrote about itself.

### Patient and pharmacy screens are honest placeholders

Both roles can register and sign in, but Workflow stages 4–7 aren't built. Their
home pages show a security checklist and say plainly what's coming. They show no
sample prescriptions, for the same reason Session 6 deleted the fabricated upload
results.

### Verified

- **API, 77 checks** (scratch script, live server, throwaway DB): every
  registration path, identifier normalisation, CSRF and CORS refusal,
  401/403 by role, path traversal on `/uploads`, enumeration parity, lockout,
  reset by code and by recovery code (single use), TOTP enable/login/replay
  refusal, challenge burn-out, revoke-others, password change, contact change,
  resend cooldown, idle expiry, audit events, scrypt at rest.
- **Browser, 21 checks** (Playwright driving Chrome on the real Vite app): sign-up
  → verify → upload → the protected image loads by cookie; MFA set-up by QR; sign
  out; MFA login returns to the page that asked; patient by phone; role redirects;
  forgot → reset → sign in; username sign-up on a 390 px viewport with no
  horizontal scroll. No console errors.
- `fastapi.testclient` doesn't work in this environment (`httpx` 0.28 is newer
  than Starlette 0.35 supports), so no pytest suite was added. Both scripts drive
  a real server instead.

### Open items added

6. **Encrypt `mfa_secret` at rest** (KMS key) before production.
7. **Real SMS / email delivery.** Phone codes always print to the console; email
   codes do too unless `SMTP_HOST` is set.
8. **Rate limiter is per-process memory.** Move it to Redis before running more
   than one worker.
9. **No vetting of doctors or pharmacies.** Registration and licence numbers are
   self-declared (Workflow.md §10 Q5).
10. **No per-doctor ownership.** Any doctor sees every prescription until Workflow
    stage 1 adds sessions.

---

## Session 6 — UI: rename to PrescriptAI, and a clinical theme

The frontend still said **MedScript**, and it still looked like every other
gradient-on-black AI dashboard: purple-blue glassmorphism, glowing gradient
text, blurred blobs. It also disagreed with itself — `Layout` painted
`bg-dark-900` while `MedicineCard`, `ResultsPage` and `ReviewPage` had already
been written light, so the clinical screens were slate-900 text on white cards
floating on a black page.

### The theme

Rebuilt as a **light clinical** system in `tailwind.config.js` + `index.css`:

| token | value | role |
|---|---|---|
| `paper` | `#F5F4EF` | warm chart-paper ground, not a dashboard black |
| `care-*` | teal `#1F8375` family | the one accent; every affordance is keyed to it |
| `vital-*` | `#C4353A` family | reserved for actual risk — never decoration |
| `ink-*` | warm greenish slate | text and hairline rules |

Newsreader (serif) for headings, Inter for UI, JetBrains Mono for anything
numeric. Flat cards with hairline borders and a small shadow replaced `.glass`;
`.gradient-text` and `.gradient-bg` are gone entirely. The mark is **℞** with a
pulsing vitals dot.

### The background animation

`components/MedicalBackdrop.jsx` — drifting graph paper, two **ECG traces that
draw themselves** across the page (a real PQRST polyline generated in JS, drawn
via `pathLength` + `stroke-dashoffset`), soft clinical washes, and a few
drifting pharmacy glyphs. It is `pointer-events-none`, `aria-hidden`, and every
animation in the app is killed wholesale under `prefers-reduced-motion`. None of
it carries information.

### Three things were broken, not just ugly

Retheming meant reading every page, and three of them did not work against the
real API at all:

**1. `UploadPage` fabricated a prescription when the request failed.** The catch
block built a mock result — Napa / Esoral / Montair, BD brands from the deleted
dataset — and navigated to the results screen with it. On screen it was
indistinguishable from a real reading. Deleted; a failure now says it failed and
records nothing. The same fabrication existed in `InteractionsPage`, which had a
hardcoded `LOCAL_INTERACTIONS` table it fell back to — a **safety verdict
invented by the browser**, which is the exact confusion this project exists to
prevent. Also deleted.

**2. `HistoryPage` would crash on real records.** It filtered on
`rx.doctor_name.toLowerCase()`; the API returns `prescriber_name`. It also read
`rx.confidence` and `m.name`, which are `overall_legibility` and `brand`. It
only ever looked fine because a 12-item demo fixture shadowed the real call.

**3. `DashboardPage` rendered `NaN%`.** It merged `/api/stats` over a demo
object, but the real payload has `coverage` / `reviewed` / `corrections_logged`,
not `avg_confidence` / `interaction_alerts`. Its charts were a fabricated
six-month series and a falling **"OCR Error Rate (CER%)"** curve for TrOCR — a
model that was cut from the serving path two sessions ago.

Both pages now compute everything from real records: outcome mix, verification
mix, per-page legibility, top resolved ingredients, screened-vs-skipped counts
and live spend against the cap. The headline stat is **coverage**, not accuracy.

### Copy corrected to match the pipeline

The homepage was still advertising the old system: "80%+ accuracy using
fine-tuned TrOCR", "78+ medicine names", "BD Prescription Dataset with 4,680
word segments", "200+ interaction rules". Replaced with what S0–S5 actually do —
239,541 Indian brands, NLEM 2022 as the per-ingredient gate, 180 cited rules
across 212 drugs, verbatim reading, and a clinician sign-off on every page.

`InteractionsPage`'s autocomplete was 78 hardcoded **Bangladeshi brand names**,
while `/api/interactions/check` screens by **generic**. Every suggestion it
offered was guaranteed to return nothing. Replaced with
`src/data/ddiDrugs.js` — the 210 generics generated from `DDI Database.json`
itself, so the list cannot drift from the graph.

### Also renamed

`web_app/index.html` (title, meta, favicon), the navbar, `backend/config/*`
`APP_NAME`, `pharmacy_dashboard` title strings, the README tree label. **Not**
renamed: `docker-compose.yml` database name/user/password and the
`sqlite:///medscript.db` default — renaming those breaks existing deployments
and orphans the current `prescriptai.db`.

Verified: `vite build` passes, every route module and the stylesheet compile
clean through the dev server, and the generated CSS contains all new tokens.
`pharmacy_dashboard` is renamed but **not** rethemed — it is still on the old
dark palette.

---

## Session 1 — Track A implementation

### Environment

Python 3.13.5 on Anaconda base (no venv; the project's other deps already live
there). `pydantic 2.10.3`, `PIL 11.3.0`, `rapidfuzz 3.14.5`, `cv2`, `numpy`,
`pandas` present. Installed `anthropic 1.2.0` (the 1.x SDK — httpx2-based).

### What got built

```
ml_pipeline/
├── schemas.py                  shared contracts (all three tracks)
├── config/thresholds.yaml      S2 thresholds — the T0 surface (§16.7)
├── ingest/normalise.py         S0
├── vlm/
│   ├── prompts.py              S1 system prompt, versioned + fingerprinted
│   ├── page_reader.py          S1 readers: Mock, Claude, Cached
│   ├── spend.py                spend ledger + hard cap
│   └── vocab.py                S2 vocabulary constraint
└── data/brands_observed.txt    12 brands seen on eval images (test fixture only)
```

### Decisions taken while building

**`normalise()` hashes the final JPEG bytes, not the source file.** This makes
the response cache self-invalidating: any change to normalisation changes the
bytes, changes the hash, and misses the cache. No separate version constant to
forget to bump.

**`model` is the reader's cache identity.** Not an arbitrary label — see bug 2.

**The prompt is fingerprinted, and the fingerprint is in the cache key.**
Editing the prompt without bumping `PROMPT_VERSION` would otherwise serve stale
reads forever. That is the most confusing bug this design could produce, so it
is designed out rather than documented.

**Thresholds live in `config/thresholds.yaml`, not in code.** Per §16.7 this is
the entire surface area reserved for future calibration work: "updating the
policy" is editing a file. The file says plainly that every number in it is a
guess.

**S2 matches against `alternatives` as well as `drug_token`.** The uncertainty
channel is free evidence, and it works — see the "Crocm 05" result below.

### Bugs found by running the code

Three real bugs, all caught within minutes of writing the code they were in.
This is the whole argument for running everything immediately.

**Bug 1 — cache key became a path.** `MockPageReader` had no `effort`, so the
key defaulted to `"n/a"`, whose `/` turned into a directory separator and
crashed on write. Fixed by sanitising every key component to a filesystem-safe
character set.

**Bug 2 — the two mock variants collided in the cache.** `--reader mock_negative`
returned the *prescription* fixture, because both variants had `model = "mock"`
and therefore the same cache key. Fixed by giving each variant a distinct model
string. The general lesson is in the code comment: **anything that changes the
output belongs in the cache key.**

**Bug 3 — `fuzz.ratio` is case-sensitive, and it would have broken S2 entirely.**
Measured:

```
reading         vocab entry     ratio   case-folded
ZOFER           Zofer              20           100
OFLAZEST OZ     Oflazest OZ        36           100
CROCIN DS       Crocin DS          44           100
TAB ZOFER       Zofer              14            71
```

Eval image 2 is written **entirely in block capitals**, and so are a great many
real prescriptions. Uncorrected, S2 would have abstained on essentially every
legible medicine, and the failure would have looked like "the model can't read
handwriting" rather than "we lowercased nothing". Fixed by matching on a
case-folded index while returning canonical casing.

Two things surfaced alongside it:

- **153 of the 1,440 shipped vocabulary names differ from another entry only by
  case** (`Monas`/`monas`). Those are duplicates that manufacture meaningless
  score ties. Deduplicated on load: **1,440 → 1,278**.
- A leaked dosage-form prefix costs ~30 points (`TAB ZOFER` → 71). The S1 prompt
  already asks the model to exclude these, so `_strip_form_prefix` is a
  belt-and-braces second line of defence, not the primary one.

### Verification

S0, on the five real eval images:

```
1.jpg    304x351   ->  304x351     142 ->  142 tok
2.jpg    720x1280  ->  720x1280   1229 -> 1229 tok
3.jpg    400x261   ->  400x261     139 ->  139 tok
4.jpg   2400x3600  -> 1045x1568  11520 -> 2185 tok
5.jpg   1024x1024  -> 1024x1024   1398 -> 1398 tok
                        total     14428 -> 5093  (65% saved)
```

This reproduces the §6.5 measurement exactly. Image 4 alone accounts for
9,335 of the 9,335 tokens saved — one page was costing more than the other four
combined.

S2, all outcome paths (against the small observed-brand fixture):

| case | outcome | score | brand |
|---|---|---|---|
| `Zofer` exact | CONFIRMED | 100 | Zofer |
| `Zofr` OCR-corrupted | CONFIRMED | 89 | Zofer |
| `Dijoxin` | **PROBABLE** | 86 | Digoxin |
| `Crocm 05` + alt `Crocin DS` | CONFIRMED | 100 | Crocin DS |
| `Zofer` @ VLM confidence 0.41 | ILLEGIBLE | — | — |
| marked `legible: false` | ILLEGIBLE | — | — |
| `Maintain temperature chart` | *(skipped, not a medicine)* | — | — |
| `Xyzzyx` | ILLEGIBLE | — | — |

Two of these matter more than the rest:

- **`Dijoxin` → PROBABLE 86 → `Digoxin`, with `raw_reading='Dijoxin'` preserved.**
  This is the §6.6 regression case working end to end. The correction happens,
  it is scored, it is flagged as less-than-certain, and the original reading
  survives. That is exactly the auditable correction the architecture asked for,
  as against the silent rewrite the spike produced.
- **`Crocm 05` was rescued by its own `alternatives`.** The uncertainty channel
  is not decoration; it recovered a medicine a primary-reading-only matcher
  would have abstained on.

### The vocabulary problem is now visible in behaviour, not just in a doc

Running the real S1→S2 chain on eval image 2 abstains on **all three**
medicines:

```
illegible  OFLAZEST OZ  -> candidates ['monfast','Fexofast','Vorifast', ...]
illegible  AZENAC-MR    -> candidates ['denvar','Enjard','Faenor', ...]
illegible  ZOFER u-r    -> (abstained on VLM confidence 0.34)
0/3 eligible for the interaction check
```

**This is correct behaviour, not a failure.** The shipped vocabulary is 1,278
Bangladeshi brand names and the prescriptions are Indian. The system refuses to
report "monfast" for "OFLAZEST OZ", which is precisely what it should do. It
also means **match-rate numbers from today are meaningless** and thresholds must
not be tuned against this list. Swapping the vocabulary is P4 and it is one line
in `config/thresholds.yaml`.

### Review pass (after the build)

Ran an edge-case probe over Track A rather than eyeballing it. Ten checks; nine
passed — Protocol conformance, `normalise()` giving identical hashes for path /
bytes / PIL input, never upscaling small images, empty and blank pages producing
no fake medicines, the spend cap raising, and an unknown model raising instead of
silently pricing at zero. `price_call` also agreed with a hand calculation and
landed at **$0.0348/prescription**, against the $0.0347 modelled in §6.5.

**One real bug found: the primary reading was being lost.** When an
`alternatives` entry beat the primary reading, `raw_reading` was overwritten with
the alternative:

```
drug_token="Crocm 05", alternatives=["Crocin DS"]
  ->  brand="Crocin DS", raw_reading="Crocin DS"     # WRONG - primary read gone
```

That defeats the purpose of the field. A reviewer seeing "Crocin DS ← Crocin DS"
learns nothing, and the correction log could not tell that the primary read was
wrong and something else rescued it. Fixed by adding `matched_via` to
`ResolvedMedicine` and keeping `raw_reading` as the primary:

```
  ->  brand="Crocin DS", raw_reading="Crocm 05", matched_via="Crocin DS"
```

The schema change was free because Tracks B and C had not started — which is the
argument for the contracts-first ordering in DAY1 §2 doing its job.

---

## Session 2 — Track B (knowledge layer)

Started Track B rather than waiting for the API key: it is fully independent —
local JSON and CSV only, no model calls (DAY1 §4).

### B1 — the DDI loader. 6 rules → 180.

The old loader globbed for `*.csv`; the data is `DDI Database.json`. The glob
found nothing, the exception path never ran, and it silently served six
hardcoded edges while the README advertised "200+".

Rewritten so that a silent fallback is **impossible**: it loads loudly, counts
what it loaded, and raises `DDILoadError` if pointed at a dataset it cannot
read. A safety layer that quietly degrades to 3% of its rules is worse than one
that fails.

```
[DDI] Loaded 180 interactions (212 drugs, 175 edges) from DDI Database.json
```

**The serious find: 8 pairs appear twice in the source data with CONFLICTING
severities**, and `networkx` lets the last write win. Because the JSON iterates
major → moderate → minor, the *lower* severity was winning:

```
Nitroglycerin + Sildenafil : listed as BOTH Major and Minor  -> was resolving to MINOR
```

Sildenafil with a nitrate is a classic contraindicated combination. The loader
was about to report it as minor. Now the most severe assessment wins and every
conflict is logged by name. Severe count went 59 → 66.

### B3/B4 — normalisation (`normalise/drug_names.py`)

Salt/ester stripping, route-qualifier stripping, combination splitting, and a
small INN↔USAN synonym table. Measured effect on the join:

```
raw overlap        : 3   Esomeprazole, Fluconazole, Metronidazole
normalised overlap : 9   + Azithromycin, Cetirizine, Ketoconazole,
                         Montelukast, Paracetamol, Vitamin B Complex + Zinc
```

Better than the 7 predicted in §5.3.1, because the synonym table caught
Paracetamol→Acetaminophen and combination-splitting caught the Zinc component.

The synonym table is deliberately tiny and restricted to INN↔USAN pairs — a
published correspondence, not clinical judgement. **Do not grow it by recall.**
RxNorm is the real answer.

Also corrected a claim in the architecture doc: I wrote that class-level rows
were a category needing expansion. **There is exactly one** ("ACE Inhibitors
(e.g., Lisinopril)"). Handled, but I had overstated it.

### B2/B5 — brand→generic, with the safety gate in code

`to_generic()` returns `None` for anything not `verified`, and the caller cannot
distinguish "unknown brand" from "known but unverified" — because acting on
either is unsafe. 78 seed pairs, **generated** from the BD dataset CSV by
`build_seed_map()`, never hand-typed.

### B6 — the `skipped` contract works

```
checked : ['Napa']
skipped : ['Mona? [ambiguous]', '??? [illegible]', 'Crocin DS [no verified generic]']
```

An unsafe reading is never silently dropped. "We checked 4 of 6" and "we checked
6" are very different claims to put in front of a clinician.

### ⚠ The finding that matters most this session

**The interaction table barely covers the drugs that appear on real
prescriptions.**

```
BD fixture generics present in the DDI table : 11/15   -> 0 interacting pairs
Eval-image generics present in the DDI table :  5/9    -> 0 interacting pairs
```

Zero. Not because the code fails — `Warfarin + Ibuprofen` and
`Sildenafil + Nitroglycerin` both fire correctly with citations — but because
the 180 pairs are built around **high-risk chronic medications** (warfarin,
lithium, statins, antiarrhythmics) while these prescriptions are **acute
outpatient care** (analgesics, antibiotics, antiemetics, PPIs). Different
therapeutic universes.

Consequences:

1. **A demo on the real eval images will show "no interactions found."** That is
   the correct answer, and it will look like nothing works. Demo with a
   constructed high-risk pair as well, and say why.
2. **P4 is bigger than "build the brand→generic map."** It also has to establish
   whether the DDI table covers the target drug space, and expand it if not.
3. **The honest framing of the feature changes.** It is not "checks every
   prescription for interactions". It is "catches known high-risk combinations
   when they appear" — which is still worth having, and is far better than a
   checker that fires constantly with noise. But the README should say the
   latter, not the former.

---

## Session 3 — Indian vocabulary + NLEM verification

Replaced the Bangladeshi vocabulary with real Indian data. Three datasets were
offered; one was adopted.

| File | Verdict |
|---|---|
| `indian_medicines_master.csv` | ✅ **adopted** — 239,640 brands, **zero nulls in every column**, correct compositions |
| `nlem2022_formulations.csv` + `nlem_verified_medicines.csv` | ✅ **adopted** as the verification gate |
| `India Medicines and Drug Info Dataset.csv` (110 MB) | ❌ 64.6% of `Composition` truncated, 30.5% null. Superseded. |
| `CDSCO.pdf` | ❌ **1 page, 544 characters, ~4 entries** — an annual new-approvals notice, no brand names at all. Wrong shape, not just wrong size. |

### ⚠ I was wrong last session — correcting it

Session 2 concluded "the DDI table barely covers the drugs on real
prescriptions" and I logged it as open item 0. **That was an artifact of the
15-generic BD fixture, not a property of the DDI table.**

```
before (78 BD brands, 15 generics) :   0 / 175 interaction pairs reachable
after  (239k brands, 1,679 ingr.)  : 139 / 175 reachable (79%)
                                     55 severe, 39 moderate, 45 minor
```

The interaction table was fine all along. The vocabulary was the problem. Open
item 0 is deleted.

### Five data issues found and fixed

**1. Strength embedded in brand name.** 239,640 full names → 195,325 base names.
A single index cannot serve both readings:

```
"ZOFER"     full-index -> "Ofzer" (80) WRONG  |  base-index -> "Zofer" (100) ✓
"Dolo 650"  full-index -> "Dolo 650" (100) ✓  |  base-index -> "Dodo 50mg" (67) WRONG
```

Fixed: build both indices, score against both, take the better.

**2. 1.2% of base brands have multiple compositions.** `A Rex` is
Diphenhydramine + Ammonium Chloride, but `A Rex 10mg` is Hydroxyzine — the
strength we stripped was the distinguishing feature. Fixed: exact full-name
match wins; a base-name hit spanning several compositions returns None rather
than guessing. Verified `A Rex 99mg` (unknown strength) → None.

**3. Brand-name crowding.** 19% of readings have a competitor within the
6-point margin. But **78% of those collisions are the same composition**:

```
Oflazest / Oflaset   -> Ofloxacin / Ofloxacin        harmless
Crocin  / Crocimax   -> Paracetamol / Paracetamol    harmless
rolay   / olay       -> Rabeprazole / Olanzapine     DANGEROUS
```

Fixed: compare **compositions**, not brand strings, when collapsing ambiguity.
Reviewer burden **19% → 4%**, no loss of safety.

**4. The two files use different brand conventions.** Master is `"A 250"`, NLEM
is `"Biopurin 50mg Tablet"`. Exact join: 938 / 40,451 (**2.3%**). After
stripping the trailing form word: 38,039 (**94%**). A silent 94% data loss if
joined naively.

**5. Punctuation — found only by running the pipeline, and it ranked the WRONG
drug first.** Indian brands use hyphen/dot/space interchangeably:

```
"AZENAC-MR" vs Acenac-MR   raw 89  ->  Thiocolchicoside + Aceclofenac  <- wrong drug, tied first
            vs Azenac MR   raw 89  ->  Aceclofenac + Paracetamol       <- correct

punctuation-flattened: Azenac MR = 100, Acenac-MR = 89 -> margin 11, CONFIRMED
```

Before the fix the pipeline emitted AMBIGUOUS on a perfectly legible medicine
*and* ranked a different drug top. Fixed via `match_key()` — casefold plus
punctuation flattening on both index and probe.

### Verification design: per-ingredient, never hides the reading

NLEM 2022 is an **essential medicines** list — 241 molecules + 63 aliases,
deliberately selective. "Not in NLEM" means *not on the national essential
list*, **not** *not a real drug*: Ofloxacin and Aceclofenac are both genuinely
absent (checked directly, not an artifact of the join).

So verification is per ingredient, and a combination is usually part-verified:

```
Azenac MR = Aceclofenac + Paracetamol
            ^ unverified  ^ verified     -> PARTIAL
```

Coverage across the master file: 35.1% all components NLEM, 22.3% partial,
42.6% none.

**Two design calls, both biased toward not breaking:**

- **The reading is ALWAYS shown.** Verification changes the strength of the
  warning, never whether the result is visible. A blocked screen helps nobody
  and the doctor is the safety net.
- **The DDI check is the one place we are strict.** Only NLEM-verified
  ingredients enter it, because that is where a wrong mapping becomes a wrong
  SAFETY VERDICT. Unverified components are named to the reviewer, never
  silently dropped.

`ResolvedMedicine` now carries two independent facts: `outcome` (how sure we are
what was *written*) and `verification` (how sure we are what *drug* that is).

### End-to-end proof

Real prescription (`VLM_CHECK/2.jpg`, via the mock reader):

```
confirmed  unverified  100  Oflazest OZ   Ofloxacin + Ornidazole   -> HARD CONFIRM
confirmed  partial     100  Azenac MR     Aceclofenac + Paracetamol
                                          unverified: Aceclofenac
illegible  unknown       -  —             (VLM confidence 0.34)    -> HARD CONFIRM
-> eligible for interaction check: ['Paracetamol']
```

And a constructed high-risk pair, using **real Indian brands** pulled from the
dataset:

```
Cofarin 1mg (Warfarin) + ALFAM 400MG (Ibuprofen)
  both CONFIRMED, both NLEM-VERIFIED
  RISK: SEVERE — "Increased risk of serious GI bleeding"
  safer: Acetaminophen (Paracetamol)      ref: DrugBank 6.0
```

S1 → S2 → S3 → S4 working on real Indian brand names, with citation.

---

## Session 4 — live API verification

Budget dropped to **$5**, covering a demo. Total spent validating: **$0.0686**.

### A budget bug found before the first paid call

`python3 -m vlm.spend` reported `Cap $30.00` after I set `PRESCRIPTAI_SPEND_CAP=5`
in `.env`. `spend.py` read the env var but nothing had loaded `.env` into the
environment — so **the cap was not being enforced at all**. Fixed by loading
`.env` at import in `spend.py`. Worth noting that the guard was the one thing
protecting the budget, and it was silently inert.

### The last unverified assumption is resolved

`client.messages.parse()` **does** accept an image content block. It was
documented with text-only examples and images only ever appeared with
`create()`, so §6.4 carried it as a risk since the architecture was written. It
works. No fallback path needed.

### The verbatim rule passed its regression test

`VLM_CHECK/1.jpg` reads "Dijoxin". The ad-hoc spike (§6.6) silently normalised it
to "Digoxin". With the S1 prompt:

```
raw_text     : 'Dijoxin 0.125 mg tabletten da no.7 S 1 dd 1 tablet'
alternatives : ['Digoxin', 'Dijoxine']
note         : "written as 'Dijoxin' with a clear 'j'; transcribed verbatim
                without correction. A reviewer should confirm whether
                'Digoxin' was intended."
```

Verbatim in `raw_text`, the correction offered in `alternatives`, and the
ambiguity narrated to the reviewer. Exactly the design.

### Cost model: right total, wrong reasons

```
measured usage: input 1208 | cache_read 3159 | output 1075 | thinking_tokens 0
measured cost : $0.0343/prescription      modelled: $0.0347
```

- **Prompt caching works** — 3,159 cached prefix tokens, read at 0.1x, and the
  cache persists across different images.
- **`thinking_tokens` is 0.** Adaptive thinking at `effort: medium` decided this
  task needs no reasoning tokens. My model assumed ~500. The total still lands
  where predicted because output was larger than estimated (1,075 vs 650). Two
  errors cancelling — worth knowing, since it means the "thinking is the dominant
  cost lever" advice in §6.5 does not apply to THIS workload.

### The confidence threshold was mis-calibrated — measured, then fixed

Real Opus 5 confidences on handwritten brand names cluster tightly:

```
OFLAZEST-OZ  0.62      ANDIAL  0.50
AZENAC-MR.   0.60      ZOFER   0.55        (all legible=true)
```

My `min_vlm_confidence: 0.60` guess sat in the middle of that cluster and
abstained on **2 of 4 medicines it had read correctly** — ANDIAL is Loperamide,
ZOFER is Ondansetron, both present in the vocabulary. That is lost coverage, not
safety.

Changed so confidence **downgrades rather than vetoes**:

```
conf >= 0.60  -> may reach CONFIRMED
conf <  0.60  -> capped at PROBABLE (accepted, flagged to the doctor)
conf <  0.45  -> ILLEGIBLE
```

Safety is preserved — nothing is silently CONFIRMED on a weak reading — and a
weak read carrying a 100-point fuzzy match against 239k brands is corroborated
by an independent, non-model source.

Result on the real prescription: ingredients eligible for the interaction check
went from **1 to 3**.

### End-to-end on a real prescription (VLM_CHECK/2.jpg)

```
patient Ms. PRATHNA | prescriber Dr. R.Keshwani | date 15-03-17

medicine        outcome    verify      freq          duration  composition
Oflazest OZ     confirmed  unverified  1 --- 1       3 days    Ofloxacin + Ornidazole
Azenac MR       confirmed  partial     1 --- 1       3 days    Aceclofenac + Paracetamol
Andial          probable   verified    2 (6hr)-1...  3 days    Loperamide
Zofer           probable   verified    1 --- 1       3 days    Ondansetron

checked : Paracetamol (in Azenac MR), Andial, Zofer
skipped : Oflazest OZ [no NLEM-verified ingredient]
          Aceclofenac (in Azenac MR) [not on NLEM list]
RISK    : NONE (0 interactions)
```

Every field matches the actual image. S0→S1→S2→S3→S4 on a real photograph.

---

## Session 5 — Track C (backend + UI)

### Persistence, and the field that cannot be backfilled

`backend/models.py` — three tables. `corrections` is the important one: it is
simultaneously the clinical audit trail and the training corpus (§8.3), which is
why it stores the five fields §16.3 says are unrecoverable if not captured at
write time — the raw model response, the model/prompt/effort provenance, the
per-line confidence and alternatives, full before **and** after, and a
correction taxonomy (`misread` / `hallucinated` / `missed` / `wrong_field`).

`predicted_value` is read from the stored result server-side, never trusted from
the client, so the before/after pair is always the model's actual output.

Confirmations are recorded too (`Prescription.reviewed_at`). A page a doctor
passes unchanged is a fully labelled page — the majority class — and a corpus of
only edits is a biased one.

### API — 8 routes, all tested

`upload` runs S0→S4 and persists everything; `corrections` and `review` feed the
log; `stats` reports **coverage** (fraction auto-resolved) rather than a bare
accuracy, because coverage is the honest headline for a system that abstains.

`READER=mock` runs the entire product with no key and no cost.

### UI

`MedicineCard` shows **both** facts side by side — `outcome` (how sure we are
what was written) and `verification` (how sure we are what drug that is) — plus
the verbatim `read as “…”` line, and names the unverified ingredients rather than
dropping them. AMBIGUOUS renders as pick-one-of-N buttons, never a free-text box.

`ReviewPage` puts the page image beside the extraction, with a per-line crop from
the S1 bbox. Reviewing against pixels is a glance; reviewing against memory is a
rubber-stamp. Upload now lands here rather than on a read-only view — Phase 1
means every extraction is verified before use.

### Cleanup

Deleted `ocr/ensemble.py` (raised ImportError on import), `ocr/tesseract_inference.py`
(imported, never instantiated), and the dead BD fixtures. Silenced SQLAlchemy echo,
which was drowning every response in SQL. Raised the frontend HTTP timeout from
30s to 120s — a real VLM read takes 10-30s, so the old default would have timed
out on exactly the dense prescriptions that matter most.

**Removed the BioBERT claim from `HomePage.jsx:75`.** It had been on the homepage
since before any of this existed, and there is no BioBERT in the project and
deliberately never will be (§9.3).

### Verified end to end, on real API output

```
2.jpg  prescription  4 medicines  risk=none
   confirmed unverified Oflazest OZ  Ofloxacin + Ornidazole
   confirmed partial    Azenac MR    Aceclofenac + Paracetamol
   probable  verified   Andial       Loperamide
   probable  verified   Zofer        Ondansetron

1.jpg  VERBATIM CHAIN INTACT THROUGH THE WHOLE STACK:
   raw_reading  'Dijoxin'      <- what the model saw, preserved to the UI
   brand        'Digoxin'      <- S2 correction
   matched_via  'Digoxin'      <- rescued by the model's own alternatives
   match_score  100.0          <- and it is auditable at every step
```

All three layers pass: 8/8 ml_pipeline modules, 7/7 API routes, `vite build`.

Spend across the whole of Track C: **$0.00** — every read came from the cache.
Running total $0.0686 of $5.

---

## Open items

1. ~~`ANTHROPIC_API_KEY`~~ **DONE** — key in `.env`, live calls verified.
2. ~~`messages.parse()` with an image unverified~~ **DONE** — it works.
3. ~~Indian brand vocabulary (P4).~~ **DONE — session 3.** 239,541 brands from
   `indian_medicines_master.csv`, NLEM 2022 as the verification gate.
   `data/brands_observed.txt` and the 78-pair BD seed are now dead fixtures and
   can be deleted.
4. **A strength suffix in `drug_token` hurts matching.** `Monas 10` vs `Monas`
   falls below the abstain floor. The S1 prompt should keep strength out of
   `drug_token`, but this is worth watching on real output and is a candidate
   for P3 tuning. Deliberately not "fixed" yet — the evidence should come from
   real model output, not from my guess about it.
5. **AMBIGUOUS is the one S2 path not yet exercised on real data.** It needs two
   vocabulary entries within 6 points of each other. The logic is straightforward
   and unit-reachable, but it has not fired on an actual page.

## Things deliberately NOT built

Recording these so they are not mistaken for oversights:

- **The S2 VLM tiebreak** (§5/S2 step 4). AMBIGUOUS routes to the human instead.
- **Dual-VLM cross-check.** Deferred to Phase 2 (§3.3) — while a doctor reviews
  every page their corrections are ground truth, which dominates model
  disagreement.
- **Anything TrOCR.** Cut from the serving path (§3.3).
- **Any RL/training scaffolding.** Per §16.3 the prerequisite is data capture,
  not code. No `rl/` package, no stub trainers.

## How to run the product

```bash
# backend (READER=mock for zero-cost UI work)
cd backend && python3 main.py                 # -> http://localhost:8000
cd backend && READER=mock python3 main.py     # no API key, no cost

# frontend
cd web_app && npm install && npm run dev      # -> http://localhost:5173
```

Upload a prescription -> lands on the review screen -> correct or confirm.

## How to run the pipeline directly

```bash
cd ml_pipeline

# S0 only — image normalisation + token accounting
python3 -m ingest.normalise ../VLM_CHECK/*.jpg

# S1 with the mock reader (no API, no cost)
python3 -m vlm.page_reader --reader mock          ../VLM_CHECK/2.jpg
python3 -m vlm.page_reader --reader mock_negative ../VLM_CHECK/2.jpg

# S1 for real (needs ANTHROPIC_API_KEY)
python3 -m vlm.page_reader --reader claude ../VLM_CHECK/1.jpg

# S1 + S2 together
python3 -m vlm.vocab --reader mock ../VLM_CHECK/2.jpg

# prompt version / fingerprint
python3 -m vlm.prompts

# spend so far
python3 -m vlm.spend
```

Caches and the spend ledger live in `ml_pipeline/.cache/` (gitignored — the
response cache can contain PHI). Delete it to force a cold run.
