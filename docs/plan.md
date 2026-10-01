# SplitBook — Implementation Plan (v1)

Status: **Approved** · 2026-10-01
Inputs: REQUIREMENTS.md v1.2 · DOMAIN_MODEL.md · ADR.md · ARCHITECTURE.md · DATABASE_SCHEMA.md · API_CONTRACT.md · WIREFRAMES.md (all accepted)

## How this plan works

- Work goes milestone by milestone, in order. Each milestone ends with a **checkpoint**: demo + tests green + your OK before the next starts.
- A task is checked `[x]` only when its code is written **and** its tests pass.
- Stack (ADR): plain JavaScript (ES modules) · React + Vite + shadcn/ui + React Hook Form · own `fetch` layer · Node 24 + Express 5 · SQLite (WAL) + better-sqlite3 + Drizzle · Zod · Vitest / Supertest / Playwright.
- Test-first for pure logic (money, split engine, balances). Every API endpoint gets Supertest coverage for success + each documented error code.
- Any change to an accepted doc is proposed first, then the doc is updated with a version bump.
- Every user prompt keeps being logged in `docs/prompt.md`.

## Milestone overview

| # | Milestone | Outcome |
|---|---|---|
| M0 | Repo & tooling | `npm run dev` starts empty client + server; lint + test run |
| M1 | Shared core | Money, dates, split engine, Zod schemas, error codes — fully unit-tested |
| M2 | Database | Schema migrations, connection pragmas, seed, backup script |
| M3 | Server foundation | Express app, middleware, error format, sessions, health |
| M4 | Auth & profile API | Signup, verify, login, mock Google, logout, profile, delete account |
| M5 | Groups & membership API | Groups, members, search, leave/remove/admin-leave, delete |
| M6 | Expenses & balances API | Expense CRUD + history, balances, breakdown, dashboard |
| M7 | Settlements, activity, notifications API | Settlement CRUD + history, activity feed, notifications |
| M8 | Reports API | Weekly/monthly report + CSV |
| M9 | Client foundation | Network layer, shell, routing, shadcn setup, auth guard |
| M10 | Client screens: auth, profile, dashboard, groups | §1–§7 wireframes |
| M11 | Client screens: expenses, balances, settlements | §8–§11 wireframes |
| M12 | Client screens: notifications, reports | §12–§13 wireframes |
| M13 | End-to-end tests & hardening | Playwright flows, edge-case sweep, README |

---

## M0 — Repo & tooling

- [x] `git init`, `.gitignore` (node_modules, `data/`, `.env`, build output)
- [x] Root `package.json` with npm workspaces: `client`, `server`, `shared`; Node 24 pinned (`engines`, `.nvmrc`)
- [x] ESLint (flat config) + Prettier for all workspaces; `npm run lint`
- [x] Vitest configured in `shared` and `server`; `npm test` runs all workspaces
- [x] `server`: Express 5 skeleton (`src/index.js`) listening on `:4000`
- [x] `client`: Vite + React skeleton on `:5173` with `/api` proxy → `:4000`
- [x] Root scripts: `dev` (client + server together), `test`, `lint`, `db:reset`, `db:backup`
- [x] `.env.example` (PORT, DB_PATH, SESSION settings, APP_ORIGIN, NODE_ENV)
- [x] Folder layout created per ARCHITECTURE §6 (server modules, client features)

Notes: ESLint pinned to v9 (eslint-plugin-react not yet compatible with ESLint 10). `db:reset` / `db:backup` are placeholders until M2.

**Checkpoint M0 ✅ (pending your OK):** `npm run dev` shows a blank SplitBook page; `npm test` and `npm run lint` pass.

---

## M1 — Shared core (`shared/`) — test-first

