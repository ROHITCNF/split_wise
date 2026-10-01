# SplitBook — API Contract (v1)

Status: **Accepted** (rev v1.3: email verification removed) · 2026-10-01 · Inputs: REQUIREMENTS.md v1.1, DOMAIN_MODEL.md v1.0, ADR.md, DATABASE_SCHEMA.md (all accepted)

REST-style JSON over HTTP between the React client and the Express server (ADR-012). The client calls these only through its own `fetch` layer (ADR-014).

---

## 1. Conventions

| Topic | Rule |
|---|---|
| Base path | `/api` (Vite proxies to Express) |
| Format | `Content-Type: application/json; charset=utf-8` both ways, except CSV download |
| Field naming | `camelCase` |
| IDs | Integers. Group-scoped actors are **membership IDs** (`membershipId`), not user IDs (DOMAIN §2.5) |
| Money | Integer paise, field name ends in `Paise` — e.g. `amountPaise: 120000` = ₹1,200.00 (ADR-003). Must be a positive safe integer |
| Percent | Integer basis points, field ends in `Bp` — `3333` = 33.33%, `10000` = 100% |
| Dates | `YYYY-MM-DD` (IST calendar date) for `expenseDate`, `settlementDate`, report periods |
| Timestamps | ISO-8601 UTC, e.g. `2026-10-01T06:36:38.853Z`; client renders IST 24 h (NFR-04) |
| Auth | Session cookie `sid` (`HttpOnly`, `SameSite=Lax`) set by login endpoints (ADR-005) |
| CSRF | Non-GET requests must carry an `Origin` header equal to the app origin, else `403 FORBIDDEN` |
| Pagination | Query `page` (1-based, default 1), `pageSize` (default 20, max 100). Response `{ items, page, pageSize, total }` |
| Empty success | `204 No Content` |
| Validation | Every body/query validated with shared Zod schemas (ADR-010); unknown fields rejected |
| Rate limit | `/api/auth/*`: 10 requests / minute / IP → `429 RATE_LIMITED` |

### 1.1 Error format

```json
{
  "error": {
    "code": "BALANCE_NOT_ZERO",
    "message": "You still owe ₹350.00 in this group.",
    "fieldErrors": { "amountPaise": "Must be greater than 0" },
    "details": { "netPaise": -35000 }
  }
}
```
`fieldErrors` only for `VALIDATION_ERROR`. `details` is code-specific (see §12).

### 1.2 Status codes

| Status | When |
|---|---|
| 200 / 201 / 204 | Success |
| 400 | Input invalid — shape, length, split sums, future date (`VALIDATION_ERROR` or a specific code) |
| 401 | Not logged in / session expired (`UNAUTHENTICATED`) or bad credentials |
| 403 | Logged in and a member, but action not allowed for this role (`FORBIDDEN`, `NOT_SETTLEMENT_PARTY`) |
| 404 | Resource doesn't exist **or** caller is not a member of its group (no existence leak, NFR-06) |
| 409 | Valid request, blocked by current state (`BALANCE_NOT_ZERO`, `INVOLVES_DEPARTED_MEMBER`, `CONFIRMATION_REQUIRED`, …) |
| 429 | Rate limited |
| 500 | Unexpected (`INTERNAL`) — message generic, details logged server-side only |

### 1.3 Confirmation pattern (warnings)

Some actions are allowed but need explicit confirmation (FR-EXP-09, FR-STL-03, FR-GRP-13, FR-GRP-18). Flow:

1. Client sends request **without** `confirm`.
2. If a warning applies, server returns `409 CONFIRMATION_REQUIRED` with `details.reason` and data to show, and **changes nothing**.
3. Client shows a dialog; on "Continue", resends the same request with `"confirm": true` (body) or `?confirm=true` (DELETE).

| `details.reason` | Endpoint | Details |
|---|---|---|
| `SETTLEMENT_EXISTS` | Edit expense | `settlementCount` |
| `OVERPAYMENT` | Record / edit settlement | `owedPaise`, `amountPaise` |
| `GROUP_HAS_BALANCES` | Delete group, admin leave-and-delete | `pairs` (non-zero balances) |

### 1.4 Common objects

