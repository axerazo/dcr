# Golden-Master Fixture Schema (v1)

Fixtures live in `src/lib/__fixtures__/golden/*.json`. Each file is one
**scenario**: one or more consecutive months whose expected values were computed
by the independent Excel oracle (or hand-verified arithmetic for fabricated
seeds). The suite `src/lib/golden.test.ts` discovers every JSON file in that
directory automatically — adding coverage means adding a file, never editing
the test.

## Carry-forward rule (settled 2026-07)

The oracle rule, confirmed empirically from the workbook formulas:

```
carry_forward = balance of the LAST amount-bearing, non-void row
              = computeClosingBalance()          (Formula C/E, SPEC §9)
```

Status is irrelevant to carry-forward. The workbook's column E is visual
metadata only; `LOOKUP(9.99E+307, PRIOR!$H:$H)` takes the last numeric balance
regardless of cleared/pending. `computeLastClearedRunningBalance` in
`monthStatus.ts` implements a different (last-cleared) rule and is slated for
replacement; a characterization test pins its divergence until then.

## JSON shape

```jsonc
{
  "schema_version": 1,
  "scenario": "seed_chain_3mo",            // unique, matches filename
  "source": "fabricated",                   // or "excel:<workbook>:<SHEET,...>"
  "description": "why this scenario exists",
  "months": [
    {
      "label": "2026-01",
      "opening_balance": 1500.00,
      "opening_source": "manual",           // "manual" | "carry"
      "transactions": [
        {
          "row_order": 1,
          "date": "2026-01-03",
          "description": "Fabricated payee",
          "status": "cleared",              // app vocabulary, see mapping below
          "debit": 200.00,                  // null when absent
          "credit": null,
          "check_number": null,             // optional
          "notes": null                     // optional
        }
      ],
      "expected": {
        "running_balances": [1300.00, null, 1750.50],  // Formula D, per row;
                                                        // null = void or no-amount row
        "current_balance": 1750.00,        // Formula A
        "available_balance": 1750.00,      // Formula B
        "actual_balance": 1750.00,         // Formula C (≡ A)
        "closing_balance": 1750.00,        // Formula E input (last-row rule)
        "is_reconciled": false,
        "available_source": "excel"        // "excel" | "script-derived" | "hand"
      }
    }
  ],
  "expected_chain": {
    // opening balances of months[1..n] as recorded by the oracle;
    // asserted equal to computeClosingBalance of the preceding month
    "carry_forwards": [1750.00]
  }
}
```

## Excel → app status mapping

| Column E value      | App status |
| ------------------- | ---------- |
| `1`                 | `cleared`  |
| `2`                 | `pending`  |
| blank, amounts set  | `recorded` |
| blank, no amounts   | `recorded` with `debit: null, credit: null` (balance renders null) |

`scheduled`, `in_flight`, and `void` never occur in Excel-derived fixtures.
They are covered by the metamorphic suites in `golden.test.ts`:

1. **Void injection** — inserting a void row at any position changes no
   balance (SPEC §9 Formula D void rule).
2. **Status permutation** — relabeling any non-cleared, non-void status to any
   other non-cleared, non-void status changes no formula output (Formulas
   A/C/D/E are status-blind except for void; Formula B counts only cleared).

Every fixture automatically spawns these variants — a three-status workbook
fully validates the six-status app.

## Sanitization workflow (run locally; the real workbook never leaves your machine)

1. Copy the archive year file(s) to a scratch workbook.
2. Keep only the tabs on your candidate-month list.
3. Overwrite every description/payee with fabricated text and every debit/credit
   amount with fabricated numbers. **Preserve**: row order, column E values,
   blank rows, blank statuses, month boundaries. Dates may stay or be bulk-shifted.
4. Excel recomputes every balance in column H and every Previous Balance
   lookup — the oracle validates the fabricated data with the same formulas
   that validated twelve years of real data.
5. Verify the tabs LOOK sanitized, then run the extraction script (below).

## Extraction

```
node scripts/extract-fixtures.mjs \
  --workbook C:\path\to\sanitized.xlsx \
  --sheets JULY,AUGUST,SEPTEMBER \
  --scenario chain_2026_q3 \
  --out src/lib/__fixtures__/golden/chain_2026_q3.json
```

Multiple `--sheets` in order produce a chain scenario; the script reads each
subsequent tab's "Previous Balance" row as the oracle's carry-forward value.
`available_balance` is derived by the script (cleared-only sum) since the
workbook has no cleared-only cell; it is labeled `"script-derived"`. To make it
oracle-computed instead, add a helper cell to the tab:
`=H_prev_balance + SUMIFS(credits,E,1) - SUMIFS(debits,E,1)` and pass
`--available-cell <CELL>`.

Commit only the JSON output. Never commit the workbook.
