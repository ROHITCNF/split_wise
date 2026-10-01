# SplitBook — UI Wireframes (v1)

Status: **Accepted** · 2026-10-01 · Inputs: REQUIREMENTS.md v1.2, ARCHITECTURE.md §6.1, API_CONTRACT.md (accepted)

Low-fidelity, desktop-only (≥ 1024 px, NFR-02). Boxes show layout and content, not visual style. Built from shadcn/ui primitives (ADR-015). Each screen lists the API endpoints it calls (API_CONTRACT §2) and the requirements it covers.

"API client" and "UI primitives" from ARCHITECTURE §6.1 are not screens; the primitives used are listed in §0.4.

---

## 0. Global Conventions

### 0.1 Notation
```
[ Button ]        primary/secondary button        ( ) radio     [x] checkbox
[ text_______ ]   input                           [ Select ▾ ]  dropdown
‹ ›               pager / period nav              ⋯             row actions menu
🔔3               notification bell + count       ⚠             warning     🔒 frozen
```

### 0.2 Display rules
| Item | Rule |
|---|---|
| Money | `₹1,20,000.00` — Indian digit grouping, 2 decimals (`en-IN`) |
| Owe colours | "you owe" = red text · "owes you" = green text · settled = grey "settled up" |
| Dates | `30 Sep 2026`; timestamps `30 Sep 2026, 21:45` IST 24 h (NFR-04) |
| Long text | Description cut at 40 chars + "…" in lists, full on detail (FR-EXP-14) |
| Departed member | `Ravi (left)` / `Ravi (removed)` in muted text (FR-GRP-11) |
| Loading | Skeleton rows in place of content |
| Errors | Inline field errors under inputs; page errors in a red alert with [ Retry ]; success/failure of actions as toast |
| Confirmation | Server `409 CONFIRMATION_REQUIRED` → modal dialog → resend with `confirm: true` (API §1.3) |

### 0.3 Route map
| Route | Screen |
|---|---|
| `/login`, `/signup`, `/verify` | Auth (§2) |
| `/` | Dashboard (§4) |
| `/groups`, `/groups/new` | Group list & create (§5) |
| `/groups/:id/{expenses,balances,settlements,activity,members,settings}` | Group detail tabs (§6–§11) |
| `/groups/:id/expenses/new`, `/groups/:id/expenses/:eid`, `/groups/:id/expenses/:eid/edit` | Expense form / detail (§8, §9) |
| `/notifications` | Notifications (§12) |
| `/reports` | Reports (§13) |
| `/profile` | Profile (§3) |

### 0.4 shadcn/ui primitives used
Button · Input · Textarea · Label · Select · Combobox (Command + Popover) · RadioGroup · Checkbox · Tabs · Table · Card · Badge · Dialog · AlertDialog · DropdownMenu · Popover · Calendar / DatePicker · Toast (Sonner) · Skeleton · Alert · Pagination · Separator · Avatar · Tooltip.

---

## 1. App Shell & Navigation

FR-NTF-04, FR-AUTH-05/06 · API: A8 (on load), N2 (poll 60 s)

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ ◆ SplitBook     Dashboard   Groups   Reports                         🔔3    (KM) Karan ▾│
├──────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                          │
│                              <  page content, max-width 1200 px, centred  >              │
│                                                                                          │
└──────────────────────────────────────────────────────────────────────────────────────────┘