```jsonc
// User (self)
{ "id": 7, "name": "Karan", "email": "karan@example.com", "emailVerified": true,
  "loginMethods": ["password", "google"], "createdAt": "2026-10-01T06:36:38.853Z" }

// MemberRef — used wherever a person appears inside a group
{ "membershipId": 12, "userId": 7, "name": "Karan", "status": "active" }   // status: active | left | removed
// UI shows "Karan (left)" when status ≠ active (FR-GRP-11)

// Share
{ "member": MemberRef, "sharePaise": 33334, "inputPaise": null, "inputBp": 3333, "position": 0 }
```

---

## 2. Endpoint Index

| # | Method & path | Purpose | Who |
|---|---|---|---|
| **Auth** ||||
| A1 | `POST /api/auth/signup` | Register with email + password | Public |
| ~~A2~~ | ~~`POST /api/auth/verify-email`~~ | Removed in v1.3 | — |
| ~~A3~~ | ~~`POST /api/auth/resend-verification`~~ | Removed in v1.3 | — |
| A4 | `POST /api/auth/login` | Password login | Public |
| A5 | `GET /api/auth/google/start` | Begin Google sign-in (mock) | Public |
| A6 | `GET /api/auth/google/callback` | Finish Google sign-in (mock) | Public |
| A7 | `POST /api/auth/logout` | End this device's session | User |
| A8 | `GET /api/auth/me` | Current user | User |
| **Profile** ||||
| P1 | `PATCH /api/me` | Edit display name | User |
| P2 | `POST /api/me/password` | Change password | User (password method) |
| P3 | `DELETE /api/me` | Delete account | User |
| **Users** ||||
| U1 | `GET /api/users/search` | Find users by name | User |
| **Dashboard** ||||
| D1 | `GET /api/dashboard` | Totals, groups, recent activity | User |
| **Groups** ||||
| G1 | `GET /api/groups` | My groups | User |
| G2 | `POST /api/groups` | Create group | User |
| G3 | `GET /api/groups/:groupId` | Group detail + members | Member |
| G4 | `PATCH /api/groups/:groupId` | Rename / edit description | Member |
| G5 | `DELETE /api/groups/:groupId` | Delete group | Admin |
| **Membership** ||||
| M1 | `POST /api/groups/:groupId/members` | Add member | Admin |
| M2 | `DELETE /api/groups/:groupId/members/:membershipId` | Remove member | Admin |
| M3 | `POST /api/groups/:groupId/leave` | Leave (member) / admin-leave flow | Member |
| **Balances** ||||
| B1 | `GET /api/groups/:groupId/balances` | Pairwise netted balances | Member |
| B2 | `GET /api/groups/:groupId/balances/breakdown` | Records behind one pair | Member |
| **Expenses** ||||
| E1 | `GET /api/groups/:groupId/expenses` | List / search / paginate | Member |
| E2 | `POST /api/groups/:groupId/expenses` | Add expense | Member |
| E3 | `GET /api/groups/:groupId/expenses/:expenseId` | Detail with shares | Member |
| E4 | `PUT /api/groups/:groupId/expenses/:expenseId` | Edit expense | Creator or Admin |
| E5 | `DELETE /api/groups/:groupId/expenses/:expenseId` | Soft delete | Creator or Admin |
| E6 | `GET /api/groups/:groupId/expenses/:expenseId/history` | Change history | Member |
| **Settlements** ||||
| S1 | `GET /api/groups/:groupId/settlements` | List | Member |
| S2 | `POST /api/groups/:groupId/settlements` | Record settlement | Member who is a party |
| S3 | `GET /api/groups/:groupId/settlements/:settlementId` | Detail | Member |
| S4 | `PUT /api/groups/:groupId/settlements/:settlementId` | Edit | Either party |
| S5 | `DELETE /api/groups/:groupId/settlements/:settlementId` | Soft delete | Either party |
| S6 | `GET /api/groups/:groupId/settlements/:settlementId/history` | Change history | Member |
| **Activity** ||||
| AC1 | `GET /api/groups/:groupId/activity` | Group feed | Member |
| **Notifications** ||||
| N1 | `GET /api/notifications` | List | User |
| N2 | `GET /api/notifications/unread-count` | Badge count (polled, ADR-008) | User |
| N3 | `POST /api/notifications/:notificationId/read` | Mark one read | Recipient |
| N4 | `POST /api/notifications/read-all` | Mark all read | User |
| **Reports** ||||
| R1 | `GET /api/reports` | Weekly / monthly personal report | User |
| R2 | `GET /api/reports/csv` | Same report as CSV | User |
| **System / dev** ||||
| H1 | `GET /api/health` | Liveness + DB check | Public |
| ~~X1~~ | ~~`GET /api/dev/outbox`~~ | Removed in v1.3 | — |