- [x] `money.js`: rupees string ↔ paise, format `₹1,20,000.00` (en-IN), percent string ↔ basis points; reject >2 decimals, negatives, unsafe integers
- [x] `dates.js`: IST "today", `YYYY-MM-DD` validation, not-future check, week (Mon–Sun) and month ranges for a date
- [x] `split.js` split engine (DOMAIN §4.1):
  - [x] Equal split with remainder → payer if participant, else first participant (FR-SPL-01)
  - [x] Exact split: Σ must equal total, else `SPLIT_SUM_MISMATCH` with difference (FR-SPL-02)
  - [x] Percentage split: Σ = 10000 bp, else `PERCENT_SUM_MISMATCH`; rupee remainder rule as equal (FR-SPL-03)
  - [x] Zero shares rejected / dropped (FR-SPL-04); payer-only participant allowed (FR-SPL-05)
  - [x] Live "remaining" helper for the form (FR-SPL-06)
  - [x] Property test: Σ shares === amount for random inputs
- [x] `schemas/`: Zod schemas for every request body/query in API_CONTRACT (lengths S-1..S-3, password 8–128, pagination)
- [x] `errors.js`: error code catalog (API §12) with HTTP status + default message
- [x] Edge-case tests E1–E7 from REQUIREMENTS §6

Notes:
- Split engine returns `{ ok, shares }` or `{ ok: false, code, details|fieldErrors }` — no throws for business errors.
- Amount too small to give every participant ≥ ₹0.01 (e.g. ₹0.02 among 3) → `VALIDATION_ERROR` on `amountPaise`.
- Percentage maths uses BigInt — no precision loss up to `Number.MAX_SAFE_INTEGER` paise.
- Sum checks live in the split engine (so the API returns `SPLIT_SUM_MISMATCH` / `PERCENT_SUM_MISMATCH` with the difference); Zod checks shape, lengths, per-method values, duplicates, future dates (`FUTURE_DATE`).
- 124 tests incl. 2 property tests (fast-check).

**Checkpoint M1 ✅ (pending your OK):** test report for shared package; walk through split examples together.

---

## M2 — Database (`server/src/db/`)