Profile menu (DropdownMenu)          Bell click → Notifications popover (§12.1)
┌──────────────────────┐
│ Karan Mehta          │
│ karan@example.com    │
├──────────────────────┤
│ Profile              │
│ Log out              │
└──────────────────────┘
```

| Behaviour | Detail |
|---|---|
| Auth guard | App start calls A8. `401` → redirect `/login?next=<path>`. Any later `401` (API client) → same |
| Active nav item | Underlined |
| Bell count | N2 every 60 s while tab visible; hidden when 0; "9+" above 9 |
| Log out | A7 → `/login` |
| Product name | SplitBook |

---

## 2. Auth Screens

FR-AUTH-01..04 · API: A1–A6, X1 (dev)

### 2.1 Log in — `/login`
```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                                                                                          │
│                              ┌──────────────────────────────────┐                        │
│                              │  ◆ SplitBook                     │                        │
│                              │  Log in                          │                        │
│                              │                                  │                        │
│                              │  Email                           │                        │
│                              │  [ karan@example.com_________ ]  │                        │
│                              │  Password                        │                        │
│                              │  [ ••••••••__________________ ]  │                        │
│                              │                                  │                        │
│                              │  [          Log in           ]   │                        │
│                              │  ─────────────  or  ──────────── │                        │
│                              │  [  G  Continue with Google   ]  │                        │
│                              │                                  │                        │
│                              │  New here?  Create an account    │                        │
│                              └──────────────────────────────────┘                        │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```
| State | UI |
|---|---|
| `401 INVALID_CREDENTIALS` | Alert in card: "Email or password is incorrect." |
| `403 EMAIL_NOT_VERIFIED` | Alert: "Verify your email first." + link [ Resend verification ] (A3) |
| `429 RATE_LIMITED` | Alert: "Too many attempts. Try again in N seconds." Button disabled |
| `?error=google_failed` | Alert: "Google sign-in failed. Try again." |
| Google button | Full-page navigation to A5 (mock signs in `mock.user@gmail.com`) |
| Success | Go to `next` or `/` |

### 2.2 Sign up — `/signup`
```
                              ┌──────────────────────────────────┐
                              │  Create your account             │
                              │                                  │
                              │  Name                            │
                              │  [ Karan Mehta_______________ ]  │
                              │  Email                           │
                              │  [ karan@example.com_________ ]  │
                              │  Password                        │
                              │  [ ••••••••__________________ ]  │
                              │  8–128 characters                │
                              │                                  │
                              │  [       Create account       ]  │
                              │  ─────────────  or  ──────────── │
                              │  [  G  Continue with Google   ]  │
                              │                                  │
                              │  Have an account?  Log in        │
                              └──────────────────────────────────┘
```
Live validation from shared Zod schema. `409 EMAIL_ALREADY_REGISTERED` → field error under Email + "Log in instead" link.

### 2.3 Check your email (after A1 `202`)
```
                              ┌──────────────────────────────────┐
                              │  ✉  Check your email             │
                              │                                  │
                              │  We sent a verification link to  │
                              │  karan@example.com.              │
                              │  The link is valid for 24 hours. │
                              │                                  │
                              │  [ Resend link ]   Back to login │
                              │                                  │
                              │  ┌ DEV ONLY ──────────────────┐  │
                              │  │ Open dev outbox →          │  │
                              │  └────────────────────────────┘  │
                              └──────────────────────────────────┘
```
"Resend link" → A3, then disabled 60 s. Dev box shown only in non-production; links to a simple list from X1.

### 2.4 Verify email landing — `/verify?token=…`
```
   Verifying…  (spinner)          →   ✅ Email verified. Taking you to your dashboard…
                                   →   ❌ This link is invalid or has expired.
                                        [ Resend verification ]   Back to login
```
Calls A2 on mount. Success logs in (API-3) → `/`.

---

## 3. Profile — `/profile`

FR-AUTH-05..08 · API: A8, P1, P2, P3, A7

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ Profile                                                                                  │
│                                                                                          │
│ ┌ Account ─────────────────────────────────────────────────────────────────────────────┐ │
│ │ Name    [ Karan Mehta_____________________ ]                         [ Save ]        │ │
│ │ Email   karan@example.com            (cannot be changed)                             │ │
│ │ Sign-in methods   [Password] [Google]                                                │ │
│ └──────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                          │
│ ┌ Change password ─────────────────────────────────────────────────────────────────────┐ │
│ │ Current password  [ ••••••••______ ]                                                 │ │
│ │ New password      [ ••••••••______ ]   8–128 characters                              │ │
│ │                                                          [ Change password ]         │ │
│ └──────────────────────────────────────────────────────────────────────────────────────┘ │
│   (Google-only account: card replaced by "You sign in with Google. No password set.")    │
│                                                                                          │
│ ┌ Session ─────────────────────────────────────────────────────────────────────────────┐ │
│ │ Log out of this device.                                              [ Log out ]     │ │
│ └──────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                          │
│ ┌ Danger zone ─────────────────────────────────────────────────────────────────────────┐ │
│ │ Delete account. This cannot be undone.                          [ Delete account ]   │ │
│ └──────────────────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

**Delete account — confirm dialog**
```
┌ Delete your account? ───────────────────────────────┐
│ You will leave all groups. Your name stays on past  │
│ expenses. This cannot be undone.                    │
│                                                     │
│ Type DELETE to confirm  [ ______ ]                  │
│                         [ Cancel ]  [ Delete ]      │
└─────────────────────────────────────────────────────┘
```
**Blocked (`409 BALANCE_NOT_ZERO`)**
```
┌ You can't delete your account yet ──────────────────┐
│ Settle these balances first:                        │
│   Trip Goa      you owe        ₹350.00   [ Open ]   │
│   Flat 302      owes you     ₹1,200.00   [ Open ]   │
│                                       [ Close ]     │
└─────────────────────────────────────────────────────┘
```
`WRONG_PASSWORD` → field error on Current password.

---

## 4. Dashboard — `/`

FR-DSH-01, FR-BAL-04 · API: D1

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ Dashboard                                                         [ + New group ]        │
│                                                                                          │
│ ┌──────────────────────────┐ ┌──────────────────────────┐ ┌──────────────────────────┐   │
│ │ You owe                  │ │ Owed to you              │ │ Net                      │   │
│ │ ₹350.00          (red)   │ │ ₹1,200.00      (green)   │ │ +₹850.00                 │   │
│ └──────────────────────────┘ └──────────────────────────┘ └──────────────────────────┘   │
│                                                                                          │
│ ┌ Your groups ──────────────────────────────────┐ ┌ Recent activity ───────────────────┐ │
│ │ Trip Goa        3 members   you owe ₹350.00 › │ │ Priya added 'Dinner' ₹1,200.00     │ │
│ │ Flat 302        3 members   owes you ₹1,200 › │ │   Trip Goa · 30 Sep, 21:45         │ │
│ │ Office lunch    5 members   settled up      › │ │ Ravi left the group                │ │
│ │                                               │ │   Trip Goa · 29 Sep, 10:02         │ │
│ │                          View all groups →    │ │ You recorded ₹500.00 to Ananya     │ │
│ └───────────────────────────────────────────────┘ │   Flat 302 · 28 Sep, 18:30         │ │
│                                                   └────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```
Empty state (no groups): card "You're not in any groups yet." [ Create your first group ]. Row click → group Expenses tab. Activity row click → that group's Activity tab.

