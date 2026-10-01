# SplitBook — Requirements (v1)

Status: **FROZEN v1.2** · Last updated: 2026-10-01

Changes after freeze require explicit sign-off and a version bump.

## 1. Problem & Goal

People sharing expenses struggle to track who paid for what, how costs should be divided fairly, and who owes whom.

Goal: a web application where groups of registered users record shared expenses, see individual obligations, and record settlements without manual calculation.

## 2. Scope Summary

### In scope (v1)
- Registration and login (email + password, Google)
- Groups with an admin (creator) and members
- Expenses inside groups, single payer
- Split methods: equal, exact amount, percentage
- Per-group and overall balances with pairwise netting
- Recording settlements (payments happen outside the app), partial settlements allowed
- Expense and settlement edit history (audit trail)
- In-app notifications
- Per-user weekly and monthly reports with CSV export
- Desktop web only

### Out of scope (v1)
- Forgot / reset password
- Non-group (1-to-1) expenses
- Multiple payers on one expense
- Receipt uploads
- Recurring expenses
- Categories
- Multi-currency (INR only)
- Payment integration (UPI, gateway)
- Debt simplification across the group (multi-party graph optimization)
- Email / SMS / push notifications
- Min/max amount limits (other than amount > 0)
- Custom report date ranges
- Mobile / responsive layout
- Accessibility compliance
- Changing a user's email
- AI features
- Localization (English only)

## 3. Actors

| Actor | Description |
|---|---|
| Visitor | Not logged in. Can register or log in. |
| User | Registered, verified, logged-in user. |
| Group member | User who belongs to a group. |
| Group admin | User who created the group. Exactly one per group. |

## 4. Functional Requirements

### 4.1 Authentication & Account

| ID | Requirement |
|---|---|
| FR-AUTH-01 | A visitor can register with name, email, and password (8–128 characters, no other rules). |
| FR-AUTH-02 | A visitor can register / log in with Google. |
| FR-AUTH-03 | Email must be verified before the user can be found and added to groups. Google sign-in counts as verified. |
| FR-AUTH-04 | One account per email. If the same email is used for both password and Google sign-in, both methods log in to the same account. A password is linked to an existing account only after the email is verified. |
| FR-AUTH-05 | A user can log out of the current device. |
| FR-AUTH-06 | From the profile menu, a user can edit their display name and change their password (password-method users only). |
| FR-AUTH-07 | Email address cannot be changed in v1. |
| FR-AUTH-08 | A user can delete their account only when all their balances, in every group, are zero. Otherwise deletion is blocked with a message listing the outstanding balances. |

### 4.2 Groups & Membership