"Member" = caller has an **active** membership in the group. Past members (left/removed) lose all access to the group (FR-GRP-15). Non-members get `404`.

---

## 3. Auth

### A1. `POST /api/auth/signup`
```json
{ "name": "Karan", "email": "karan@example.com", "password": "s3cret-pass" }
```
Rules: name 1–60; email valid, lower-cased; password 8–128 chars.

**Changed in REQUIREMENTS v1.3 — no email verification.** The account is created verified and the user is logged in (session cookie set).

`201` → `{ "user": User }` + `Set-Cookie: sid=…`
`409 EMAIL_ALREADY_REGISTERED` — any active account already uses the email (password or Google-only).

### A2 / A3 — removed in v1.3
Email verification and "resend verification" no longer exist.

### A4. `POST /api/auth/login`
```json
{ "email": "karan@example.com", "password": "s3cret-pass" }
```
`200` → `{ "user": User }` + `Set-Cookie: sid=…` (30-day sliding, S-4)
Errors: `401 INVALID_CREDENTIALS` (wrong email or password — same message for both) · `429 RATE_LIMITED`

### A5. `GET /api/auth/google/start`
Browser navigation (not `fetch`). Server creates `state`, redirects (`302`) to the identity provider. **Mock provider (ADR-006):** redirects straight to A6 with a mock code.

### A6. `GET /api/auth/google/callback?code=…&state=…`
Server validates `state`, gets verified identity from provider (mock: `mock.user@gmail.com`, "Mock Google User"), then:
- Google subject known → log in that user.
- Email matches existing user → link Google method, log in (FR-AUTH-04).
- Otherwise → create verified user + Google method, log in.

Sets `sid`, `302` → client `/`. On failure `302` → client `/login?error=google_failed`.

### A7. `POST /api/auth/logout`
Deletes current session only (FR-AUTH-05). Clears cookie. `204`.

### A8. `GET /api/auth/me`
`200` → `{ "user": User }` · `401 UNAUTHENTICATED`. Client calls on app start.

---

## 4. Profile

### P1. `PATCH /api/me`
```json
{ "name": "Karan Mehta" }
```
`200` → `{ "user": User }`

### P2. `POST /api/me/password`
```json
{ "currentPassword": "old", "newPassword": "new-pass-123" }
```
`204` · `409 NO_PASSWORD_METHOD` (Google-only account) · `400 WRONG_PASSWORD`
Other sessions stay logged in (logout-all is out of scope).

### P3. `DELETE /api/me`
No body. Blocked if any balance in any group is non-zero (FR-AUTH-08).

`204` (session cleared) ·
`409 BALANCE_NOT_ZERO`:
```json
{ "error": { "code": "BALANCE_NOT_ZERO", "message": "Settle all balances before deleting your account.",
  "details": { "groups": [ { "groupId": 3, "groupName": "Trip Goa", "netPaise": -35000 } ] } } }
```
On success: account tombstoned, active memberships → `left`, all sessions removed (DATABASE_SCHEMA §4.1).

---

## 5. Users

### U1. `GET /api/users/search?q=pri&groupId=3`
- `q`: 2–60 chars, case-insensitive name match.
- Only **active** users (FR-GRP-04). Excludes the caller.
- If `groupId` given (caller must be member): excludes users already active in that group.
- Max 10 results.

`200`:
```json
{ "items": [ { "userId": 9, "name": "Priya Sharma", "email": "priya@example.com" } ] }
```
Email is shown to tell apart users with the same name.

---

## 6. Dashboard

### D1. `GET /api/dashboard`
`200`:
```json
{
  "totals": { "youOwePaise": 35000, "owedToYouPaise": 120000, "netPaise": 85000 },
  "groups": [ { "groupId": 3, "name": "Trip Goa", "netPaise": -35000, "memberCount": 3 } ],
  "recentActivity": [ { "id": 101, "groupId": 3, "groupName": "Trip Goa", "type": "expense_created",
                        "summary": "Priya added 'Dinner' ₹1,200.00", "createdAt": "…" } ]
}
```
`recentActivity`: latest 10 across my groups (FR-DSH-01).