---

## 5. Group List & Create

FR-GRP-01..07 · API: G1, G2, U1

### 5.1 Group list — `/groups`
```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ Groups                                                            [ + New group ]        │
│ ┌──────────────────────────────────────────────────────────────────────────────────────┐ │
│ │ Name             │ Description        │ Members │ My role │ My balance         │      │ │
│ ├──────────────────┼────────────────────┼─────────┼─────────┼────────────────────┼──────┤ │
│ │ Trip Goa         │ Dec 2026           │ 3       │ Admin   │ you owe ₹350.00    │  ›   │ │
│ │ Flat 302         │ Rent & bills       │ 3       │ Member  │ owes you ₹1,200.00 │  ›   │ │
│ │ Office lunch     │ —                  │ 5       │ Member  │ settled up         │  ›   │ │
│ └──────────────────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Create group — `/groups/new`
```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ ← Groups      New group                                                                  │
│                                                                                          │
│ Group name *                                                                             │
│ [ Trip Goa______________________________ ]  8/60                                         │
│ Description                                                                              │
│ [ Dec 2026 beach trip___________________ ]  20/200                                       │
│                                                                                          │
│ Members *  (at least 1 besides you)                                                      │
│ [ 🔍 Search people by name… pri_________ ]                                               │
│   ┌──────────────────────────────────────────┐                                           │
│   │ Priya Sharma     priya@example.com   [+] │   ← U1, verified users only, max 10      │
│   │ Priyanka Rao     priyanka@example.com [+]│                                           │
│   └──────────────────────────────────────────┘                                           │
│                                                                                          │
│ Selected:  (You · Admin)   [Priya Sharma ✕]   [Ravi Kumar ✕]                             │
│                                                                                          │
│                                                     [ Cancel ]   [ Create group ]        │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```
| State | UI |
|---|---|
| Search < 2 chars | Hint "Type at least 2 letters" |
| No results | "No registered user found. They need to sign up and verify their email first." |
| 0 selected | Create disabled; helper "Add at least one member" (FR-GRP-02) |
| Success | Toast "Group created" → group Expenses tab |

---

## 6. Group Detail (frame + header)

FR-GRP-*, FR-ACT-01 · API: G3

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ ← Groups                                                                                 │
│ Trip Goa                                             You owe ₹350.00                     │
│ Dec 2026 beach trip · 3 members · You are admin       [ Settle up ]   [ + Add expense ]  │
│                                                                                          │
│ ┌──────────┬──────────┬─────────────┬──────────┬─────────┬──────────┐                    │
│ │ Expenses │ Balances │ Settlements │ Activity │ Members │ Settings │                    │
│ └──────────┴──────────┴─────────────┴──────────┴─────────┴──────────┘                    │
│                                                                                          │
│   < tab content §7–§11 >                                                                 │
│                                                                                          │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```
- Header refetched when tab regains focus (ADR-008).
- `404` (not a member / group deleted) → "This group isn't available." [ Back to groups ].
- "Settle up" opens §10 dialog with the biggest "you owe" line prefilled; hidden when settled up.

