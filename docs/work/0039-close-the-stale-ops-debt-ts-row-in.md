---
kind: work
status: open
updated: 2026-09-23
priority: P3
area: docs
---

# Close the stale ops/debt.ts row in the gate-runtime refutation ledger

## What

The row ROW-CB-FORGE-POLICING-AUDIT-54 in `docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md` still says OPEN. It claims tooling/src/verify/ops/debt.ts imports the BASELINE_REL of the legacy density-tier and duplicate-action-doors gates. That coupling no longer exists: debt.ts imports only the ct-unfed and orphan-export ratchet baselines, and its comments record that both legacy gates' ledgers were replaced by reviewed grants. Mark the row CLOSED. Give it evidence that cites the commits converting density-tier and duplicate-action-doors to reviewed-grant authority, plus the current debt.ts import lines. Update the section's OPEN/CLOSED rollup to match. Do not revive any other rollup.

## Why

The ledger is an active queue whose maintainers must close a row in the same act as the fixing merge. A row left OPEN after its defect is gone sends later fix passes and cutover-checklist readers after work that is already done.

## Done when

The ROW-CB-FORGE-POLICING-AUDIT-54 row reads STATUS: CLOSED, with evidence naming the reviewed-grant conversion commits and debt.ts's current baseline imports. The section rollup agrees with its rows. `pnpm check:docs` and the ledgers:fresh stage both pass on the edited tree.

## Evidence

Filled at landing: what ran and where its output is.