---

## 7. Groups & Membership

### G1. `GET /api/groups`
`200` → `{ "items": [ { "groupId", "name", "description", "myRole", "memberCount", "myNetPaise", "updatedAt" } ] }` — active memberships only, newest activity first.

### G2. `POST /api/groups`
```json
{ "name": "Trip Goa", "description": "Dec 2026", "memberUserIds": [9, 11] }
```
Rules: name 1–60, description ≤ 200 (S-2); `memberUserIds` ≥ 1 distinct active users, not the caller (FR-GRP-02).
Caller becomes `admin`. Each added user notified (`added_to_group`).

`201` → `Group` (as G3) · `400 GROUP_MIN_MEMBERS` · `400 USER_NOT_ELIGIBLE` (`details.userIds`)

### G3. `GET /api/groups/:groupId`
`200`:
```json
{
  "groupId": 3, "name": "Trip Goa", "description": "Dec 2026",
  "createdAt": "…", "updatedAt": "…",
  "me": { "membershipId": 12, "role": "admin", "netPaise": -35000 },
  "members": [ { "membershipId": 12, "userId": 7, "name": "Karan", "role": "admin", "status": "active",
                 "joinedAt": "…", "endedAt": null, "netPaise": -35000 } ],
  "pastMembers": [ { "membershipId": 15, "userId": 8, "name": "Ravi", "status": "left", "endedAt": "…" } ]
}
```

### G4. `PATCH /api/groups/:groupId`
```json
{ "name": "Goa Trip 2026", "description": null }
```
Any member (FR-GRP-08). At least one field. `200` → `Group`. Activity `group_updated`.

### G5. `DELETE /api/groups/:groupId?confirm=true`
Admin only. If any non-zero balance and no `confirm` → `409 CONFIRMATION_REQUIRED` (`GROUP_HAS_BALANCES`). On success, all members notified (`group_deleted`), group hard-deleted. `204` · `403 FORBIDDEN`

### M1. `POST /api/groups/:groupId/members`
```json
{ "userId": 9 }
```
Admin only. `201` → `MemberRef` + role · `409 ALREADY_MEMBER` · `400 USER_NOT_ELIGIBLE`. Notification `added_to_group`.

### M2. `DELETE /api/groups/:groupId/members/:membershipId`
Admin only.
`204` · `409 CANNOT_REMOVE_SELF` (FR-GRP-20) · `409 BALANCE_NOT_ZERO` (`details.netPaise`) · `404` if not an active member. Notification `removed_from_group`.

### M3. `POST /api/groups/:groupId/leave`
Body depends on role.

**Member:**
```json
{}
```
`204` · `409 BALANCE_NOT_ZERO` (FR-GRP-09)

**Admin** — must pick an option (FR-GRP-16):
```json
{ "mode": "transfer", "newAdminMembershipId": 14 }
```
```json
{ "mode": "delete", "confirm": true }
```
| Case | Result |
|---|---|
| No `mode` | `409 ADMIN_MUST_CHOOSE` |
| `transfer`, admin net ≠ 0 | `409 BALANCE_NOT_ZERO` |
| `transfer`, target not an active member / is self | `400 INVALID_NEW_ADMIN` |
| `transfer` ok | New admin set, old admin `left`; all members notified (`admin_transferred`) → `204` |
| `delete`, no `confirm` | `409 CONFIRMATION_REQUIRED` (`GROUP_HAS_BALANCES` if any, else `reason: "GROUP_DELETE"`) |
| `delete` with `confirm` | Same as G5 → `204` |

Note: admin-leave-and-delete **always** needs confirmation because all data is destroyed for everyone (FR-GRP-18).

---

## 8. Balances