### 6.1 Settings tab
```
│ Group details                                                                            │
│ Name         [ Trip Goa_______________________ ]                                         │
│ Description  [ Dec 2026 beach trip____________ ]                                         │
│                                                                   [ Save changes ]       │
│ ──────────────────────────────────────────────────────────────────────────────────────── │
│ Leave group                                                                              │
│ You can leave when your balance is ₹0.00.                         [ Leave group ]        │
│ ──────────────────────────────────────────────────────────────────────────────────────── │
│ Danger zone  (admin only)                                                                │
│ Delete this group and all its data for everyone.                  [ Delete group ]       │
```
Any member can save details (FR-GRP-08, G4). Leave → §7.3. Delete → §7.5.

---

## 7. Member Management (Members tab + dialogs)

FR-GRP-04..20 · API: G3, U1, M1, M2, M3, G5

### 7.1 Members tab
```
│ Members (3)                                                        [ + Add member ]      │
│ ┌──────────────────────────────────────────────────────────────────────────────────────┐ │
│ │ (KM) Karan Mehta    karan@example.com    Admin    Joined 1 Sep    you owe ₹350.00    │ │
│ │ (PS) Priya Sharma   priya@example.com    Member   Joined 1 Sep    owed ₹350.00    ⋯  │ │
│ │ (RK) Ravi Kumar     ravi@example.com     Member   Joined 2 Sep    settled up      ⋯  │ │
│ └──────────────────────────────────────────────────────────────────────────────────────┘ │
│ ▸ Past members (1)                                                                       │
│   Ananya Iyer (left) · 1 Sep – 20 Sep                                                    │
```
`⋯` (admin only, not on own row) → "Remove from group". "Add member" admin only.

### 7.2 Add member dialog (admin)
```
┌ Add member ──────────────────────────────────────────┐
│ [ 🔍 Search by name… ________________ ]              │
│   Ananya Iyer   ananya@example.com            [Add]  │
│   (current members are hidden)                       │
│                                       [ Close ]      │
└──────────────────────────────────────────────────────┘
```
Re-added past member becomes a new member (FR-GRP-12). Toast "Ananya added".

### 7.3 Leave group (member)
```
┌ Leave Trip Goa? ─────────────────────────────────────┐
│ You'll lose access to this group's expenses.         │
│                            [ Cancel ]  [ Leave ]     │
└──────────────────────────────────────────────────────┘
Blocked (409 BALANCE_NOT_ZERO):
┌ You can't leave yet ─────────────────────────────────┐
│ You owe ₹350.00 in this group. Settle up first.      │
│                       [ Close ]  [ Settle up ]       │
└──────────────────────────────────────────────────────┘
```

### 7.4 Remove member (admin)
```
┌ Remove Priya Sharma? ────────────────────────────────┐
│ They'll lose access to this group.                   │
│                            [ Cancel ]  [ Remove ]    │
└──────────────────────────────────────────────────────┘
Blocked: "Priya's balance is ₹350.00. It must be ₹0.00 before removal."
```
Copy rule: use "they" in all UI text about other people.

### 7.5 Admin leave dialog (FR-GRP-16..19)
```
┌ You're the admin of Trip Goa ───────────────────────────────────────────────┐
│ Choose what happens when you leave:                                         │
│                                                                             │
│ ( ) Make someone else admin, then leave                                     │
│     New admin  [ Priya Sharma ▾ ]                                           │
│     Your balance must be ₹0.00. (Now: you owe ₹350.00 ⚠)                    │
│                                                                             │
│ ( ) Leave and delete the group                                              │
│     Deletes ALL expenses, settlements and history for everyone.             │
│                                                                             │
│                                         [ Cancel ]  [ Continue ]            │
└─────────────────────────────────────────────────────────────────────────────┘
```
"Delete" path → second AlertDialog (always, API M3):
```
┌ Delete Trip Goa for everyone? ──────────────────────────────────────────────┐
│ ⚠ These balances are still open:                                            │
│    Karan owes Priya ₹350.00                                                 │
│    Ravi owes Priya ₹120.00                                                  │
│ All data will be permanently deleted. Members will be notified.             │
│ Type the group name to confirm  [ ____________ ]                            │
│                                 [ Cancel ]  [ Delete group ]                │
└─────────────────────────────────────────────────────────────────────────────┘
```
Same dialog for Settings → Delete group (G5). Admin's own row has no Remove action (FR-GRP-20).

