# Architecture Decision Records

Status: **Accepted** (rev 3: local-only, mock Google, own network layer, shadcn, plain JS) · 2026-10-01 · Inputs: REQUIREMENTS.md v1.1, DOMAIN_MODEL.md v1.0

Format per record: Context → Decision → Consequences. Status values: Proposed · Accepted · Superseded.

| # | Title | Status |
|---|---|---|
| ADR-001 | Modular monolith: React SPA + single Express API + SQLite | Accepted |
| ADR-002 | SQLite in WAL mode on a single server instance | Accepted |
| ADR-003 | Money stored as integer paise | Accepted |
| ADR-004 | Balances computed on read, never stored | Accepted |
| ADR-005 | Server-side sessions in httpOnly cookies | Accepted |
| ADR-006 | Google sign-in mocked behind identity-provider interface; no email verification (v1.3) | Accepted |
| ADR-007 | One transaction per command, including history, activity and notifications | Accepted |
| ADR-008 | In-app notifications delivered by polling (own poller) | Accepted |
| ADR-009 | Layered backend: routes → services → repositories | Accepted |
| ADR-010 | Plain JavaScript end to end with shared validation schemas | Accepted |
| ADR-011 | Time: store UTC instants, expense dates as plain dates, report in IST | Accepted |
| ADR-012 | Local client–server setup (no deployment in scope) | Accepted |
| ADR-013 | Backups: manual local snapshot script | Accepted |
| ADR-014 | Own network layer in vanilla JavaScript (no data-fetching library) | Accepted |
| ADR-015 | UI primitives with shadcn/ui (Tailwind CSS + Radix) | Accepted |

---

## ADR-001 — Modular monolith: React SPA + single Express API + SQLite

**Context.** ~10k registered users, small team, no deadline, goal "simple and predictable". Stack fixed by product owner: React, Node + Express, SQLite.

**Decision.** One deployable backend (Express) organised as internal modules per domain area (auth, groups, expenses, settlements, balances, notifications, reports). One React single-page app. One SQLite database file. No microservices, no message broker, no cache server.

**Consequences.**
- ✅ One process to run, debug, deploy, back up.
- ✅ Domain modules can be split out later if ever needed; boundaries are kept in code.
- ❌ Whole API scales vertically only (see ADR-002).

---

## ADR-002 — SQLite in WAL mode on a single server instance

**Context.** SQLite is an embedded, file-based database: only one process should write to it, and the file lives on one machine. Expected load (see HLD §2) is ~5–20 requests/second at peak, writes ≈ 1–3/second.

**Decision.**
- SQLite with Write-Ahead Logging (WAL), foreign keys ON, busy timeout set.
- Exactly **one** API instance owns the database file, on local disk (not a network file share).
- Synchronous driver (`better-sqlite3`); short transactions.

**Consequences.**
- ✅ Zero DB administration, very fast reads, many concurrent readers with one writer.
- ✅ Headroom: SQLite in WAL comfortably handles hundreds of small writes/second — ~100× expected load.
- ❌ No horizontal scaling and no automatic failover. A deploy or crash means brief downtime (seconds). Accepted for v1.
- ❌ Must not scale API to multiple replicas while on SQLite.
- 🔁 **Exit path:** data access goes through a query builder that also supports PostgreSQL (ADR-010 stack). Triggers to migrate: need for >1 API instance, high availability, or sustained write contention.

---

## ADR-003 — Money stored as integer paise

**Context.** NFR-07: exact to 2 decimals, no floating-point drift. JavaScript numbers are floating point (0.1 + 0.2 ≠ 0.3).

**Decision.** Every amount is stored, transmitted and calculated as an **integer number of paise** (₹123.45 → 12345). Percentages are stored as integer basis points with 2 decimal places (33.33% → 3333). Conversion to "₹123.45" happens only in the UI. All split and remainder logic lives in one pure, fully unit-tested module.

**Consequences.**
- ✅ Exact sums; split invariants (Σ shares = amount) are checkable with `===`.
- ✅ Same rule in browser preview and server.
- ❌ UI must convert on input and display; covered by shared helpers.

---

## ADR-004 — Balances computed on read, never stored

**Context.** Balances are derived (DOMAIN_MODEL §4.2). Storing them risks drift when expenses are edited, deleted or settled. Typical group: 3–10 members, tens to a few hundred expenses.

**Decision.** Pairwise balances, net positions and dashboard totals are calculated by aggregate queries over active expense shares and settlements every time they are requested. No balance table.

**Consequences.**
- ✅ Always correct; edits and soft deletes need no extra bookkeeping.
- ✅ Zero-balance guards (leave, remove, delete account) read the same calculation.
- ❌ Dashboard cost grows with number of groups × expenses. At expected size this is milliseconds. Revisit with a cached summary only if measured p95 > 200 ms.