### B1. `GET /api/groups/:groupId/balances`
`200`:
```json
{
  "pairs": [
    { "from": MemberRef, "to": MemberRef, "amountPaise": 7000 }
  ],
  "me": {
    "netPaise": -2000,
    "youOwe":     [ { "to": MemberRef,   "amountPaise": 7000 } ],
    "owesYou":    [ { "from": MemberRef, "amountPaise": 5000 } ]
  }
}
```
`from` owes `to`. Netted per pair, no multi-party simplification (FR-BAL-01/02). Zero pairs omitted. Prefill for "Settle up" (FR-STL-08) uses `me.youOwe[].amountPaise` / `me.owesYou[]`.

### B2. `GET /api/groups/:groupId/balances/breakdown?a=12&b=14`
Records between two memberships that make up their balance (FR-BAL-05).
```json
{
  "netPaise": 7000, "from": MemberRef, "to": MemberRef,
  "items": [
    { "kind": "expense", "id": 41, "date": "2026-09-30", "description": "Dinner",
      "paidBy": MemberRef, "effectPaise": 10000 },
    { "kind": "settlement", "id": 5, "date": "2026-09-30", "note": "UPI",
      "paidBy": MemberRef, "effectPaise": -3000 }
  ]
}
```
`effectPaise` is the change to "`from` owes `to`". Sorted by date desc.

---

## 9. Expenses

### Expense body (E2 create, E4 edit)
```json
{
  "description": "Dinner at Thalassa",
  "notes": "Includes tip",
  "amountPaise": 120000,
  "expenseDate": "2026-09-30",
  "payerMembershipId": 12,
  "splitMethod": "percentage",
  "participants": [
    { "membershipId": 12, "valueBp": 5000 },
    { "membershipId": 14, "valueBp": 2500 },
    { "membershipId": 15, "valueBp": 2500 }
  ],
  "confirm": false
}
```
| `splitMethod` | Participant value | Rule |
|---|---|---|
| `equal` | none | Remainder to payer if participant, else first participant (FR-SPL-01) |
| `exact` | `valuePaise` > 0 | Σ must equal `amountPaise` (FR-SPL-02) |
| `percentage` | `valueBp` 1–10000 | Σ must equal 10000; rupee remainder as `equal` (FR-SPL-03) |

Array order = `position` (decides "first participant"). Participants distinct, ≥ 1. A participant at 0 must simply be omitted (FR-SPL-04). Server recomputes shares with the shared split engine; client preview uses the same engine.

**Validation errors (400):** `VALIDATION_ERROR` (lengths, formats) · `FUTURE_DATE` · `SPLIT_SUM_MISMATCH` (`details.differencePaise`) · `PERCENT_SUM_MISMATCH` (`details.differenceBp`)
**State errors (409):** `PAYER_NOT_ACTIVE` · `PARTICIPANT_NOT_ACTIVE` (`details.membershipIds`)

### Expense object
```json
{
  "expenseId": 41, "groupId": 3,
  "description": "Dinner at Thalassa", "notes": "Includes tip",
  "amountPaise": 120000, "expenseDate": "2026-09-30", "splitMethod": "percentage",
  "payer": MemberRef, "createdBy": MemberRef,
  "shares": [ Share ],
  "myShare": { "sharePaise": 60000 },
  "status": "active",
  "createdAt": "…", "updatedAt": "…", "updatedBy": MemberRef,
  "permissions": { "canEdit": true, "canDelete": true, "frozenReason": null }
}
```
`frozenReason`: `"INVOLVES_DEPARTED_MEMBER"` when payer or any participant is no longer active (FR-EXP-16) — UI disables edit/delete and shows why.

### E1. `GET /api/groups/:groupId/expenses`
Query: `q` (matches description or notes, 1–100 chars), `date` (`YYYY-MM-DD`), `amountPaise`, `page`, `pageSize` (FR-EXP-13).
`200` → paginated list of Expense objects **without** `shares` (list rows include `myShare`). Sorted by `expenseDate` desc, then newest. Active expenses only; deleted ones appear in activity/history.

### E2. `POST /api/groups/:groupId/expenses`
Any member. `201` → Expense. Writes change record + activity + notifications to payer and participants except caller (ADR-007).

### E3. `GET /api/groups/:groupId/expenses/:expenseId`
`200` → Expense with shares. Deleted expenses are returned too (`status: "deleted"`) so history links work.

### E4. `PUT /api/groups/:groupId/expenses/:expenseId`
Full replacement of editable fields (same body as create). Participants may be added (active members only) or removed (FR-EXP-08); payer may change to any active member.