---

## 8. Expense Form — add `/groups/:id/expenses/new` · edit `…/:eid/edit`

FR-EXP-01..09, FR-SPL-01..07 · API: G3 (members), E2, E4

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ ← Trip Goa        Add expense                                                            │
│                                                                                          │
│ Description *                                      Amount (₹) *                          │
│ [ Dinner at Thalassa_______________ ] 18/100       [ 1,200.00______ ]                    │
│                                                                                          │
│ Date *                         Paid by *                                                 │
│ [ 30 Sep 2026  📅 ]            [ Karan (you) ▾ ]       ← active members only             │
│   (future dates disabled)                                                                │
│                                                                                          │
│ Split method *     ( ) Equal    ( ) Exact amounts    (•) Percentage                      │
│                    (locked when editing 🔒)                                              │
│                                                                                          │
│ Split between *                                         [ Select all ] [ Clear ]         │
│ ┌──────────────────────────────────────────────────────────────────────────────────────┐ │
│ │ ⠿ [x] Karan (you)        [ 50.00 ] %                     → ₹600.00                   │ │
│ │ ⠿ [x] Priya Sharma       [ 25.00 ] %                     → ₹300.00                   │ │
│ │ ⠿ [x] Ravi Kumar         [ 25.00 ] %                     → ₹300.00                   │ │
│ └──────────────────────────────────────────────────────────────────────────────────────┘ │
│   ✅ 100.00% assigned                                                                    │
│                                                                                          │
│ Notes                                                                                    │
│ [ Includes tip_____________________________________________ ]  12/500                    │
│                                                                                          │
│                                                     [ Cancel ]   [ Save expense ]        │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

**Per split method (FR-SPL-06 live feedback, shared split engine)**
```
Equal       [x] Karan → ₹400.00   [x] Priya → ₹400.00   [x] Ravi → ₹400.00
            "₹1,200.00 ÷ 3 = ₹400.00 each"   (remainder note e.g. "Karan pays ₹0.01 extra")

Exact       [x] Karan [ 500.00 ]   [x] Priya [ 400.00 ]   [x] Ravi [ 200.00 ]
            ⚠ ₹100.00 left to assign            (red; Save disabled until ₹0.00 left)
            ⚠ ₹50.00 over the total

Percentage  ⚠ 10.00% left to assign  /  ⚠ 5.00% over 100%
```

| Rule | UI |
|---|---|
| Order (`position`) | Drag handle ⠿ sets order; first row absorbs remainder when payer not a participant |
| Unchecked or 0 | Not a participant (FR-SPL-04); 0 entered → row auto-unchecks |
| Payer only participant | Allowed; info "This only counts in your spending" |
| Edit: split method | Radios disabled with 🔒 tooltip "Split method can't be changed" |
| Edit: participants | Can add (active members) and remove (FR-EXP-08) |
| Server `400` codes | Shown at the related field / split summary |
| `409 CONFIRMATION_REQUIRED (SETTLEMENT_EXISTS)` | Dialog below |
| `409 INVOLVES_DEPARTED_MEMBER` | Page alert: "This expense can't be changed because Ravi has left the group." |
| Success | Toast "Expense saved" → expense detail |

**Settlement-exists warning (FR-EXP-09)**
```
┌ Balances will change ────────────────────────────────┐
│ ⚠ 2 settlements were recorded between these people   │
│ after this expense was added. Editing it will change │
│ balances and may reopen settled amounts.             │
│                    [ Cancel ]  [ Save anyway ]       │
└──────────────────────────────────────────────────────┘
```

---

## 9. Expense List & Detail

FR-EXP-10..16 · API: E1, E3, E5, E6

