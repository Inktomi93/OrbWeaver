---
kind: work
status: open
updated: 2026-10-02
priority: P2
area: audit
---

# Adjudicate the launch AST audit findings

## What

Run the current pnpm ast audit commands over the product tree. Validate candidates against live consumers, tests, repository rulings and the board. Record command scopes, complete outputs and dispositions in the session audit report. Evaluate unused future-facing code instead of accepting a future marker as justification. Keep explicitly owner-parked programs held.

## Why

Prelaunch cleanup needs confirmed findings, not unreviewed tool output or speculative retention.

## Done when

Every audit command has a complete result or a precise instrument limitation. Every candidate has an evidence-backed disposition. Confirmed defects are filed with complete acceptance criteria. Existing work is linked rather than duplicated. Symbol and flow queries support the dispositions. No finding is dismissed solely by a future marker.

## Evidence

Command coverage and candidate dispositions live in `reports/launch-ast-audit-2026-10-01/coverage.json` and `reports/launch-ast-audit-2026-10-01/adjudications.json`. Complete command output does not establish completed adjudication. Each result keeps its scope metadata and the source revision it examined.