| Check | Result |
|---|---|
| Caller not creator and not admin | `403 FORBIDDEN` (FR-EXP-06) |
| Expense deleted | `409 EXPENSE_DELETED` |
| Current payer or any current participant not active | `409 INVOLVES_DEPARTED_MEMBER` (FR-EXP-16) |
| `splitMethod` differs from stored | `400 SPLIT_METHOD_LOCKED` (FR-EXP-07) |
| Settlement between payer and any participant since creation, no `confirm` | `409 CONFIRMATION_REQUIRED` (`SETTLEMENT_EXISTS`) (FR-EXP-09) |
| New participant or payer not an active member | `409 PARTICIPANT_NOT_ACTIVE` / `PAYER_NOT_ACTIVE` |
| OK | `200` → Expense. Last write wins (FR-EXP-12); change record stores before/after |

### E5. `DELETE /api/groups/:groupId/expenses/:expenseId`
Creator or admin. Soft delete (FR-EXP-10).
`204` · `403 FORBIDDEN` · `409 INVOLVES_DEPARTED_MEMBER` · `409 EXPENSE_DELETED`

### E6. `GET /api/groups/:groupId/expenses/:expenseId/history`
`200`:
```json
{ "items": [
  { "id": 301, "action": "updated", "actor": MemberRef, "createdAt": "…",
    "before": { "amountPaise": 100000, "shares": [ … ] },
    "after":  { "amountPaise": 120000, "shares": [ … ] } }
] }
```
Oldest first; full list (expected small).

---

## 10. Settlements

### Settlement body (S2 create, S4 edit)
```json
{
  "fromMembershipId": 14,
  "toMembershipId": 12,
  "amountPaise": 35000,
  "settlementDate": "2026-10-01",
  "note": "UPI",
  "confirm": false
}
```
Rules: from ≠ to, both active members; amount > 0; date not future; note ≤ 200 (S-3). Caller must be `from` or `to` (FR-STL-01).

### Settlement object
```json
{
  "settlementId": 5, "groupId": 3,
  "from": MemberRef, "to": MemberRef,
  "amountPaise": 35000, "settlementDate": "2026-10-01", "note": "UPI",
  "recordedBy": MemberRef, "status": "active",
  "createdAt": "…", "updatedAt": "…", "updatedBy": MemberRef,
  "permissions": { "canEdit": true, "canDelete": true, "frozenReason": null }
}
```

### S1. `GET /api/groups/:groupId/settlements`
Paginated, active only, `settlementDate` desc (FR-STL-07).

### S2. `POST /api/groups/:groupId/settlements`
`201` → Settlement. Other party notified (FR-STL-04).
Errors: `403 NOT_SETTLEMENT_PARTY` · `400 SAME_PARTY` · `400 FUTURE_DATE` · `409 PARTICIPANT_NOT_ACTIVE` · `409 CONFIRMATION_REQUIRED` (`OVERPAYMENT`, when amount > what `from` currently owes `to`; FR-STL-03).
Duplicates are not detected (FR-STL-06).

### S3. `GET /api/groups/:groupId/settlements/:settlementId`
`200` → Settlement (incl. deleted).

### S4. `PUT /api/groups/:groupId/settlements/:settlementId`
Either party (FR-STL-05). Same checks as S2, plus `409 INVOLVES_DEPARTED_MEMBER` (FR-STL-09), `409 SETTLEMENT_DELETED`. Over-payment check uses the balance **excluding** this settlement. `200` → Settlement.

### S5. `DELETE /api/groups/:groupId/settlements/:settlementId`
Either party. Soft delete. `204` · `403 NOT_SETTLEMENT_PARTY` · `409 INVOLVES_DEPARTED_MEMBER`

### S6. `GET /api/groups/:groupId/settlements/:settlementId/history`
Same shape as E6.

---

## 11. Activity, Notifications, Reports

### AC1. `GET /api/groups/:groupId/activity`
Paginated, newest first (FR-ACT-01).
```json
{ "items": [ { "id": 101, "type": "expense_updated", "actor": MemberRef,
               "subject": { "type": "expense", "id": 41 },
               "summary": "Karan edited 'Dinner' ₹1,000.00 → ₹1,200.00", "createdAt": "…" } ],
  "page": 1, "pageSize": 20, "total": 57 }
```