### 9.1 Expenses tab (list)
```
│ [ 🔍 Search description or notes__________ ]  [ Date 📅 ]  [ Amount ₹____ ]  [ Clear ]    │
│ ┌──────────────────────────────────────────────────────────────────────────────────────┐ │
│ │ Date        │ Description                     │ Paid by        │ Total     │ My share│ │
│ ├─────────────┼─────────────────────────────────┼────────────────┼───────────┼─────────┤ │
│ │ 30 Sep 2026 │ Dinner at Thalassa              │ Priya Sharma   │ ₹1,200.00 │ ₹300.00 │ │
│ │ 29 Sep 2026 │ Scooter rental for three days f…│ Karan (you)    │ ₹1,500.00 │ ₹500.00 │ │
│ │ 28 Sep 2026 │ Groceries 🔒                    │ Ravi (left)    │   ₹450.00 │ ₹150.00 │ │
│ │ 27 Sep 2026 │ Water bottles                   │ Karan (you)    │    ₹60.00 │  ₹60.00 │ │
│ └──────────────────────────────────────────────────────────────────────────────────────┘ │
│ Showing 1–20 of 57                                          ‹ 1  2  3 ›                  │
```
- Row click → detail. 🔒 = frozen (departed member involved).
- My share "—" when not a participant.
- Empty: "No expenses yet." [ + Add expense ]. No search results: "No expenses match your search."
- Search debounced 300 ms; filters kept in URL query.

### 9.2 Expense detail — `/groups/:id/expenses/:eid`
```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ ← Trip Goa                                                     [ Edit ]   [ Delete ]     │
│                                                                                          │
│ Dinner at Thalassa                                                         ₹1,200.00     │
│ 30 Sep 2026 · Paid by Priya Sharma · Split by percentage                                 │
│ Notes: Includes tip                                                                      │
│                                                                                          │
│ ┌ Shares ─────────────────────────────────────────────────────┐                          │
│ │ Karan (you)        50.00%     ₹600.00   owes Priya          │                          │
│ │ Priya Sharma       25.00%     ₹300.00   (paid)              │                          │
│ │ Ravi Kumar         25.00%     ₹300.00   owes Priya          │                          │
│ └─────────────────────────────────────────────────────────────┘                          │
│                                                                                          │
│ ┌ History ─────────────────────────────────────────────────────────────────────────────┐ │
│ │ 30 Sep, 22:10  Karan edited                                                          │ │
│ │                Amount ₹1,000.00 → ₹1,200.00                                          │ │
│ │                Karan share ₹500.00 → ₹600.00                                         │ │
│ │ 30 Sep, 21:45  Priya added this expense                                              │ │
│ └──────────────────────────────────────────────────────────────────────────────────────┘ │
│ Added by Priya · Last edited by Karan, 30 Sep 22:10                                      │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```
| State | UI |
|---|---|
| `permissions.canEdit/canDelete = false` (not creator/admin) | Buttons hidden |
| `frozenReason = INVOLVES_DEPARTED_MEMBER` | Buttons disabled + Alert "🔒 Can't be edited or deleted: Ravi has left the group." |
| `status = deleted` | Grey banner "This expense was deleted by Karan on 1 Oct 2026." No actions |
| History | Diff rendered field-by-field from E6 before/after |

**Delete confirm**
```
┌ Delete this expense? ────────────────────────────────┐
│ It will no longer count in balances or reports.      │
│ It stays visible in the group's history.             │
│                          [ Cancel ]  [ Delete ]      │
└──────────────────────────────────────────────────────┘
```

---

## 10. Balances View

FR-BAL-01..05 · API: B1, B2

### 10.1 Balances tab
```
│ ┌ Your position ───────────────────────────────────────────────────────────────────────┐ │
│ │ Net: you owe ₹200.00                                                                 │ │
│ │  You owe   Priya Sharma   ₹700.00        [ Settle up ]   [ Details ]                 │ │
│ │  Ravi Kumar owes you      ₹500.00        [ Record payment ]  [ Details ]             │ │
│ └──────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                          │
│ ┌ All balances in this group ──────────────────────────────────────────────────────────┐ │
│ │ Karan Mehta   →  Priya Sharma     ₹700.00                         [ Details ]        │ │
│ │ Ravi Kumar    →  Karan Mehta      ₹500.00                         [ Details ]        │ │
│ │ Ravi Kumar    →  Priya Sharma     ₹300.00                         [ Details ]        │ │
│ └──────────────────────────────────────────────────────────────────────────────────────┘ │
│ "A → B ₹X" means A owes B. Amounts are netted per pair.                                  │
```
Empty: "Everyone is settled up 🎉". "Settle up" (I owe) and "Record payment" (they owe me) both open §11 prefilled.

### 10.2 Balance details dialog (B2)
```
┌ Karan → Priya · ₹700.00 ─────────────────────────────────────────────────────┐
│ Date         │ Item                          │ Effect                         │
│ 30 Sep 2026  │ Dinner at Thalassa (expense)  │ +₹600.00  Karan's share        │
│ 29 Sep 2026  │ Scooter rental (expense)      │ −₹500.00  Priya's share        │
│ 28 Sep 2026  │ Cab (expense)                 │ +₹900.00                       │
│ 27 Sep 2026  │ UPI (settlement)              │ −₹300.00  Karan paid Priya     │
│ ───────────────────────────────────────────────────────────────────────────── │
│ Net                                            ₹700.00 Karan owes Priya       │
│                                                                   [ Close ]   │
└───────────────────────────────────────────────────────────────────────────────┘
```
Rows link to expense / settlement detail.