---

## ADR-005 — Server-side sessions in httpOnly cookies

**Context.** FR-AUTH-05 requires logout from the current device only. Two login methods must produce the same kind of logged-in state.

**Decision.**
- On login, the server creates a session row (user, device info, created, last seen, expiry) and sets a random session ID in a cookie: `HttpOnly`, `Secure`, `SameSite=Lax`.
- Logout deletes that one session row.
- Passwords hashed with Argon2id. Login, signup and verification endpoints rate-limited.
- State-changing requests require same-origin (Origin header check) as CSRF defence.

**Consequences.**
- ✅ Logout is immediate and per device; no token revocation problems.
- ✅ Tokens never reachable from JavaScript (XSS cannot steal them).
- Local mode: `Secure` flag off (http://localhost), see ADR-012.
- ❌ One DB read per request to load the session — trivial on SQLite.
- Future "log out everywhere" = delete all session rows of a user.

---

## ADR-006 — Google sign-in mocked behind an identity-provider interface (no email verification)

**Context.** FR-AUTH-02/04: Google sign-in; same email merges with a password account. Project runs locally only; no real Google client. **REQUIREMENTS v1.3 removed email verification** for the MVP.

**Decision.**
- Backend defines an **identity provider interface**: "authorize URL" and "complete sign-in → email + name + subject". v1 ships a **Mock Google provider** that signs in one hardcoded dummy user (`mock.user@gmail.com`).
- Everything after the provider is real: match by Google subject, else by email (link Google method), else create a user; then a normal session (ADR-005).
- Password signup creates a verified account and logs in. Signup on an email that already has any account is rejected, so a password is never attached to someone else's Google account.
- No mailer and no dev outbox (removed in v1.3). The mock provider is refused when `NODE_ENV=production`.

**Consequences.**
- ✅ Simplest possible signup; no external services.
- ✅ Swapping in real Google OIDC later = new provider class, no service changes.
- ⚠️ **Accepted MVP risk (D-19):** without verification anyone can register any email. If someone registers a victim's email with a password before the victim ever signs in with Google, a later Google sign-in by the victim merges into that account and the registrant's password still works ("pre-account hijacking"). Mitigations when needed: re-introduce verification, or on Google merge remove an existing password method and end its sessions.

---

## ADR-007 — One transaction per command, including history, activity and notifications

**Context.** Every change must produce a Change Record (FR-EXP-11), an Activity Event (FR-ACT-01) and Notifications (FR-NTF-01). These must never disagree with the data.

**Decision.** Each command (e.g. "edit expense") runs as **one database transaction** that: checks guards → writes the change → writes the change record → writes the activity event → writes notifications. All or nothing. No background jobs, no events bus.

**Consequences.**
- ✅ History and feed are always consistent with data.
- ✅ Simple to reason about and test.
- ❌ Commands slightly heavier (a few extra inserts) — negligible.
- Concurrency (FR-EXP-12, last write wins) is natural: SQLite serialises writers; each write is recorded.

---

## ADR-008 — In-app notifications delivered by polling

**Context.** Only in-app notifications in v1. Real-time push (WebSockets/SSE) adds connection state and complexity.

**Decision.** The client's own network layer (ADR-014) polls the unread count every 60 seconds while the tab is visible (Page Visibility API) and on route change. Notification list fetched on demand. Group screens refetch when the tab regains focus.

**Consequences.**
- ✅ Stateless server; nothing to keep alive.
- ❌ Up to ~60 s delay. Acceptable for an expense app.
- Polling, pausing and refetch-on-focus are implemented by us (no library).

---

## ADR-009 — Layered backend: routes → services → repositories

**Context.** Business rules are many (guards, splits, permissions). They must be testable without HTTP or the database.

**Decision.** Three layers per module:
1. **Routes/controllers** — HTTP only: parse, validate input shape, call service, map result/error to response.
2. **Services** — business rules: permissions, guards, transactions, calls to pure domain logic (split engine, balance math).
3. **Repositories** — the only code that touches SQL.
Cross-cutting middleware: session loading, authentication, request logging, error handler, rate limiting.

**Consequences.**
- ✅ Domain rules unit-testable; predictable structure for every module.
- ❌ Some boilerplate per endpoint. Accepted.

---

## ADR-010 — Plain JavaScript (ES modules) end to end with shared validation schemas

**Context.** Same rules (amount format, description ≤100, notes ≤500, % sum = 100, exact sum = total) are needed in the form (live feedback, FR-SPL-06) and the server (authoritative). Product owner chose plain JavaScript, no TypeScript.

**Decision.**
- Client, server and shared code written in **plain JavaScript (ES modules)**. No TypeScript, no compile step for the server.
- A small `shared` package used by both sides: Zod validation schemas, money helpers, split engine, error codes.
- Zod schemas are the single source of truth for data shapes (replacing static types). JSDoc comments on public functions where shape is not obvious.
- Server always re-validates.

**Consequences.**
- ✅ One definition of each rule; UI preview equals server result.
- ✅ No build step on the server; simpler tooling.
- ❌ No compile-time type checking — mitigated by Zod validation at boundaries, ESLint, and tests (unit tests for split engine and services are mandatory).

---

## ADR-011 — Time: store UTC instants, expense dates as plain dates, report in IST

**Context.** NFR-04: show IST, 24-hour. Reports group by Mon–Sun week and calendar month (FR-RPT-02). Midnight boundaries matter.

**Decision.**
- Event moments (created at, edited at, session times) stored as UTC timestamps; displayed in IST.
- Expense date and settlement date stored as **calendar dates** (`YYYY-MM-DD`) with no time, as entered by user in IST.
- "Today" (for the no-future-dates rule) is evaluated in IST on the server.
- Report periods computed on IST calendar dates.

**Consequences.**
- ✅ No day-shift bugs around midnight; reports deterministic.
- ❌ If other time zones are added later, the "today" rule needs a user time zone.

---

## ADR-012 — Local client–server setup (no deployment in scope)

**Context.** Project runs locally only. Deployment, TLS, reverse proxy, process supervision are out of scope. Architecture must still be a clean client–server split.

**Decision.**
- Two processes started from the repo:
  - **Client:** React app on the Vite dev server (e.g. `http://localhost:5173`).
  - **Server:** Express API (e.g. `http://localhost:4000`), sole owner of the SQLite file (`./data/app.db`).
- Client talks to server **only** via JSON over HTTP under `/api/*`. Client never touches the database.
- Vite dev server proxies `/api` → Express, so the browser sees one origin: no CORS config, session cookie is first-party.
- Cookie flags for local: `HttpOnly`, `SameSite=Lax`; `Secure` off (plain http on localhost), switched on by config if ever deployed.
- One command (`npm run dev`) starts both; `npm run db:reset` re-creates the database with seed data (mock users, sample groups).

**Consequences.**
- ✅ Same boundaries as a deployed system; easy to deploy later (add proxy + TLS).
- ✅ Zero infrastructure.
- ❌ No HTTPS locally — acceptable for local use only.

---

## ADR-013 — Backups: manual local snapshot script

**Context.** NFR-09 (daily backups, 30-day retention) assumed a hosted system. Locally there is no server to schedule on.

**Decision.** Provide `npm run db:backup`, which writes a consistent snapshot of the SQLite file (SQLite online backup API) to `./data/backups/<timestamp>.db` and keeps the latest 30. Run manually. Automated daily off-box backup deferred until deployment.

**Consequences.**
- ✅ Safe copies while the app runs; trivial restore (copy file back).
- ❌ NFR-09 not met automatically in local mode — documented deviation.

---

## ADR-014 — Own network layer in vanilla JavaScript (no data-fetching library)

**Context.** Product owner prefers no TanStack Query; the client needs a predictable, owned way to call the server.

**Decision.** A small in-house **API client** module built on the browser `fetch` API:
- Base URL `/api`, JSON in/out, `credentials: 'same-origin'` for the session cookie.
- One error shape: maps server errors (`code`, `message`, `fieldErrors`) to an `ApiError` class; network failure and timeout (AbortController) handled uniformly.
- 401 → central "session expired" handler → redirect to login.
- One function per endpoint grouped by module (`authApi`, `groupsApi`, `expensesApi`, …) — screens never call `fetch` directly.
- Tiny helpers we own: a `useRequest` hook (loading / data / error / refetch), a poller (interval + pause when tab hidden), and explicit refetch after mutations (no global cache).
- Request cancellation on unmount to avoid stale updates.

**Consequences.**
- ✅ No dependency; behaviour fully visible and testable.
- ✅ Single place for auth, errors, timeouts.
- ❌ No automatic caching or deduplication — screens refetch what they show. Acceptable at this scale.
- ❌ Refetch-after-mutation must be done deliberately per screen.

---

## ADR-015 — UI primitives with shadcn/ui (Tailwind CSS + Radix)

**Context.** Need accessible-enough, consistent primitives (button, input, dialog, table, select, tabs, toast, date picker) for a desktop UI.

**Decision.** Use **shadcn/ui**: components are copied into the repo (`components/ui`) and owned by us; built on Radix primitives and styled with Tailwind CSS. Feature components compose these primitives; no other component library.

**Consequences.**
- ✅ Full control over component code; no version lock-in.
- ✅ Dialogs (admin-leave, warnings), tables (expenses, balances), forms covered.
- ❌ Requires Tailwind CSS setup. Upgrades are manual (re-pull a component).