### N1. `GET /api/notifications`
Paginated, newest first. Optional `unreadOnly=true`.
```json
{ "items": [ { "notificationId": 900, "type": "expense_created", "message": "Priya added 'Dinner' — your share ₹400.00",
               "groupId": 3, "groupName": "Trip Goa",
               "link": { "type": "expense", "groupId": 3, "id": 41 },
               "read": false, "createdAt": "…" } ],
  "page": 1, "pageSize": 20, "total": 12 }
```
`link` is `null` when the group was deleted — UI shows "Group deleted" (FR-NTF-05).

### N2. `GET /api/notifications/unread-count`
`200` → `{ "count": 3 }`. Polled every 60 s while tab visible (ADR-008).

### N3. `POST /api/notifications/:notificationId/read`
`204`. Only the recipient; others get `404`.

### N4. `POST /api/notifications/read-all`
`204`.

### R1. `GET /api/reports?period=week&date=2026-10-01&groupId=3`
| Param | Rule |
|---|---|
| `period` | `week` (Mon–Sun) or `month` — required |
| `date` | Any date inside the wanted period, default today (IST). Previous periods = earlier date (FR-RPT-02) |
| `groupId` | Optional; default all my groups (FR-RPT-03). Must be a group I'm a member of |

`200`:
```json
{
  "period": { "type": "week", "from": "2026-09-28", "to": "2026-10-04", "label": "28 Sep – 4 Oct 2026" },
  "groupId": null,
  "totals": { "paidPaise": 150000, "mySharePaise": 95000,
              "settlementsPaidPaise": 35000, "settlementsReceivedPaise": 0 },
  "expenses": [ { "date": "2026-09-30", "groupId": 3, "groupName": "Trip Goa", "description": "Dinner",
                  "payer": MemberRef, "amountPaise": 120000, "mySharePaise": 60000, "splitMethod": "percentage" } ],
  "settlements": [ { "date": "2026-10-01", "groupId": 3, "groupName": "Trip Goa",
                     "from": MemberRef, "to": MemberRef, "amountPaise": 35000, "note": "UPI" } ]
}
```
Includes expenses where I am payer or participant (FR-RPT-01, FR-SPL-05). Grouped by expense/settlement date (FR-RPT-05). Settlements listed separately (FR-RPT-04).

### R2. `GET /api/reports/csv?period=week&date=2026-10-01&groupId=3`
Same params. Response:
```
Content-Type: text/csv; charset=utf-8
Content-Disposition: attachment; filename="report-week-2026-09-28.csv"
```
```csv
Date,Group,Type,Description,Payer,Total Amount (INR),My Share (INR),Split Method
2026-09-30,Trip Goa,expense,"Dinner, with tip",Priya,1200.00,600.00,percentage
2026-10-01,Trip Goa,settlement,UPI,Karan,350.00,,
```
Amounts in rupees with 2 decimals. Fields escaped per RFC 4180 (FR-RPT-07). Fields starting with `=`, `+`, `-`, `@` are prefixed with `'` (spreadsheet formula injection guard). UTF-8 with BOM so Excel shows ₹ and names correctly. Client downloads via browser navigation / blob.

### H1. `GET /api/health`
`200` → `{ "status": "ok", "db": "ok" }` · `503` if DB unreadable.

### X1 — removed in v1.3
No mailer, so no dev outbox.

---

## 12. Error Code Catalog