---

## 11. Settle-up Dialog & Settlements Tab

FR-STL-01..09 · API: B1 (prefill), S1–S6

### 11.1 Settle-up dialog (record / edit)
```
┌ Record a payment ────────────────────────────────────────────┐
│ Payments happen outside the app. This only records them.     │
│                                                              │
│ From *   [ Karan (you) ▾ ]       To *   [ Priya Sharma ▾ ]   │
│          (one side must be you)                              │
│ Amount (₹) *  [ 700.00_____ ]   Currently owed: ₹700.00      │
│ Date *        [ 1 Oct 2026 📅 ]                              │
│ Note          [ UPI_____________________ ]  3/200            │
│                                                              │
│                              [ Cancel ]  [ Record payment ]  │
└──────────────────────────────────────────────────────────────┘
```
| Rule | UI |
|---|---|
| Prefill | From/To and full owed amount from B1 (FR-STL-08); editable (partial allowed, FR-STL-02) |
| You not a party | From/To selects keep "you" on one side; else `NOT_SETTLEMENT_PARTY` |
| From = To | Inline error "Pick two different people" |
| Over-payment | Inline hint while typing; on save `409 CONFIRMATION_REQUIRED (OVERPAYMENT)` → dialog below |
| Edit mode | Title "Edit payment", buttons [ Delete ] [ Cancel ] [ Save ] |
| Success | Toast "Payment recorded. Priya will be notified." |

**Over-payment warning (FR-STL-03)**
```
┌ More than what's owed ───────────────────────────────┐
│ ⚠ Karan owes Priya ₹700.00, but you're recording     │
│ ₹1,000.00. Afterwards Priya will owe Karan ₹300.00.  │
│                   [ Go back ]  [ Record anyway ]     │
└──────────────────────────────────────────────────────┘
```

### 11.2 Settlements tab
```
│ ┌──────────────────────────────────────────────────────────────────────────────────────┐ │
│ │ Date        │ From            │ To             │ Amount    │ Note       │            │ │
│ ├─────────────┼─────────────────┼────────────────┼───────────┼────────────┼────────────┤ │
│ │ 1 Oct 2026  │ Karan (you)     │ Priya Sharma   │   ₹700.00 │ UPI        │ ⋯ Edit/Del │ │
│ │ 27 Sep 2026 │ Ravi (left) 🔒  │ Karan (you)    │   ₹300.00 │ cash       │            │ │
│ └──────────────────────────────────────────────────────────────────────────────────────┘ │
│ ‹ 1 ›                                                                                    │
```
`⋯` only for parties, hidden when frozen (FR-STL-09). Row click → detail dialog with history (S3, S6).

---

## 12. Notifications Panel

FR-NTF-01..05 · API: N1, N2, N3, N4

### 12.1 Bell popover (from top bar)
```
                                                    ┌ Notifications ─────── Mark all read ┐
                                                    │ ● Priya added 'Dinner' — your share │
                                                    │   ₹300.00 · Trip Goa · 5 min ago    │
                                                    │ ● Karan recorded ₹700.00 to you     │
                                                    │   Trip Goa · 1 h ago                │
                                                    │   You were added to Flat 302        │
                                                    │   2 days ago                        │
                                                    │ ─────────────────────────────────── │
                                                    │           View all notifications →  │
                                                    └─────────────────────────────────────┘
```
Latest 5. ● = unread (bold). Click → N3 + navigate to `link`.

### 12.2 All notifications — `/notifications`
```
│ Notifications                       [ All | Unread ]                  [ Mark all as read ]│
│ ┌──────────────────────────────────────────────────────────────────────────────────────┐ │
│ │ ● Priya added 'Dinner at Thalassa' — your share ₹300.00     Trip Goa   30 Sep 21:45  │ │
│ │ ● Karan recorded a payment of ₹700.00 to you                Trip Goa   1 Oct 09:10   │ │
│ │   Ananya deleted 'Electricity bill'                         Flat 302   28 Sep 18:00  │ │
│ │   Trip 2025 was deleted by the admin       Group deleted (no link)     12 Sep 11:20  │ │
│ └──────────────────────────────────────────────────────────────────────────────────────┘ │
│ ‹ 1  2 ›                                                                                 │
```
`link = null` → row not clickable, muted "Group deleted" tag (FR-NTF-05). Empty: "You're all caught up."