| ID | Requirement |
|---|---|
| FR-GRP-01 | A user can create a group with a name (required) and description (optional). The creator becomes the group admin. |
| FR-GRP-02 | Creating a group requires at least 2 members (admin + at least 1 other). After creation, the group may drop to 1 member (e.g. others leave). |
| FR-GRP-03 | Group names need not be unique. |
| FR-GRP-04 | The admin adds members by searching registered, verified users by name. Unregistered or unverified users do not appear in search. |
| FR-GRP-05 | A user is added directly (no accept step) and receives an in-app notification. |
| FR-GRP-06 | A user already in the group cannot be added again. |
| FR-GRP-07 | No limit on number of groups per user or members per group in v1. |
| FR-GRP-08 | Any member can edit the group name and description. |
| FR-GRP-09 | A member can leave a group only when their balance in that group is zero. |
| FR-GRP-10 | The admin can remove a member only when that member's balance in the group is zero. |
| FR-GRP-11 | A member who left or was removed still appears by name on past expenses, marked as "(left)". |
| FR-GRP-12 | A user re-added after leaving is treated as a new member; previous membership history is not reconnected. |
| FR-GRP-13 | The admin can delete a group. If any balance in the group is non-zero, a warning is shown before confirming. |
| FR-GRP-14 | All members can see all expenses, settlements, balances, and activity of the group. |
| FR-GRP-15 | A user sees only data from groups they belong to. |
| FR-GRP-16 | When the admin chooses to leave, a warning dialog offers two options: **(a) Make another member admin, then leave**, or **(b) Leave and delete the group**. |
| FR-GRP-17 | Option (a): admin selects a current member as new admin. The leaving rule FR-GRP-09 still applies (outgoing admin's balance must be zero). New admin and all members are notified. |
| FR-GRP-18 | Option (b): the group and all its data (expenses, settlements, balances, history, activity) are deleted for all members. The warning states this explicitly, including any non-zero balances. All members are notified. |
| FR-GRP-19 | Admin role can be transferred only through the leave flow (FR-GRP-16). No standalone transfer in v1. |
| FR-GRP-20 | The admin cannot remove themselves; they must use the admin-leave flow (FR-GRP-16). |
| FR-GRP-21 | A group that drops to a single member stays fully usable (e.g. self-only expenses). |

### 4.3 Expenses

| ID | Requirement |
|---|---|
| FR-EXP-01 | Any member can add an expense with: description (required), amount (required, > 0, max 2 decimals), date (required), payer (required), participants (required), split method (required), notes (optional). |
| FR-EXP-02 | Payer must be a current member of the group. If the real payer is not a member, they must be added to the group first (by the admin) before the expense can be recorded. |
| FR-EXP-03 | Payer need not be a participant (paid on behalf of others). |
| FR-EXP-04 | Expense date can be today or in the past. Future dates are blocked. |
| FR-EXP-05 | Currency is INR, amounts shown with 2 decimal places. |
| FR-EXP-06 | Expense creator or group admin can edit or delete an expense. |
| FR-EXP-07 | On edit, the split method cannot be changed. |
| FR-EXP-08 | On edit, participants can be removed or added (active members only), and the payer can be changed to any active member; shares are recalculated per the split method rules (section 4.4). |
| FR-EXP-09 | Editing is always allowed (subject to FR-EXP-06/07). If any settlement has been recorded between the payer and any participant since the expense was created, a warning is shown that balances will change and may reopen settled amounts. User confirms to save. |
| FR-EXP-10 | Delete is a soft delete: the expense no longer counts in balances or reports but remains visible in activity/history. |
| FR-EXP-11 | Every create, edit, and delete is recorded in the expense history with who did it, when, and the old vs new values. All group members can view it. |
| FR-EXP-12 | Concurrent edits: last write wins. Both changes remain visible in history. |
| FR-EXP-13 | Expense list supports search by description/notes text, date, and amount, with pagination. |
| FR-EXP-14 | Description max 100 characters. Truncated at 40 characters with "..." in list views; shown in full on the detail view. Notes max 500 characters. |
| FR-EXP-15 | A user can view expense detail: all fields, each participant's share, and history. |
| FR-EXP-16 | An expense cannot be edited or deleted if its payer or any participant is no longer an active member (left or removed). |

### 4.4 Split Rules

| ID | Requirement |
|---|---|
| FR-SPL-01 | **Equal:** amount divided equally among participants, rounded to 2 decimals. Any rounding remainder is absorbed by the payer's share if the payer is a participant; otherwise by the first participant in the list. |
| FR-SPL-02 | **Exact amount:** each participant's amount is entered. The sum must equal the total exactly; otherwise saving is blocked. |
| FR-SPL-03 | **Percentage:** each participant's percentage is entered; decimals allowed. Percentages must sum to exactly 100. Rupee rounding remainder follows the same rule as FR-SPL-01. |
| FR-SPL-07 | When removing a participant on edit with exact or percentage split, the user re-enters the remaining shares so they satisfy FR-SPL-02 / FR-SPL-03. Equal split recalculates automatically. |
| FR-SPL-04 | A participant with ₹0 or 0% share is treated as not participating. |
| FR-SPL-05 | An expense where the only participant is the payer is allowed. It affects no balance but counts in that user's spending reports. |
| FR-SPL-06 | While entering an exact or percentage split, the UI shows the remaining amount or percentage still to be assigned. |

### 4.5 Balances

| ID | Requirement |
|---|---|
| FR-BAL-01 | Per group, show pairwise balances netted per pair: if A owes B ₹100 and B owes A ₹40, show "A owes B ₹60". |
| FR-BAL-02 | No multi-party simplification (A→B→C is not reduced to A→C). |
| FR-BAL-03 | Per group, each user sees "you owe" and "owes you" lists and their net position. |
| FR-BAL-04 | Overall dashboard shows the user's total owed and total owing across all groups. |
| FR-BAL-05 | A user can drill into a balance to see the expenses and settlements behind it. |

### 4.6 Settlements

| ID | Requirement |
|---|---|
| FR-STL-01 | Either party (payer or receiver) can record a settlement in a group: from, to, amount (> 0), date, free-text note (e.g. "UPI", "cash"). |
| FR-STL-02 | Partial settlements are allowed. |
| FR-STL-03 | If the amount exceeds what is owed, a warning is shown; the user can still save. The balance then reverses direction. |
| FR-STL-04 | No confirmation from the other party is required. The other party receives an in-app notification. |
| FR-STL-05 | Either party can edit or delete a settlement. Delete is soft and recorded in history. |
| FR-STL-06 | Duplicate settlements are not detected automatically; users correct them by deleting. |
| FR-STL-07 | Settlement history is viewable per group. |
| FR-STL-08 | "Settle up" can prefill the full outstanding amount between two users. |
| FR-STL-09 | A settlement cannot be edited or deleted if either party is no longer an active member (left or removed). |

### 4.7 Notifications (in-app)

| ID | Requirement |
|---|---|
| FR-NTF-01 | Notify a user when: added to a group, removed from a group, an expense involving them is added/edited/deleted, a settlement involving them is recorded/edited/deleted. |
| FR-NTF-02 | Notifications have read/unread state; the user can mark one or all as read. |
| FR-NTF-03 | Clicking a notification opens the related group, expense, or settlement. |
| FR-NTF-04 | Unread count is visible in the main navigation. |
| FR-NTF-05 | Notification history is kept even after the related group is deleted; the link is disabled and shows "Group deleted". |

### 4.8 Activity Feed

| ID | Requirement |
|---|---|
| FR-ACT-01 | Each group has an activity feed of all actions: member added/removed/left, group edited, expense added/edited/deleted, settlement added/edited/deleted. |

### 4.9 Reports

| ID | Requirement |
|---|---|
| FR-RPT-01 | Reports are per user: amount the user paid and amount the user owes (their share), for a period. |
| FR-RPT-02 | Periods: fixed calendar week (Monday–Sunday) and fixed calendar month. User can navigate to previous periods. |
| FR-RPT-03 | Reports show all groups combined by default, with a filter to select a single group. |
| FR-RPT-04 | Settlements are included in reports, shown separately from expenses. |
| FR-RPT-05 | Expenses are assigned to a period by expense date, not creation date. |
| FR-RPT-06 | The user can download the current report as CSV. Columns: date, group, description, payer, total amount, user's share, split method, type (expense/settlement). |
| FR-RPT-07 | CSV values are escaped correctly (commas, quotes, line breaks). |

### 4.10 Dashboard

| ID | Requirement |
|---|---|
| FR-DSH-01 | After login, the user sees: total they owe, total owed to them, list of their groups with net balance each, recent activity. |

## 5. Non-Functional Requirements

| ID | Requirement |
|---|---|
| NFR-01 | Small-to-medium production-ready application. |
| NFR-02 | Desktop web only; minimum supported width 1024px. |
| NFR-03 | Supported browsers: latest Chrome, Edge, Firefox, Safari. |
| NFR-04 | All dates/times shown in IST (GMT+5:30), 24-hour format. |
| NFR-05 | English only. |
| NFR-06 | Users can access only data of groups they belong to. |
| NFR-07 | Money calculations are exact to 2 decimals with no floating-point drift. |
| NFR-08 | Passwords are never stored in plain text. |
| NFR-09 | Data is backed up daily with 30-day retention. |
| NFR-10 | Accessibility compliance not required in v1. |

## 6. Edge Case Rules (consolidated)

| # | Case | Rule |
|---|---|---|
| E1 | ₹100 split equally among 3 | 33.33 / 33.33 / 33.34 — payer absorbs ₹0.01 |
| E1a | Same, payer not a participant | First participant in list absorbs ₹0.01 |
| E2 | Percent shares produce rupee rounding mismatch | Same rule as E1 / E1a |
| E3 | Exact amounts sum < total | Blocked |
| E4 | Exact amounts sum > total | Blocked |
| E5 | Percent total ≠ 100 | Blocked |
| E6 | Participant with ₹0 / 0% | Treated as non-participant |
| E7 | Payer is the only participant | Allowed; counts in reports, no balance effect |
| E8 | Edit expense after settlement between its parties | Allowed with warning |
| E9 | Change split method on edit | Blocked |
| E10 | Remove participant on edit | Allowed; shares recalculated |
| E11 | Two users edit the same expense | Last write wins; both in history |
| E12 | Settlement exceeds owed | Warn, allow; balance reverses |
| E13 | Settlement amount ≤ 0 | Blocked |
| E14 | Duplicate settlement | No detection; delete manually |
| E15 | Member leaves/removed with non-zero balance | Blocked |
| E16 | Account deletion with non-zero balance | Blocked |
| E17 | Group delete with non-zero balances | Warning, then allowed |
| E18 | Removed user re-added | Treated as new member |
| E19 | Add existing member again | Blocked |
| E20 | Group with 1 member | Not allowed at creation; allowed later |
| E20a | Admin leaves | Warning: transfer admin then leave (balance must be 0), or leave and delete whole group |
| E20b | Payer not in group | Must be added to group first |
| E21 | Same email via Google and password | Single merged account |
| E22 | Unverified user | Not searchable, cannot be added |
| E23 | Future-dated expense | Blocked |
| E24 | Long description | Max 100 chars; truncated at 40 with "..." in lists |
| E25 | Special characters in CSV | Escaped |
| E26 | Expense added to a past week/month | Past report updates; expected |
| E27 | Edit/delete expense or settlement involving a member who left | Blocked |
| E28 | Admin tries to remove self | Blocked; use admin-leave flow |
| E29 | Group deleted; user opens old notification | History kept; link disabled |

## 7. Decision Log (resolved at freeze)

| # | Topic | Decision |
|---|---|---|
| D-1 | Admin leaving | Warning dialog: transfer admin then leave, or leave and delete the entire group (FR-GRP-16..19). |
| D-2 | Payer not in group | Payer must be a group member first (FR-EXP-02). |
| D-3 | Editing after settlement | No lock; edit allowed with warning (FR-EXP-09). |
| D-4 | Rounding remainder, payer not participant | First participant in list absorbs (FR-SPL-01). |
| D-5 | Exact split sum ≠ total | Blocked (FR-SPL-02). Changed in v1.1: previously payer absorbed a shortfall. |
| D-6 | Description / notes length | 100 chars, truncated at 40 in lists; notes 500 (FR-EXP-14). |
| D-7 | Report scope | All groups by default with group filter (FR-RPT-03). |
| D-8 | Group size | ≥2 at creation; may drop to 1 later (FR-GRP-02). |
| D-9 | No forgot-password flow | Risk accepted for v1: password users who forget their password are locked out unless they sign in with Google on same email. |
| D-10 | Removing participant on edit (exact/%) | User re-enters remaining shares (FR-SPL-07). Adopted proposed default. |
| D-11 | Backups | Daily, 30-day retention (NFR-09). Adopted proposed default. |
| D-12 | Logout | Current device only (FR-AUTH-05). |
| D-13 | Records involving departed members (v1.1) | Edit/delete blocked (FR-EXP-16, FR-STL-09). |
| D-14 | Admin self-removal (v1.1) | Not allowed; admin-leave flow only (FR-GRP-20). |
| D-15 | Single-member group (v1.1) | Fully usable, e.g. "Trip Goa" where everyone left but Karan (FR-GRP-21). |
| D-16 | Notifications after group deletion (v1.1) | History kept, link disabled (FR-NTF-05). |
| D-17 | Password linking to existing Google account (v1.1) | Only after email verification (FR-AUTH-04). |

### Change log
- **v1.2 (2026-10-01):** From API review: FR-EXP-08 allows adding participants and changing payer on edit; FR-AUTH-01 password rule 8–128 chars.
- **v1.1 (2026-10-01):** Domain-modeling findings DF-1..DF-6 applied. FR-SPL-02 changed (exact split must equal total). Added FR-GRP-20/21, FR-EXP-16, FR-STL-09, FR-NTF-05, E27–E29, D-13..D-17. FR-AUTH-04 clarified.
- **v1.0 (2026-10-01):** Initial freeze.

## 8. Future Considerations (TODO)

- [ ] Better rounding-remainder rule when payer is not a participant (currently: first participant absorbs).
- [ ] Forgot / reset password.
- [ ] Non-group expenses, multiple payers, categories, receipts, recurring expenses.
- [ ] Group-wide debt simplification.
- [ ] Email / SMS / push notifications.
- [ ] Standalone admin transfer (outside leave flow).
- [ ] Mobile / responsive layout.
- [ ] AI features.