| Code | HTTP | Meaning | `details` |
|---|---|---|---|
| `VALIDATION_ERROR` | 400 | Shape/format/length invalid | `fieldErrors` |
| `FUTURE_DATE` | 400 | Date after today (IST) | — |
| `SPLIT_SUM_MISMATCH` | 400 | Exact amounts ≠ total | `differencePaise` |
| `PERCENT_SUM_MISMATCH` | 400 | Percentages ≠ 100 | `differenceBp` |
| `SPLIT_METHOD_LOCKED` | 400 | Split method changed on edit | — |
| `GROUP_MIN_MEMBERS` | 400 | Group needs ≥ 2 members at creation | — |
| `USER_NOT_ELIGIBLE` | 400 | User deleted, unknown, or self | `userIds` |
| `INVALID_NEW_ADMIN` | 400 | Transfer target invalid | — |
| `SAME_PARTY` | 400 | Settlement from = to | — |
| `WRONG_PASSWORD` | 400 | Current password wrong on change | — |
| `UNAUTHENTICATED` | 401 | No/expired session | — |
| `INVALID_CREDENTIALS` | 401 | Login failed | — |
| `FORBIDDEN` | 403 | Role not allowed / bad Origin | — |
| `NOT_SETTLEMENT_PARTY` | 403 | Caller isn't from/to | — |
| `NOT_FOUND` | 404 | Missing or not visible to caller | — |
| `EMAIL_ALREADY_REGISTERED` | 409 | Verified password account exists | — |
| `NO_PASSWORD_METHOD` | 409 | Google-only account changing password | — |
| `ALREADY_MEMBER` | 409 | User already active in group | — |
| `BALANCE_NOT_ZERO` | 409 | Leave/remove/transfer/delete-account blocked | `netPaise` or `groups[]` |
| `CANNOT_REMOVE_SELF` | 409 | Admin removing self | — |
| `ADMIN_MUST_CHOOSE` | 409 | Admin leave without mode | — |
| `PAYER_NOT_ACTIVE` | 409 | Payer not an active member | — |
| `PARTICIPANT_NOT_ACTIVE` | 409 | Participant/party not active | `membershipIds` |
| `INVOLVES_DEPARTED_MEMBER` | 409 | Edit/delete frozen record | `membershipIds` |
| `EXPENSE_DELETED` / `SETTLEMENT_DELETED` | 409 | Editing a deleted record | — |
| `CONFIRMATION_REQUIRED` | 409 | Warning needs confirm (§1.3) | `reason`, extra data |
| `RATE_LIMITED` | 429 | Too many auth attempts | `retryAfterSeconds` |
| `INTERNAL` | 500 | Unexpected error | — |

Client maps each code to a user-facing message; `message` from server is a safe fallback.

---

## 13. Permission Matrix

| Action | Admin | Member | Expense creator | Settlement party | Past member / non-member |
|---|---|---|---|---|---|
| View group, expenses, balances, activity | ✅ | ✅ | ✅ | ✅ | ❌ 404 |
| Edit group name/description | ✅ | ✅ | | | ❌ |
| Add member | ✅ | ❌ | | | ❌ |
| Remove member (not self) | ✅ | ❌ | | | ❌ |
| Leave | admin flow | ✅ (zero balance) | | | — |
| Delete group | ✅ | ❌ | | | ❌ |
| Add expense | ✅ | ✅ | | | ❌ |
| Edit / delete expense | ✅ | ❌ | ✅ | | ❌ |
| Record settlement | if party | if party | | ✅ | ❌ |
| Edit / delete settlement | if party | if party | | ✅ | ❌ |

All edit/delete actions additionally blocked when a departed member is involved (FR-EXP-16, FR-STL-09).

---

## 14. Requirement Traceability (summary)

| Area | Requirements | Endpoints |
|---|---|---|
| Auth & account | FR-AUTH-01..08 | A1–A8, P1–P3 |
| Groups & membership | FR-GRP-01..21 | U1, G1–G5, M1–M3 |
| Expenses & splits | FR-EXP-01..16, FR-SPL-01..07 | E1–E6 |
| Balances | FR-BAL-01..05 | B1, B2, D1 |
| Settlements | FR-STL-01..09 | S1–S6 (prefill via B1) |
| Notifications | FR-NTF-01..05 | N1–N4 |
| Activity | FR-ACT-01 | AC1, D1 |
| Reports | FR-RPT-01..07 | R1, R2 |
| Dashboard | FR-DSH-01 | D1 |

---

## 15. Resolved Questions

Confirmed by product owner 2026-10-01.

| # | Question | Decision |
|---|---|---|
| API-1 | Password rule | 8–128 characters, no other rules (A1, P2) |
| API-2 | Add participants on expense edit? | Yes — active members only; removed ones may be dropped (E4) |
| API-3 | Auto-login after email verification | Superseded in v1.3: signup itself logs in (A1) |
| API-4 | Email shown in user search | Yes (U1) |
| API-5 | Payer changeable on edit | Yes, to any active member (E4) |
| API-6 | Default page size | 20, max 100 (§1) |