---

## 13. Reports — `/reports`

FR-RPT-01..07 · API: R1, R2

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ Reports                                                                                  │
│                                                                                          │
│ [ Week | Month ]     ‹  28 Sep – 4 Oct 2026  ›       Group [ All groups ▾ ]   [⭳ CSV ]   │
│                                                                                          │
│ ┌────────────────────┐ ┌────────────────────┐ ┌────────────────────┐ ┌────────────────┐  │
│ │ You paid           │ │ Your share         │ │ Payments you made  │ │ Payments recvd │  │
│ │ ₹1,500.00          │ │ ₹950.00            │ │ ₹350.00            │ │ ₹0.00          │  │
│ └────────────────────┘ └────────────────────┘ └────────────────────┘ └────────────────┘  │
│                                                                                          │
│ Expenses                                                                                 │
│ ┌──────────────────────────────────────────────────────────────────────────────────────┐ │
│ │ Date        │ Group     │ Description          │ Paid by      │ Total     │ My share │ │
│ │ 30 Sep 2026 │ Trip Goa  │ Dinner at Thalassa   │ Priya        │ ₹1,200.00 │  ₹300.00 │ │
│ │ 29 Sep 2026 │ Trip Goa  │ Scooter rental       │ Karan (you)  │ ₹1,500.00 │  ₹500.00 │ │
│ │ 27 Sep 2026 │ Flat 302  │ Groceries            │ Ananya       │   ₹450.00 │  ₹150.00 │ │
│ └──────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                          │
│ Settlements                                                                              │
│ ┌──────────────────────────────────────────────────────────────────────────────────────┐ │
│ │ 1 Oct 2026  │ Trip Goa  │ Karan (you) → Priya     │ ₹350.00 │ UPI                    │ │
│ └──────────────────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```
| Behaviour | Detail |
|---|---|
| Default | Current week (Mon–Sun, IST), all groups |
| ‹ › | Previous / next period; › disabled for current period |
| Week/Month toggle | Keeps the date, switches period type |
| Group filter | Only groups I'm currently in |
| CSV | Browser download from R2 with same params; filename from server |
| Empty | "No expenses or payments in this period." CSV still allowed (header only) |

---

## 14. Screen ↔ Requirement ↔ API Coverage

| Screen | Requirements | Endpoints |
|---|---|---|
| §1 App shell | FR-NTF-04, FR-AUTH-05 | A7, A8, N2 |
| §2 Auth | FR-AUTH-01..04 | A1–A6, X1 |
| §3 Profile | FR-AUTH-05..08 | P1–P3, A7 |
| §4 Dashboard | FR-DSH-01, FR-BAL-04 | D1 |
| §5 Group list & create | FR-GRP-01..07 | G1, G2, U1 |
| §6 Group detail + settings | FR-GRP-08, FR-GRP-13..15 | G3, G4, G5 |
| §7 Members | FR-GRP-04..20 | U1, M1–M3, G5 |
| §8 Expense form | FR-EXP-01..09, FR-SPL-* | E2, E4 |
| §9 Expense list & detail | FR-EXP-10..16 | E1, E3, E5, E6 |
| §10 Balances | FR-BAL-01..05 | B1, B2 |
| §11 Settle up & settlements | FR-STL-* | S1–S6 |
| §12 Notifications | FR-NTF-* | N1–N4 |
| §13 Reports | FR-RPT-* | R1, R2 |
| Activity tab (in §6) | FR-ACT-01 | AC1 |

Activity tab layout (same list style as §12.2, newest first, paginated):
```
│ 30 Sep 22:10  Karan edited 'Dinner at Thalassa' ₹1,000.00 → ₹1,200.00       → open       │
│ 30 Sep 21:45  Priya added 'Dinner at Thalassa' ₹1,000.00                    → open       │
│ 29 Sep 10:02  Ravi left the group                                                        │
│ 27 Sep 09:00  Karan created the group                                                    │
```

---

## 15. Resolved Questions

Confirmed by product owner 2026-10-01.

| # | Question | Decision |
|---|---|---|
| UI-1 | Product name | **SplitBook** |
| UI-2 | Type-to-confirm for destructive actions | Yes — account delete and group delete only |
| UI-3 | Expense add/edit layout | Full page |
| UI-4 | Theme | Light only for v1 |
