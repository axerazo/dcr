# Digital Check Register — Complete Technical Specification
**Version:** 1.0  
**Status:** Build-Ready  
**Last Updated:** April 2026  

---

## Table of Contents

1. [Product Philosophy](#1-product-philosophy)
2. [Core Principles](#2-core-principles)
3. [User Authentication & Security](#3-user-authentication--security)
4. [Account Management](#4-account-management)
5. [Register Structure](#5-register-structure)
6. [Column Definitions](#6-column-definitions)
7. [Status System](#7-status-system)
8. [Balance Model](#8-balance-model)
9. [Formula Definitions](#9-formula-definitions)
10. [Status Transition Rules](#10-status-transition-rules)
11. [Monthly Register Rules](#11-monthly-register-rules)
12. [Locked Month & Audit Log](#12-locked-month--audit-log)
13. [Reconciliation System](#13-reconciliation-system)
14. [AI Layer](#14-ai-layer)
15. [Data Schema](#15-data-schema)
16. [UI Specification](#16-ui-specification)
17. [Validation Rules](#17-validation-rules)
18. [Bank Sync (Optional — v2)](#18-bank-sync-optional--v2)
19. [Tech Stack Recommendation](#19-tech-stack-recommendation)
20. [Build Phases](#20-build-phases)
21. [Statement-Level Reconciliation (Phase 4)](#21-statement-level-reconciliation-phase-4)

---

## 1. Product Philosophy

This application is a **ledger-first digital check register**. It is not a budgeting app, not a bank dashboard, and not an AI financial advisor.

> **The bank is not the source of truth. The user's ledger is.**

Bank data is secondary and used exclusively for reconciliation — to confirm what the user already knows, not to tell the user what is true.

### What This App Solves

Consumers have no trustworthy way to know their real checking account balance at any given moment because:

- Banks mix posted and pending transactions inconsistently
- Banks do not know about scheduled or pre-planned payments
- Existing apps treat bank data as the source of truth
- "Available Balance" shown by banks is optimistic and frequently causes overdrafts

### What This App Is

- A rigorous, auditable, month-by-month digital check register
- A system where the user records transactions based on intent and knowledge
- A tool where AI assists with reconciliation but never makes decisions
- A platform where every balance is honest, transparent, and explainable

---

## 2. Core Principles

1. **Ledger-first.** User-entered data is always authoritative. Bank data never overwrites it.
2. **Nothing changes silently.** No automatic status changes without user knowledge. AI suggests; user confirms.
3. **Every balance is explainable.** The gap between any two balances is always visible and describable.
4. **History is immutable.** Past months are locked. Edits require explicit unlock and are permanently logged.
5. **Committed money is not available money.** Scheduled payments deduct from Available Balance immediately upon entry.
6. **AI is an assistant, not a decision-maker.** Ever.

---

## 3. User Authentication & Security

### Login Requirements
- Secure email + password authentication
- Multi-factor authentication (MFA) required — TOTP or SMS
- Session timeout after inactivity (configurable, default 15 minutes)
- Password requirements: minimum 12 characters, mixed case, numbers, symbols

### Data Security
- All data encrypted at rest (AES-256)
- All data encrypted in transit (TLS 1.3)
- Routing numbers: encrypted at rest, masked in UI (`••••••102`), revealed only on explicit user action
- Account numbers: encrypted at rest, masked in UI (`••••3106`), revealed only on explicit user action
- Routing and account numbers stored ONLY in account settings — never displayed in the register header
- Audit log is append-only — no entry is ever modified or deleted, including by the user
- IP address logged (encrypted) on all sensitive actions

### Auth Stack (Recommended)
- Supabase Auth or Auth0 for authentication layer
- Row-Level Security (RLS) — every user sees only their own data
- JWT tokens with short expiry + refresh token rotation

---

## 4. Account Management

Users can manage one or more bank accounts. Each account has its own independent register system.

### Account Fields

| Field | Type | Constraints |
|---|---|---|
| `id` | UUID | Auto-generated, primary key |
| `user_id` | UUID | Foreign key to user |
| `nickname` | String | Required, e.g. "TD Bank — Main Checking" |
| `bank_name` | String | Required |
| `account_type` | Enum | `checking` or `savings` |
| `routing_number` | Encrypted String | 9 digits exactly |
| `account_number` | Encrypted String | 8–17 digits |
| `is_active` | Boolean | Soft delete — never hard delete |
| `created_at` | Timestamp | Immutable |
| `updated_at` | Timestamp | Auto-updated |

### CRUD Rules
- **Create:** User can add multiple accounts
- **Read:** Account details masked by default; full reveal requires user action
- **Update:** All fields editable except `id` and `created_at`
- **Delete:** Soft delete only (`is_active = false`) — historical registers are preserved permanently

---

## 5. Register Structure

### Monthly Organization
- Each calendar month has exactly one register per account
- Registers are identified by `account_id` + `month` + `year`
- One register is displayed at a time
- Navigation: previous/next month arrows + month tab bar (January–December + Yearly Summary)

### Opening Balance
- January of each year: user sets the opening balance manually (once, at account creation or year start)
- February–December: opening balance = prior month's closing balance — **read-only, auto-carried, never editable**
- Opening balance is stored as `register.opening_balance`

### Closing Balance
- The running balance of the last non-void transaction row in the register
- Automatically becomes the next month's opening balance

### Yearly Summary
- A derived, read-only view across all 12 monthly registers
- No manual input ever accepted
- Displays monthly opening/closing balances, total debits, total credits, net change per month

---

## 6. Column Definitions

### Header Row (Non-Editable)

| Cell | Label | Value | Type | Rules |
|---|---|---|---|---|
| B1/B2 | — | `Check Register — [Month] [YYYY]` | Auto-generated | Derived from active register month/year |
| F1 | `Current Balance:` | — | Label only | Static |
| F2 | `Available Balance:` | — | Label only | Static |
| G1 | — | Current Balance value | Decimal(2) | User-entered during reconciliation; see Formula A |
| G2 | — | Available Balance value | Decimal(2) | User-entered during reconciliation; see Formula B |
| H1 | `Actual Balance:` | — | Label only | Static |
| H2 | — | Actual/Ledger Balance | Decimal(2) | **COMPUTED — never editable**; see Formula C |

> Note: Routing number and account number are displayed in **Account Settings only**, not in the register header.

### Transaction Row (Editable)

| Column | Label | Type | Required | Constraints |
|---|---|---|---|---|
| B | Check # | Integer | No | Positive integers only; optional |
| C | Date | Date | Yes | Format: MM/DD/YYYY; future dates allowed |
| D | Description of Transaction | String | Yes | Free text; max 255 characters |
| E | Register Status | Enum (icon) | Auto/User | See Status System section; icons only |
| F | Debit (–) | Decimal(2) | Conditional | Positive numbers only; mutually exclusive with G |
| G | Credit (+) | Decimal(2) | Conditional | Positive numbers only; mutually exclusive with F |
| H | Balance | Decimal(2) | — | **COMPUTED — never stored, never editable** |
| I | Notes / Memos | String | No | Free text only; confirmation numbers, descriptions, user notes |
| J | Sched. Date | Date | No | User-set via date picker in edit mode; drives scheduled/in_flight status automatically; stored as YYYY-MM-DD; single source of truth for all scheduling behavior |

---

## 7. Status System

Every transaction row has exactly one status at any time. Status is displayed in Column E as an icon.

### Status Definitions

| Status | Icon | Color | Source | Meaning |
|---|---|---|---|---|
| `recorded` | *(blank)* | — | User entry | Row has debit or credit entered; not yet synced with bank |
| `scheduled` | `scheduled.svg` | Red ❗ | **Automatic** | `scheduled_date` column is set and date is today or in the future |
| `in_flight` | `scheduled.svg` | Red ❗ + amber row tint | **Automatic** | `scheduled_date` is set and that date has passed; awaiting bank confirmation |
| `pending` | `pending.svg` | Yellow ⚠️ | User action (AI may suggest) | Bank reports transaction as in-process / incoming |
| `cleared` | `cleared.svg` | Green ✅ | User action (AI may suggest) | Bank has fully posted and settled the transaction |
| `void` | *(struck through)* | Gray | User action | Transaction cancelled; excluded from all calculations |

### Icon Files
- `cleared.ico` → convert to `cleared.svg` (green checkmark)
- `pending.ico` → convert to `pending.svg` (yellow exclamation)
- `scheduled.ico` → convert to `scheduled.svg` (red exclamation)

> All icons must be converted from `.ico` to `.svg` for cross-browser compatibility and retina display sharpness.

### Mutual Exclusivity — Debit and Credit
- A transaction row can have a **debit OR a credit — never both**
- If debit has a value: credit field is disabled for that row
- If credit has a value: debit field is disabled for that row
- If user attempts to enter both simultaneously, display inline message:
  > *"A transaction can only be a debit or a credit — not both. Please enter one or the other."*
- Real-time field disabling prevents the error before it occurs

---

## 8. Balance Model

### The Two Computations

There are exactly **two distinct balance computations**. Three labels are used in the UI, but two of them (Current Balance and Actual Balance) produce the same number from the same formula.

#### Computation A — Ledger Balance
```
ledger_balance = opening_balance
               + SUM(all credits where status ≠ void)
               - SUM(all debits where status ≠ void)
```
Used for:
- **Current Balance** (G1) — the bank-side reconciliation target label
- **Actual Balance** (H2) — the ledger-side source of truth label
- These are always the same number

#### Computation B — Available Balance
```
available_balance = opening_balance
                  + SUM(credits where status = 'cleared')
                  - SUM(debits where status = 'cleared')
```
Used for:
- **Available Balance** (G2) — what the bank thinks the user can spend

### Why Three Labels for Two Computations

| Label | Axis | Purpose |
|---|---|---|
| **Current Balance** | Bank | Reconciliation target — should match bank's "Current" after reconciliation |
| **Available Balance** | Bank | Reconciliation target — should match bank's "Available" after reconciliation |
| **Actual Balance** | Ledger | Source of truth — what the user can truly spend right now |

The bank's "Available Balance" is optimistic — it does not know about scheduled payments, pre-planned debits, or user-entered transactions. The **Actual Balance** corrects this by including everything the user knows about.

### The Convergence Principle

In a perfect reconciliation state:
- Every transaction is cleared ✅
- No pending ⚠️ transactions exist
- No scheduled ❗ transactions exist
- No unsynced `recorded` entries exist

**Result: Current Balance = Available Balance = Actual Balance**

This is the system's "green light" state — all three numbers match.

### The Divergence Diagnostic

| Gap | Meaning |
|---|---|
| `Current Balance` ≠ `Available Balance` | Pending holds the bank is processing |
| `Available Balance` ≠ `Actual Balance` | Scheduled/unsynced commitments bank doesn't know about yet |
| All three differ | Full reconciliation needed |
| All three equal | ✅ Fully reconciled |

---

## 9. Formula Definitions

### Formula A — Current Balance (G1)
```
current_balance = opening_balance
                + SUM(all credits, status ≠ void)
                - SUM(all debits, status ≠ void)
```
Includes: cleared, pending, scheduled, in_flight, recorded  
Excludes: void  
Reconciliation target: must match bank's "Current Balance" after reconciliation

### Formula B — Available Balance (G2)
```
available_balance = opening_balance
                  + SUM(credits where status = 'cleared')
                  - SUM(debits where status = 'cleared')
```
Includes: cleared only  
Excludes: pending, scheduled, in_flight, recorded, void  
Reconciliation target: must match bank's "Available Balance" after reconciliation

### Formula C — Actual Balance / Register Balance (H2)
```
actual_balance = last_transaction_row.balance
               = opening_balance
               + SUM(all credits, status ≠ void)
               - SUM(all debits, status ≠ void)
```
This is identical to Formula A. The distinction is context:
- Formula A is used in the header as the bank-side reconciliation label
- Formula C is the running ledger balance — the user's true source of truth

### Formula D — Running Balance (Column H, per row)
```
row.balance = opening_balance
            + SUM(credit column, row 1 through current row, status ≠ void)
            - SUM(debit column, row 1 through current row, status ≠ void)
```
Rules:
- If row has neither debit nor credit: balance cell is blank
- Always includes opening balance — every row shows a true account balance
- **Never stored in the database** — always computed on read
- Void rows do not affect the running balance of subsequent rows

### Formula E — Monthly Carry-Forward (Normalized)
```
current_month.opening_balance = prior_month.last_transaction_row.balance
```
One rule. Every month. No exceptions.  
January: opening balance set manually by user at account/year initialization  
February–December: opening balance = prior month closing balance, read-only, auto-carried

---

## 10. Status Transition Rules

### Complete Transition Map

```
[blank / recorded]
  ↓ User sets scheduled_date via Column J date picker
[SCHEDULED ❗ red icon]  (status derived at save time; also restored at read time)
  ↓ scheduled_date passes (system date > scheduled_date)
[IN-FLIGHT ❗ red icon + amber row tint + tooltip]
  ↓ User marks as pending OR cleared (or AI suggests)
[PENDING ⚠️]  OR  [CLEARED ✅]
  ↓ (if pending) Bank posts; user/AI confirms
[CLEARED ✅]  ← final state

User clears scheduled_date (clicks ×):
  → If status was scheduled or in_flight → auto-reset to recorded
  → Toast: "Scheduled date removed — status reset to recorded"
  → If user had manually changed status (e.g. pending) → no auto-reset

Any state → [VOID] via explicit user action + confirmation prompt
VOID rows are excluded from all balance computations
Audit entry created for every status transition
```

### Scheduled Date Rule (Column J)
- **Trigger:** User sets a date in the `scheduled_date` field (Column J) via the inline date picker
- **Action:** Status is derived at save time — `scheduled` if date is today or future, `in_flight` if date has already passed
- **Auto-restore on load:** If `status = 'recorded'` AND `scheduled_date IS NOT NULL` AND `scheduled_date >= today` → displayed as `scheduled` at read time (corrects stale DB state)
- **Icon preview:** While editing, the scheduled icon appears in Column E as soon as a date is entered — no save required
- **`scheduled_date` is the single source of truth** for all scheduling behavior. Notes/Memos (Column I) is now free text only and has no effect on status.

### In-Flight Transition Rule
- **Trigger:** `scheduled_date` is set AND system date is after `scheduled_date`
- **Action:** Row receives amber/orange visual tint; tooltip appears
- **Tooltip text:** `"Payment date passed — awaiting bank confirmation"`
- **Icon:** Red scheduled icon remains — it is NOT removed
- **No silent status change** — user is always informed, never surprised

### Scheduled Date Clear Rule
- **Trigger:** User clicks × to clear `scheduled_date`
- **If status was `scheduled` or `in_flight`:** Status auto-resets to `recorded`; toast notification displayed for 4 seconds
- **If user had manually set status** (e.g. `pending`, `cleared`) before clearing the date: status is respected — no auto-reset
- Confirmation number and all other notes content is untouched

### Pending Status Rule
- **Source:** Bank reports transaction as "in-process" or "incoming" during reconciliation
- **Action:** User manually marks as pending, OR AI suggests and user confirms
- **Visual:** Yellow pending icon in Column E

### Cleared Status Rule
- **Source:** Bank confirms transaction fully posted and settled
- **Action:** User manually marks as cleared, OR AI suggests and user confirms
- **Visual:** Green cleared icon in Column E

### Void Rule
- Available from any status
- Requires explicit user action + confirmation prompt
- Void transactions are struck through visually
- Excluded from ALL balance computations
- Cannot be permanently deleted — void is the final deletable state
- Audit entry created

---

## 11. Monthly Register Rules

### Display
- One month displayed at a time
- Month navigation: left/right arrows + tab bar at bottom (January–December + Yearly Summary)
- Current month is default view on login
- Register title: `Check Register — [Month Name] [YYYY]`

### Row Behavior
- Each row represents one transaction
- Rows are ordered by entry sequence within the month (not auto-sorted by date)
- Inline editing — click any editable cell to edit
- Autosave — changes save automatically on cell blur or Enter key
- Row limit: 220 transaction rows per month (matching Excel system capacity)

### Visual Row States
| State | Visual Treatment |
|---|---|
| `recorded` (blank) | Normal row |
| `scheduled` | Normal row + red icon in E |
| `in_flight` | Amber/orange row tint + red icon in E |
| `pending` | Subtle blue-gray tint + yellow icon in E |
| `cleared` | Slight green tint or checkmark only — understated |
| `void` | Struck-through text, grayed out |

### Yearly Summary Tab
- Read-only derived view
- No manual input accepted
- Displays per month: opening balance, total credits, total debits, net change, closing balance
- Annual totals row at bottom

### Month Status State Machine

Every register has a `month_status` field that tracks its lifecycle:

| Status | Meaning | Editable | UI |
|---|---|---|---|
| `open` | Default; has uncleared transactions | Yes | Normal |
| `ready_to_close` | All non-void transactions cleared | Yes | Close prompt shown once |
| `soft_closed` | User closed; next month still open | No (`is_locked = true`) | "Reopen [Month]" button |
| `hard_closed` | Next month also closed; fully archived | No (`is_locked = true`) | "🔒 Archived" + unlock dialog |

**Transitions:**
- `open` → `ready_to_close`: automatic when all non-void transactions reach `cleared` status
- `ready_to_close` → `open`: automatic when any non-cleared transaction is added or editing reverts a cleared transaction
- `ready_to_close` → `soft_closed`: explicit user action ("Close & Archive")
- `soft_closed` → `open`: user clicks "Reopen" (no confirmation, no audit, only while next month is not soft_closed)
- `soft_closed` → `hard_closed`: automatic when the next sequential month transitions to `soft_closed`
- `hard_closed` → editable session: existing unlock dialog + full audit log (existing flow, preserved)

> **Phase 4 forward reference:** Phase 4 will introduce a `statement-reconciled` verification marker that sits between `soft_closed` and `hard_closed`. This is not a separate `month_status` value — it is an optional verification step applied after soft-close, stored as metadata on the register row. See §21 for details.

### Month Register Creation

> **NOTE: Auto-carry behavior described below is the intended design and is not yet implemented as of this spec revision. Current implementation always shows the Initialize modal when a register does not exist. Implementation of the described auto-carry behavior is planned — see §20 for build phase placement.**

Month registers are created by two mechanisms: **system auto-carry** (for the current calendar month, silent) and the **Initialize modal** (all other cases).

**Auto-carry — current month:**  
When the user accesses the app (login, page load, or any navigation event) and the current calendar month has no register, the system checks for a prior-month register. If one exists, the system silently auto-creates the current month register before any UI renders. Opening balance is the most recent prior month's last-cleared running balance, computed at carry time. The user sees the new register ready to use — no Initialize modal, no toast, no notification.

"Most recent prior month" means the most recent existing register in the past, not necessarily the immediately prior calendar month. Gaps are allowed.

Auto-carry never fires for a month that already has a register.

**January — year boundary:**  
January registers always require manual entry via the Initialize modal, regardless of December's state. January marks the fiscal year boundary; the user must explicitly establish the opening balance.

**When the Initialize modal appears:**
- Creating a January register
- Creating a register for a future calendar month (pre-entry scenario; the calendar has not yet reached that month's first day)
- Creating the very first register for an account, where no prior month exists to carry from
- Creating a register for a past month where no auto-carry source exists (backfill scenario)

In all other cases, auto-carry fires automatically.

**Early creation — future months:**  
A user may navigate to a future month tab before that month begins (e.g., creating May on April 25) to pre-enter known scheduled items. The Initialize modal appears and prompts for a manual opening balance — typically the current Actual Balance from the prior month. That manual value is permanent at creation time. Auto-carry never fires for a month that already has a register.

### Opening Balance Carry-Forward Rule (Revised)

Opening balance formula: `opening_balance = most recent prior month's last-cleared running balance`. This is the running balance at the last `cleared` transaction in `row_order` sequence; the running balance includes all non-void transactions and the "snapshot" is recorded each time a cleared transaction is encountered.

For auto-carry, this formula determines the opening balance at the moment the register is created. For manually initialized registers (Initialize modal), the user-entered value is used at creation time.

Once a register exists — whether created by auto-carry or Initialize modal — changes to the prior month's last-cleared running balance silently update that register's opening balance (no prompt). Propagation:
- Applies regardless of the prior month's archive state. A month that has been reopened and re-modified updates the next month's opening balance — and any subsequent months that carry from it — through the chain.
- Is cascading: because each month's closing balance becomes the next month's opening balance, a change in any prior month ripples forward through all subsequent months. This is mathematically correct ledger behavior.
- **Never** updates a next month whose `is_locked = true`.

### Close & Archive Flow

Triggered when the user clicks "Close & Archive [Month]" from the ready-to-close prompt:

**Happy path** (closing balance = next month opening, or no next month):
- Prompt: "✅ All [Month] transactions are cleared. [Month]'s final balance is $X. Ready to close?"
- Buttons: `[ Not Yet ]` | `[ Close & Archive [Month] ]`

**Unhappy path** (discrepancy between closing and next month opening):
- Prompt shows the dollar difference and both amounts
- Buttons: `[ Use [Month]'s closing balance — $X ]` | `[ Keep [Next Month]'s opening balance — $X ]` | `[ Explain the difference ]` (Phase 2 AI)
- `[ Keep [Next Month]'s opening balance ]` requires a non-empty reason text input before it becomes enabled; reason is saved to the audit log `reason` field

### Unhappy Path Prompt Suppression Rule

The opening balance mismatch prompt displays whenever **ALL** of the following are true:
1. Current month status is `open` or `ready_to_close`
2. A mismatch exists between current month closing balance and next month's opening balance
3. Next month has `is_manual_opening = true`

The prompt is suppressed when **ANY** of the following are true:
1. Current month status is `soft_closed` or `hard_closed`
2. No mismatch exists (balances are equal within half-cent tolerance)
3. Next month has `is_manual_opening = false`

**Persistence behavior:** The prompt re-appears on every navigation to the month until the month is archived. This is correct — the mismatch is unresolved until the user commits to a final decision via Close & Archive. Once archived (`soft_closed`), the decision is permanent and the prompt never fires again for that month unless it is reopened via the unlock flow.

There is no intermediate "acknowledged but not yet archived" suppression state. Clicking `[ Keep [Next Month]'s opening balance ]` in the unhappy close prompt resolves the discrepancy decision for the archive action only; it does not suppress the prompt on subsequent navigation before archiving.

**On confirm (either path):**
- `month_status = 'soft_closed'`
- `is_locked = true`
- Next month's `opening_balance` set to this month's closing balance (if "Use closing" chosen)
- Audit log: `action = 'month_soft_closed'`
- If prior month is `soft_closed` → prior month auto-upgrades to `hard_closed`, audit logged

---

## 12. Locked Month & Audit Log

### Locking Rules
- The **current month** is always editable
- **Past months** are locked by default (read-only)
- **Future months** have no register until the user creates one; once created via the Initialize modal (§11), the month is editable like any other `month_status = 'open'` month — no lock, no unlock flow required

### Unlocking a Locked Month
1. User navigates to a past month
2. Lock indicator displayed: `🔒 Locked — This register is closed`
3. User clicks `[ Unlock to Edit ]`
4. Confirmation dialog: *"You are about to edit a closed register. All changes will be logged with a timestamp. Continue?"*
5. User confirms → month becomes editable for the session
6. Every save in an unlocked past month writes an audit entry
7. Month can be manually re-locked by user, OR auto-re-locks at end of session

### Audit Log Schema
```
AuditEntry {
  id:               UUID          auto-generated
  user_id:          UUID          foreign key
  account_id:       UUID          foreign key
  register_id:      UUID          foreign key
  transaction_id:   UUID?         foreign key (null for register-level actions)
  action:           Enum          unlocked | edited | deleted | voided | re-locked | status_changed
  field_changed:    String?       which column was modified
  value_before:     String?       prior value (serialized)
  value_after:      String?       new value (serialized)
  reason:           String?       optional user-entered note explaining the edit
  timestamp:        Timestamp     immutable, server-side
  ip_address:       String        encrypted
}
```

### Audit Log Rules
- **Append-only** — no entry is ever modified or deleted, by anyone
- Covers: all edits to locked months, all status transitions, all void actions, all unlock events
- Viewable by user in account settings (read-only view)
- Future: exportable as CSV for personal records

---

## 13. Reconciliation System

### What Reconciliation Means in This App
Reconciliation is the process of confirming that the user's ledger matches the bank's records. It is performed by the user (assisted by AI), not automated.

### Reconciliation Workflow
1. User opens current month register
2. User enters bank's current reported balances into header fields (G1, G2)
3. App computes Actual Balance (H2) from ledger
4. Reconciliation status indicator compares the three values
5. AI identifies unmatched transactions and explains gaps
6. User updates transaction statuses based on AI suggestions
7. When all three balances converge: reconciliation is complete ✅

### Reconciliation Status Indicator (Header)
```
Unreconciled state:
  ⚠️ Reconciliation needed
  Gap: $X,XXX.XX in unresolved transactions
  [N scheduled]  [N pending]  [N unsynced]

Reconciled state:
  ✅ Fully reconciled — all balances match
```

### Gap Explanation (AI-Generated)
When gaps exist, AI provides a plain-language explanation:
> *"Your $2,965.37 gap consists of 8 scheduled payments totaling $2,681.68 and 1 pending transaction of $251.86. Everything is accounted for."*

---

## 14. AI Layer

### Phase 2 Implementation (complete)

**Model:** `claude-sonnet-4-6` via `@anthropic-ai/sdk`
**Trigger:** User clicks "Reconcile" button in `RegisterHeader`
**Mode:** Single API call (no streaming). 30-second timeout.
**System prompt:** `src/lib/reconciliation/systemPrompt.ts` — single source of truth for AI behavior.

#### File layout
```
src/lib/reconciliation/
  systemPrompt.ts          ← RECONCILIATION_SYSTEM_PROMPT constant
  buildContext.ts          ← buildReconciliationContext() payload builder
  reconciliationService.ts ← runReconciliationSession() API call
src/types/reconciliation.ts ← All Phase 2 reconciliation types
src/components/reconciliation/
  ReconciliationPanel.tsx  ← Slide-in results panel
```

#### Button visibility rules
| `month_status`   | Button shown? | Disabled? |
|------------------|---------------|-----------|
| `open`           | Yes           | Only if all transactions cleared |
| `ready_to_close` | Yes           | Only if all transactions cleared |
| `soft_closed`    | No            | — |
| `hard_closed`    | No            | — |

#### Context payload sent to Claude
```
session:         { month, year, today (MM/DD/YYYY), account_nickname }
balances:        { opening, actual, available, gap }
summary_counts:  { cleared, pending, scheduled, in_flight, recorded, void, total_non_void }
transactions[]:  { id, date, description, debit, credit, status, notes,
                   scheduled_date, days_past_scheduled }
```
Void transactions are excluded. Dates converted from ISO to MM/DD/YYYY for readability.

#### AI output schema
```typescript
ReconciliationResult {
  summary: {
    status: 'reconciled' | 'in_progress' | 'needs_attention'
    headline: string            // 1-sentence summary
    gap_explanation: string     // empty string when gap = 0
    action_count: number        // non-informational suggestion count
  }
  suggestions: Array<{
    id: string                  // "sugg_N"
    priority: number            // 1 = highest; array sorted ascending
    type: 'mark_pending' | 'verify_amount' | 'investigate' | 'informational'
    transaction_id: string | null
    description: string         // ≤ 80 chars, user-facing
    reasoning: string           // 1-2 sentences
    suggested_status: 'pending' | null
  }>
  flags: Array<{
    id: string                  // "flag_N"
    severity: 'warning' | 'info'
    type: 'amount_anomaly' | 'duplicate_suspect' | 'long_overdue' | 'missing_confirmation'
    transaction_id: string | null
    description: string
    reasoning: string
  }>
  reconciliation_complete: boolean
}
```

### What AI Does in This App
| Function | Description |
|---|---|
| Status suggestions | Suggests marking transactions as `pending` based on age and scheduled dates |
| Gap explanation | Explains in plain language why actual ≠ available balance |
| Discrepancy flagging | Flags anomalies: duplicate amounts, long-overdue in-flight, missing confirmations |
| Reconciliation summary | Produces a headline and status (`reconciled` / `in_progress` / `needs_attention`) |

### What AI Does NOT Do
- AI does **not** automatically update any transaction status
- AI does **not** make financial decisions
- AI does **not** manage budgets or categorize spending
- AI does **not** connect to the bank without explicit user initiation
- AI does **not** overwrite user-entered data, ever

### AI Interaction Model
```
User clicks "Reconcile"
  → reconciliation_session_started audit entry written
  → buildReconciliationContext() builds payload
  → runReconciliationSession() calls Claude API
  → ReconciliationPanel slides in with results

For each suggestion:
  Accept → transaction status updated + ai_suggestion_accepted audit entry
  Ignore → ai_suggestion_ignored audit entry (no data change)

User clicks Done
  → reconciliation_session_completed audit entry (accepted/ignored counts)
  → Panel closes; register view returns to full width
```

### Audit actions (§12)
| Action | When |
|---|---|
| `reconciliation_session_started` | Reconcile button clicked (before API call) |
| `reconciliation_session_completed` | Done clicked; value_after = `{accepted, ignored, status}` JSON |
| `ai_suggestion_accepted` | User accepts a suggestion with suggested_status |
| `ai_suggestion_ignored` | User clicks Ignore |

### Error handling
| Condition | Message shown |
|---|---|
| API timeout (> 30s) | "Analysis is taking longer than expected. Please try again." |
| Parse error | "Unable to parse AI response. Please try again." |
| API error (non-200) | "Reconciliation service unavailable. Please try again later." |
| Network failure | "No connection. Please check your network and try again." |

All errors show inline below the Reconcile button with a "Try again" label (re-clicking the button).

---

## 15. Data Schema

### Table: `users`
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
email           TEXT UNIQUE NOT NULL
created_at      TIMESTAMPTZ DEFAULT now()
updated_at      TIMESTAMPTZ DEFAULT now()
```

### Table: `accounts`
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
user_id         UUID REFERENCES users(id) NOT NULL
nickname        TEXT NOT NULL
bank_name       TEXT NOT NULL
account_type    TEXT CHECK (account_type IN ('checking', 'savings')) NOT NULL
routing_number  TEXT NOT NULL  -- encrypted at application layer
account_number  TEXT NOT NULL  -- encrypted at application layer
is_active       BOOLEAN DEFAULT true
created_at      TIMESTAMPTZ DEFAULT now()
updated_at      TIMESTAMPTZ DEFAULT now()
```

### Table: `registers`
```sql
id                  UUID PRIMARY KEY DEFAULT gen_random_uuid()
account_id          UUID REFERENCES accounts(id) NOT NULL
month               INTEGER CHECK (month BETWEEN 1 AND 12) NOT NULL
year                INTEGER NOT NULL
opening_balance     NUMERIC(12,2) NOT NULL DEFAULT 0.00
current_bank_bal    NUMERIC(12,2)  -- user-entered during reconciliation
available_bank_bal  NUMERIC(12,2)  -- user-entered during reconciliation
is_locked           BOOLEAN DEFAULT false NOT NULL
is_manual_opening   BOOLEAN DEFAULT false NOT NULL  -- true = user entered via Initialize modal; false = auto-carried from prior month
month_status        TEXT NOT NULL DEFAULT 'open'
                    CHECK (month_status IN ('open', 'ready_to_close', 'soft_closed', 'hard_closed'))
last_closed_type    TEXT CHECK (last_closed_type IN ('soft', 'hard'))  -- null = never closed; 'soft' = most recently soft_closed; 'hard' = most recently hard_closed
created_at          TIMESTAMPTZ DEFAULT now()
updated_at          TIMESTAMPTZ DEFAULT now()
UNIQUE (account_id, month, year)
```

### Table: `transactions`
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
register_id     UUID REFERENCES registers(id) NOT NULL
row_order       INTEGER NOT NULL  -- preserves display sequence within month
check_number    INTEGER           -- optional
date            DATE NOT NULL     -- user-entered intent date; future dates allowed
description     TEXT NOT NULL
status          TEXT CHECK (status IN (
                  'recorded',
                  'scheduled',
                  'in_flight',
                  'pending',
                  'cleared',
                  'void'
                )) DEFAULT 'recorded'
debit           NUMERIC(12,2) CHECK (debit > 0)   -- mutually exclusive with credit
credit          NUMERIC(12,2) CHECK (credit > 0)  -- mutually exclusive with debit
-- balance column is NOT stored — always computed on read
notes           TEXT              -- free text only: confirmation numbers, descriptions, user notes
scheduled_date  DATE              -- user-set via Column J date picker; drives scheduled/in_flight status; single source of truth for all scheduling behavior
created_at      TIMESTAMPTZ DEFAULT now()
updated_at      TIMESTAMPTZ DEFAULT now()
CONSTRAINT debit_credit_exclusive CHECK (
  NOT (debit IS NOT NULL AND credit IS NOT NULL)
)
```

### Table: `audit_log`
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
user_id         UUID REFERENCES users(id) NOT NULL
account_id      UUID REFERENCES accounts(id) NOT NULL
register_id     UUID REFERENCES registers(id)
transaction_id  UUID REFERENCES transactions(id)
action          TEXT NOT NULL  -- unlocked | re-locked | opening_balance_updated | opening_balance_mismatch_kept | month_soft_closed | month_hard_closed | reconciliation_session_started | reconciliation_session_completed | ai_suggestion_accepted | ai_suggestion_ignored
field_changed   TEXT
value_before    TEXT
value_after     TEXT
reason          TEXT           -- optional user note
ip_address      TEXT           -- encrypted
timestamp       TIMESTAMPTZ DEFAULT now() NOT NULL
-- NO update or delete permissions on this table — append only
```

### Balance Computation (Application Layer — Never SQL Stored)
```typescript
function computeRunningBalance(
  openingBalance: number,
  transactions: Transaction[]
): Transaction[] {
  let running = openingBalance;
  return transactions.map(tx => {
    if (tx.status === 'void' || (!tx.debit && !tx.credit)) {
      return { ...tx, balance: null };
    }
    running += (tx.credit ?? 0) - (tx.debit ?? 0);
    return { ...tx, balance: running };
  });
}

function computeCurrentBalance(
  openingBalance: number,
  transactions: Transaction[]
): number {
  return transactions
    .filter(tx => tx.status !== 'void')
    .reduce((acc, tx) => acc + (tx.credit ?? 0) - (tx.debit ?? 0), openingBalance);
}

function computeAvailableBalance(
  openingBalance: number,
  transactions: Transaction[]
): number {
  return transactions
    .filter(tx => tx.status === 'cleared')
    .reduce((acc, tx) => acc + (tx.credit ?? 0) - (tx.debit ?? 0), openingBalance);
}

// Current Balance = Actual Balance (same computation, two labels)
const actualBalance = computeCurrentBalance(openingBalance, transactions);
const availableBalance = computeAvailableBalance(openingBalance, transactions);

// Convergence test
const isFullyReconciled =
  actualBalance === availableBalance &&
  actualBalance === register.current_bank_bal &&
  availableBalance === register.available_bank_bal;
```

---

## 16. UI Specification

### Layout — Register View
```
┌───────────────────────────────────────────────────────────────────────────┐
│  Check Register — March 2026                          [Account Name]      │
├───────────────────────────────────────────────────────────────────────────┤
│  $3,247.43  Actual Balance                                                │
│  $3,101.20  Available Balance                                             │
├───────────────────────────────────────────────────────────────────────────┤
│  ⚠️ Reconciliation needed  |  $146.23 gap  |  8 scheduled                 │
│     1 pending  |  0 unsynced                                               │
├───────────────────────────────────────────────────────────────────────────┤
│  [Check#] [Date] [Description──────] [S] [-] [+] [Bal] [Notes] [Sched.] │
│  ───────────────────────────────────────────────────────────────────────  │
│  rows...                                                                   │
├───────────────────────────────────────────────────────────────────────────┤
│  [JAN] [FEB] [MAR*] [APR] [MAY] [JUN] [JUL]                              │
│  [AUG] [SEP] [OCT] [NOV] [DEC] [YEARLY SUMMARY]                          │
└───────────────────────────────────────────────────────────────────────────┘
```

### Header — Balance Display (Phase 1)
- **Single column**, two computed ledger values — no bank input fields
- **Actual Balance** (large, bold, green/red): opening + all non-void debits/credits — the user's source of truth
- **Available Balance** (secondary): opening + cleared debits/credits only — what is confirmed settled
- Bank balance input fields (`current_bank_bal`, `available_bank_bal`) are reserved for **Phase 3 bank sync** and are not displayed in Phase 1. The columns exist in the database but are not read or written from the UI.

### Reconciliation Status Bar
```
When unreconciled:
⚠️ Reconciliation needed  ·  $X,XXX.XX gap  ·  N scheduled  ·  N pending

When reconciled (all non-void transactions cleared):
✅ Fully reconciled — all transactions cleared
```
- `is_reconciled` = all non-void transactions have status `cleared` (AND at least one exists)
- When true, Actual Balance = Available Balance by definition (same computation)
- No bank comparison required in Phase 1

### Row Visual States
| Status | Row Treatment |
|---|---|
| `recorded` | Default styling |
| `scheduled` | Default + red icon in status column |
| `in_flight` | Amber/orange row background tint + red icon + tooltip indicator |
| `pending` | Subtle blue-gray tint + yellow icon |
| `cleared` | Subtle green tint or no tint (understated) + green icon |
| `void` | All text struck through, row grayed out |

### Inline Editing
- Click any editable cell → cell becomes an input field
- Tab key moves to next editable cell in row
- Enter key saves current cell
- Escape key cancels edit and reverts to prior value
- Autosave on blur (clicking away from cell)
- Debit and credit fields disable each other reactively

### Sched. Date Field (Column J)
- **Edit mode:** HTML date picker input; narrow column (date only, no label text)
- **Clear button:** × appears next to the input when a date is set; `onMouseDown` clears the field without triggering blur-save prematurely
- **Read mode:** Formatted date (`MM/DD/YYYY`) if set; empty cell if null
- **Tab order (new row):** Notes → Sched. Date → Save (Tab/Enter on Sched. Date submits the row)
- **Tab order (edit row):** Notes → Sched. Date → blur triggers autosave
- **Status icon preview:** Scheduled icon appears in Column E while editing as soon as a date is typed — no save required
- **Status dropdown:** `Scheduled` option appears in the dropdown only when `scheduled_date IS NOT NULL`; hidden when null (no date = no scheduled state possible)

### Month Navigation
- Tab bar at bottom of register: January through December + Yearly Summary
- Current month highlighted/underlined
- Past months show lock icon 🔒 on hover
- Future month tabs are accessible (for pre-entry of scheduled items) and show no lock icon; navigating to a future month with no existing register triggers the Initialize modal to create one

### Locked Month Banner
```
🔒 This register is closed (January 2026)
All entries are read-only.
[ Unlock to Edit ]
```

### Mobile Responsiveness
- Progressive Web App (PWA) — installable on mobile home screen
- Offline-first: register readable without network; edits queue and sync on reconnect
- On mobile: columns collapse gracefully; Description and Balance always visible
- Status icons remain full-size on all screen sizes
- Touch targets minimum 44x44px for all interactive elements

---

## 17. Validation Rules

### Transaction Row Validation
| Field | Rule |
|---|---|
| Date | Required; valid MM/DD/YYYY format; future dates allowed |
| Description | Required; max 255 characters; not blank |
| Debit | Positive decimal, max 2 decimal places; cannot coexist with Credit |
| Credit | Positive decimal, max 2 decimal places; cannot coexist with Debit |
| Check # | Positive integer only; optional |
| At least one of Debit/Credit | Row must have either debit or credit to compute balance |
| Notes | Free text; no format constraints; no effect on status |
| Sched. Date | Optional; valid date; stored as `YYYY-MM-DD`; drives `scheduled`/`in_flight` status on save |

### Balance Validation
| Rule |
|---|
| Balance column H is never editable |
| Opening balance is never editable after being set (except by admin unlock) |
| Running balance recomputes on every save |
| Void rows produce null balance and do not affect running total |

### Account Validation
| Field | Rule |
|---|---|
| Routing number | Exactly 9 digits; numeric only |
| Account number | 8–17 digits; numeric only |
| Nickname | Required; max 50 characters |

---

## 18. Bank Sync (Optional — v2)

Bank sync is an **optional enhancement** for reconciliation assistance. It is not required for the core register to function.

### Integration: Plaid
- Plaid Link for secure bank connection
- Read-only access — no write permissions to bank ever
- Transactions fetched for matching purposes only

### Sync Model
- Bank transactions are fetched and stored separately from ledger transactions
- App attempts to **match** bank transactions to existing ledger entries
- Matched = AI suggests marking ledger entry as `pending` or `cleared`
- Unmatched bank transaction = AI flags: *"Bank shows a $45.96 Walgreens on 3/18 — do you want to add this to your register?"*
- User always has final authority — no auto-merge, ever

### What Bank Sync Never Does
- Never overwrites a user-entered transaction
- Never auto-creates ledger entries
- Never auto-changes a transaction status
- Never deletes any ledger data

---

## 19. Tech Stack Recommendation

### Frontend
| Layer | Technology | Reason |
|---|---|---|
| Framework | React + TypeScript | Component-based, type-safe, excellent ecosystem |
| Styling | Tailwind CSS | Utility-first, responsive, consistent |
| PWA | Vite PWA plugin | Offline support, mobile installable |
| Local cache | IndexedDB (via Dexie.js) | Offline-first reads |
| State | Zustand or React Query | Lightweight, predictable |

### Backend
| Layer | Technology | Reason |
|---|---|---|
| Platform | Supabase | Managed Postgres + Auth + RLS + Realtime |
| Database | PostgreSQL | ACID compliant, ideal for financial ledger |
| Auth | Supabase Auth | Built-in MFA, JWT, session management |
| Security | Row-Level Security | User data isolation at database level |
| API | Supabase auto-generated REST + custom Edge Functions | |

### AI
| Layer | Technology |
|---|---|
| Model | Anthropic Claude (claude-sonnet) |
| Integration | Anthropic API via Supabase Edge Function |
| Context | Per-session reconciliation context passed with each request |

### Bank Sync (v2)
| Layer | Technology |
|---|---|
| Provider | Plaid |
| Access | Read-only |
| Storage | Separate `bank_transactions` table — never mixed with ledger |

---

## 20. Build Phases

### Phase 1 — Foundation (MVP)
- User authentication (email + password + MFA)
- Account management (CRUD)
- Monthly register view (one month at a time)
- Transaction CRUD (inline editing, autosave)
- Column definitions B–I fully implemented
- Three balance computations (Current / Available / Actual)
- Status system (recorded / scheduled / pending / cleared / void)
- Scheduled auto-trigger from `scheduled_date` (Column J)
- Mutual exclusivity rule (debit/credit)
- Running balance computation (never stored)
- Monthly carry-forward (normalized single rule)
- Month navigation (tab bar)
- Yearly summary (derived, read-only)
- Locked months with Option B unlock
- Audit log (append-only)
- Mobile responsive / PWA

### Phase 2 — Reconciliation & AI
- Header balance input (user enters bank's current/available)
- Reconciliation status indicator
- Gap diagnostic display
- AI reconciliation assistant (gap explanation, status suggestions)
- In-flight prompt system (scheduled date passed)
- AI suggestion accept/ignore flow
- Audit log entries for AI-accepted suggestions

### Phase 3 — Bank Sync (Optional)
- Plaid integration (read-only)
- Bank transaction fetching and storage
- AI-assisted matching (bank → ledger)
- Unmatched transaction flagging
- Sync status indicator

### Phase 4 — Polish, Export & Statement Reconciliation
- CSV export (per month, per year)
- PDF export (register view)
- Account settings (routing/account number management)
- Audit log viewer (user-facing)
- Performance optimization
- Accessibility audit (WCAG 2.1 AA)
- Statement-level reconciliation (see §21): manual statement balance entry, period-end balance comparison, reconciliation event persistence, discrepancy surfacing
- Auto-carry on month rollover: silently auto-create the current month register from prior month's last-cleared balance on app access; Initialize modal suppressed when auto-carry applies (see §11)

---

## 21. Statement-Level Reconciliation (Phase 4)

### Purpose and Scope

The existing reconciliation system (§13, §14) operates at the **transaction level**: it matches individual transactions between the user's ledger and the bank's reported activity and drives status updates (`pending` → `cleared`). This keeps the register current but cannot definitively verify that the register's closing balance for a period equals the bank's own period-end statement balance. Statement-level reconciliation closes that gap by comparing two frozen, period-end snapshots — the register's computed closing balance and the bank's issued statement ending balance — where the math must agree exactly.

### Two-Tier Reconciliation Model

| Tier | Scope | When | Data source | Balance comparison |
|---|---|---|---|---|
| **Daily (transaction-level)** | Individual transactions | Continuously; driven by user | Bank's live data via Plaid (Phase 3) or manual | Not performed — bank-internal pending timing and "available balance" calculations introduce noise that produces false discrepancies |
| **Monthly (statement-level)** | Period-end closing balance | After bank issues monthly statement (typically 5–10 days after month-end) | Bank-issued statement (manual entry or CSV import) | Performed — both sides are frozen snapshots of the same period; math must agree exactly |

**Why both tiers are necessary:**
- Daily reconciliation keeps the register current as activity happens but cannot rigorously verify balance correctness because of bank-internal timing.
- Statement reconciliation provides definitive period-end verification but is only possible once the bank issues the monthly statement.
- Together they deliver both **currency** (daily accuracy) and **rigor** (monthly proof).

### Statement Reconciliation Workflow

1. User receives the bank's monthly statement (PDF, CSV, or just the ending balance number) — typically 5–10 days after month-end.
2. User navigates to the relevant past month's register.
3. User opens the "Reconcile Statement" affordance (button, modal, or settings panel — specific UI design TBD for Phase 4 implementation).
4. User enters the bank statement's **ending balance** for that month.
5. System computes the register's closing balance for the same month using the existing Formula C / closing-balance logic (§9).
6. System compares the two values:
   - **Match (difference = $0.00):** Month is marked `statement-reconciled`. A reconciliation event is recorded with timestamp, the statement balance entered, and the computed register balance.
   - **Mismatch:** System surfaces the discrepancy amount. Optionally, the AI layer (§14) may be invoked to help identify transactions present on one side but not the other. Resolution paths: (a) finding a missing or extra transaction, (b) correcting a status mistake, or (c) escalating to the bank (rare bank error). Discrepancy is not resolved automatically — user action required in all cases.
7. Reconciliation events are persistent and visible in audit history.

### State Machine Integration

The `statement-reconciled` marker sits **between `soft_closed` and `hard_closed`** in the month lifecycle:

```
[soft_closed]
  → (user enters statement balance; amounts match)
[statement-reconciled marker applied — registers.statement_reconciled_at set]
  → (next sequential month transitions to soft_closed)
[hard_closed]
```

This aligns with real-world banking rhythm: a month soft-closes when all transactions clear, the bank statement arrives a few days later, the user reconciles it then, and hard-close occurs when the next month also soft-closes.

**Important:** `statement-reconciled` is a **verification marker**, not a separate `month_status` enum value. It is stored as metadata on the `registers` row (`statement_reconciled_at TIMESTAMPTZ`, `statement_balance_entered NUMERIC(12,2)`) and does not modify the existing `month_status` state machine.

**DEFERRED DESIGN DECISION — Required vs. optional before hard-close:**

| Option | Trade-off |
|---|---|
| **Required** | Higher rigor; enforces good discipline; but blocks hard-close if user delays statement reconciliation |
| **Optional** | Flexible; but lets users skip the verification step entirely |
| **Optional with strong UI nudge** | Encouraged but not blocking — likely the right answer |

This decision is deferred to Phase 4 implementation, to be informed by user testing.

### Data Sources for Statement Balance

| Source | Availability | Notes |
|---|---|---|
| **Manual entry** | Always (Phase 4) | User types the statement's ending balance. Minimum viable form of this feature. |
| **CSV import** | Phase 4 | If user imports a bank statement CSV, the ending balance can be parsed automatically. |
| **Plaid** | Not applicable | Plaid provides transaction lists and current balances — it does not surface bank-issued statement balances as a first-class data source. Statements are bank-issued artifacts, not Plaid concepts. Plaid data serves daily (transaction-level) reconciliation; it does not substitute for statement-level reconciliation. |

### Relationship to Existing Phase 2 Reconciliation

The Phase 2 AI reconciliation system (§13, §14) — the "Reconcile" button, gap analysis, and suggestion flow — is **unchanged**. It serves transaction-level reconciliation and continues to do that job.

Statement-level reconciliation is **additive**: a second verification step applied after a month soft-closes. It does not replace, modify, or interact with the Phase 2 reconciliation panel.

The AI layer (§14) may optionally be extended to help explain statement-level discrepancies (e.g., identifying transactions on one side but not the other). This is an enhancement, not a core requirement.

### Persistence — Reconciliation Events

Statement reconciliation events are stored as structured, append-only records associated with a `register_id`, consistent with the audit log principle (§12).

```
statement_reconciliation_events table:
  id:                        UUID          auto-generated, primary key
  register_id:               UUID          foreign key → registers
  user_id:                   UUID          foreign key → users
  statement_balance:         NUMERIC(12,2) balance entered by user
  computed_register_balance: NUMERIC(12,2) register closing balance at time of event
  discrepancy:               NUMERIC(12,2) statement_balance − computed_register_balance
  status:                    Enum          'matched' | 'discrepancy'
  resolved_at:               TIMESTAMPTZ?  set when a discrepancy is subsequently resolved
  notes:                     TEXT?         optional user note
  timestamp:                 TIMESTAMPTZ   server-side, immutable
```

The `registers` table gains two columns to support this feature:
```sql
statement_reconciled_at    TIMESTAMPTZ   -- null if not yet statement-reconciled
statement_balance_entered  NUMERIC(12,2) -- the balance entered at reconciliation time
```

---

## Appendix A — Glossary

| Term | Definition |
|---|---|
| **Ledger Balance** | The authoritative balance computed from all user-entered transactions |
| **Current Balance** | Ledger balance relabeled as the bank-side reconciliation target |
| **Available Balance** | Balance computed from cleared transactions only; mirrors bank's available |
| **Actual Balance** | Ledger balance relabeled as the user's true spendable truth |
| **Convergence** | The state when Current = Available = Actual; fully reconciled |
| **Opening Balance** | The starting balance of a monthly register; carried from prior month closing |
| **Closing Balance** | The balance of the last non-void transaction row in a month |
| **Carry-Forward** | The automatic transfer of a closing balance to the next month's opening balance |
| **Reconciliation** | The process of confirming ledger matches bank; user-performed, AI-assisted |
| **In-Flight** | A scheduled payment whose date has passed but bank confirmation not yet received |
| **Void** | A cancelled transaction; excluded from all computations; never deleted |

---

## Appendix B — Key Rules Summary (Quick Reference for Developers)

1. Balance column H is **never stored** — always computed on read
2. Debit and credit are **mutually exclusive** per row — enforced at DB and UI layers
3. Opening balance is **read-only** after being set (except manual unlock)
4. Carry-forward is **one rule**: prior month last balance → current month opening
5. Scheduled icon is **auto-triggered** by `scheduled_date` (Column J) — `scheduled_date` is the single source of truth; Notes/Memos is free text only
6. **Nothing changes silently** — AI suggests, user confirms, always
7. Audit log is **append-only** — no modifications or deletions, ever
8. Routing and account numbers are **encrypted at rest** and **masked in UI**
9. Void is the only way to "delete" a transaction — **hard delete is never permitted**
10. All three balances **converge** when fully reconciled — this is the validation test

---

*End of Specification — Version 1.0*