- [ ] Drizzle schema matching DATABASE_SCHEMA §5 (12 tables, STRICT, CHECKs, partial unique indexes)
- [ ] Migration generated + hand-checked against §5 DDL (STRICT / partial indexes added via custom SQL if Drizzle can't emit them)
- [ ] Connection module: WAL, foreign_keys, busy_timeout, synchronous=NORMAL
- [ ] Migrations run on server start
- [ ] `db:reset` seed (DATABASE_SCHEMA §9): Karan, Priya, Ravi, Ananya (`password123`), groups "Trip Goa" and "Flat 302", expenses of each split method, one settlement
- [ ] `db:backup` script: online backup to `data/backups/<timestamp>.db`, keep latest 30 (ADR-013)
- [ ] Tests: constraint checks (one active admin, one active membership, amount > 0, from ≠ to), group delete cascade, notification `group_id` → NULL

**Checkpoint M2:** reset + seed runs; open DB and inspect seeded data.

---

## M3 — Server foundation

- [ ] App factory (`createApp(db)`) so tests run against an in-memory/temp DB
- [ ] Middleware: JSON body limit, helmet, request ID + pino logging, Origin check on non-GET (CSRF), rate limit on `/api/auth/*`
- [ ] Session middleware: read `sid` cookie → hash → session row → `req.user`; sliding 30-day expiry (S-4); `requireAuth`
- [ ] Validation helper: Zod → `400 VALIDATION_ERROR` with `fieldErrors`
- [ ] Central error handler → API §1.1 format; unknown errors → `500 INTERNAL` (no leak)
- [ ] Transaction helper (one transaction per command, ADR-007)
- [ ] Shared writers used inside transactions: `recordChange`, `recordActivity`, `notify` (with message + group name snapshot)
- [ ] Membership access helper: active member or `404` (NFR-06)
- [ ] `GET /api/health` (H1)
- [ ] Tests: error format, CSRF rejection, auth gate, 404 for non-member

**Checkpoint M3:** health endpoint + middleware tests green.

---

## M4 — Auth & profile API (A1–A8, P1–P3, X1)

- [ ] Argon2id password hashing
- [ ] Mailer interface + console mailer + in-memory dev outbox (X1, non-production only)
- [ ] Identity-provider interface + mock Google provider (one hardcoded user `mock.user@gmail.com`) (ADR-006)
- [ ] A1 signup — all 4 cases incl. `link_password` for Google-only email (DF-3)
- [ ] A2 verify-email — `verify_email` and `link_password`; single-use, 24 h; auto-login (API-3)
- [ ] A3 resend verification (always 202)
- [ ] A4 login — `INVALID_CREDENTIALS`, `EMAIL_NOT_VERIFIED`, rate limit
- [ ] A5/A6 Google start/callback — known subject, email merge, new user; `state` check
- [ ] A7 logout (current session only), A8 me
- [ ] P1 edit name, P2 change password (`NO_PASSWORD_METHOD`, `WRONG_PASSWORD`)
- [ ] P3 delete account — zero-balance guard across groups, tombstone (S-6), memberships → left, sessions cleared
- [ ] Mock provider and dev outbox refuse to load when `NODE_ENV=production`
- [ ] Supertest coverage for every success path and error code above

**Checkpoint M4:** sign up → verify via outbox → log in → mock Google merge, via HTTP client or tests.

---

## M5 — Groups & membership API (U1, G1–G5, M1–M3)

- [ ] U1 user search — verified/active only, excludes self and current members, max 10
- [ ] G1 list my groups with my net balance
- [ ] G2 create group — ≥ 2 members, creator admin, notifications + activity
- [ ] G3 group detail with members, past members, my role, nets
- [ ] G4 edit name/description (any member)
- [ ] G5 delete group — admin only, confirmation when balances open, notify all, hard delete
- [ ] M1 add member — admin only, `ALREADY_MEMBER`, `USER_NOT_ELIGIBLE`, re-add = new membership
- [ ] M2 remove member — admin only, `CANNOT_REMOVE_SELF`, `BALANCE_NOT_ZERO`
- [ ] M3 leave — member zero-balance guard; admin flow `transfer` / `delete` / `ADMIN_MUST_CHOOSE` / always-confirm delete
- [ ] Balance calculator module (DATABASE_SCHEMA §6.1–6.2) — built here because guards need it; unit-tested with the M2 seed
- [ ] Tests: edge cases E15–E20b, E28

**Checkpoint M5:** group lifecycle demo through API.

---

## M6 — Expenses & balances API (E1–E6, B1–B2, D1)

- [ ] E2 create — payer/participants active, shared split engine, `position` order, change record + activity + notifications
- [ ] E1 list — search `q` (description/notes), `date`, `amountPaise`, pagination, `myShare`, frozen flag
- [ ] E3 detail — shares, permissions (`canEdit`, `canDelete`, `frozenReason`), deleted expenses viewable
- [ ] E4 edit — creator/admin, split method locked, add/remove participants (active only), payer change, departed-member freeze, `SETTLEMENT_EXISTS` confirmation, last write wins, before/after record
- [ ] E5 soft delete — creator/admin, freeze check
- [ ] E6 history
- [ ] B1 balances — pairwise netted + my position
- [ ] B2 breakdown for a pair
- [ ] D1 dashboard — totals, groups with net, latest 10 activity
- [ ] Tests: E1–E11, E23–E24, E27; balances verified against hand-calculated seed scenarios

**Checkpoint M6:** add/edit/delete expenses and see balances change correctly.

---

## M7 — Settlements, activity, notifications API (S1–S6, AC1, N1–N4)

- [ ] S2 record — party-only, from ≠ to, active members, `OVERPAYMENT` confirmation, notify other party
- [ ] S1 list, S3 detail
- [ ] S4 edit — overpayment computed excluding this settlement; freeze check
- [ ] S5 soft delete, S6 history
- [ ] AC1 activity feed (paginated)
- [ ] N1 list (`unreadOnly`, `link` null when group deleted), N2 unread count, N3 mark read (recipient only), N4 mark all
- [ ] Tests: E12–E14, E29; notification recipients per DOMAIN §2.11 table

**Checkpoint M7:** full money loop: expense → balance → settle up → zero.

---

## M8 — Reports API (R1–R2)

- [ ] R1 report — week (Mon–Sun) / month in IST, `date` anchor, optional `groupId`; paid, my share, settlements paid/received; expense + settlement rows
- [ ] R2 CSV — streamed, RFC 4180 escaping, formula-injection guard, UTF-8 BOM, filename
- [ ] Tests: period boundaries (week across months, month ends), group filter, E25–E26, CSV escaping

**Checkpoint M8:** download a CSV from seed data and open it in a spreadsheet.

**Backend complete.**

---

## M9 — Client foundation

- [ ] Tailwind + shadcn/ui init; add primitives from WIREFRAMES §0.4; light theme only
- [ ] Network layer (ADR-014): `apiFetch` (JSON, credentials, timeout/abort, `ApiError`, 401 handler), per-module API functions for all endpoints
- [ ] `useRequest` hook (loading / data / error / refetch, cancel on unmount)
- [ ] Visibility-aware poller (60 s) for unread count
- [ ] Error-code → user message map (API §12)
- [ ] Format helpers from `shared` (₹, dates IST 24 h, truncation at 40)
- [ ] Router with all routes from WIREFRAMES §0.3; auth guard via A8 with `next` redirect
- [ ] App shell (§1): top bar, nav, bell with count, profile menu, logout
- [ ] Toast, confirmation-dialog helper for `CONFIRMATION_REQUIRED` flow
- [ ] Vitest + React Testing Library set up for client

**Checkpoint M9:** logged-in shell with live bell count against seeded server.

---

## M10 — Client screens: auth, profile, dashboard, groups

- [ ] §2 Log in, Sign up, Check-your-email (dev outbox link), Verify landing
- [ ] §3 Profile — name, password (hidden for Google-only), logout, delete account with type-DELETE + blocked-balances dialog
- [ ] §4 Dashboard — totals, groups, recent activity, empty state
- [ ] §5 Group list + create group with member search
- [ ] §6 Group detail frame, header actions, tabs, Settings tab
- [ ] §7 Members tab, add member, remove, leave, admin-leave dialog, delete group (type group name)

**Checkpoint M10:** click through account + group flows in the browser.

---

## M11 — Client screens: expenses, balances, settlements

- [ ] §8 Expense form (full page) — React Hook Form + Zod, three split modes with live remaining, drag order, edit mode with locked method, settlement-exists dialog, server error mapping
- [ ] §9 Expense list (search, filters in URL, pagination, 🔒) + detail (shares, history diff, frozen/deleted states, delete confirm)
- [ ] §10 Balances tab + breakdown dialog
- [ ] §11 Settle-up dialog (prefill, overpayment dialog, edit/delete) + Settlements tab
- [ ] Activity tab (§14 layout)

**Checkpoint M11:** add expense of each split method, settle up, see balances update.

---

## M12 — Client screens: notifications, reports

- [ ] §12 Bell popover (latest 5) + Notifications page (all/unread, mark read, deleted-group rows)
- [ ] §13 Reports — week/month toggle, period nav, group filter, totals, tables, CSV download

**Checkpoint M12:** full app usable end to end.

---

## M13 — End-to-end tests & hardening

- [ ] Playwright set up against a freshly seeded DB
- [ ] E2E: sign up → verify → log in → create group
- [ ] E2E: add expenses (equal / exact / percentage) → balances → settle up → zero → leave group
- [ ] E2E: admin leave — transfer and delete paths
- [ ] E2E: edit expense after settlement (warning) and departed-member freeze
- [ ] E2E: notifications and report CSV download
- [ ] Sweep REQUIREMENTS §6 edge cases E1–E29 — each mapped to a passing test
- [ ] Security pass: no secrets in logs, mock auth disabled in production mode, CSRF/Origin, rate limits, 404 on foreign groups
- [ ] Root `README.md`: setup, scripts, seeded logins, project structure, links to docs
- [ ] Requirement traceability check: every FR/NFR mapped to code + test

**Checkpoint M13:** v1 done.

---

## Out of scope for this plan

Everything in REQUIREMENTS §2 "Out of scope", plus deployment (local only, ADR-012).

## Risks to watch

| Risk | Mitigation |
|---|---|
| Drizzle may not emit `STRICT` tables or partial unique indexes | Add via custom SQL migration (M2) |
| Rounding bugs in splits | Test-first + property test in M1 before any API work |
| Plain JS type slips | Zod at every boundary, ESLint, high test coverage on services |
| Scope creep during UI work | Wireframes are the contract; changes proposed first |
