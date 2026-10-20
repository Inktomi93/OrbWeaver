---
kind: tooling
status: open
updated: 2026-10-20
priority: P1
area: tooling
plan: test-foundation
---

# caught-failure-ownership recognizes proven failure owners and its waivers are rejudged

## What

The gate cannot see the three most common owners in this codebase: a TanStack mutation that carries an errorToast, a function that returns a typed refusal or Result, and a narrow rethrow. About 180 of its 399 product waivers exist only for those owners. Teach the shared reader in tooling/src/verify/lib/caught-failure.ts each owner with provenance checks and planted controls. Then rejudge every remaining waiver at its subject: fix real swallowed failures, repair gate false positives in the checker, remove redundant catches, and keep only waivers whose stated owner is verified.

## Why

A waiver count larger than the gate's real findings hides any genuine swallowed failure. Rejudging at the subject follows the test-foundation plan's waiver rule.

## Done when

Planted controls prove each new owner kind and a fooled owner still fails. Waivers the gate now proves are deleted. Every remaining waiver cites a verified owner. Real defects are fixed with red-first tests. The ownership population record is regenerated.

## Evidence

Filled at landing: what ran and where its output is.

Re-measure on main 492d691d89 after 1133, 1154 and 1155 (`reports/review/heavy2/`): `check:structure --check=caught-failure-ownership` alone ran 42:32 at 16.7 GB peak, over the 16 GB per-run bar, with 34 blocking findings across client data, inference, server infra, network, relay, acme and floor code-facts, and a waiver-budget alarm: 641 excused against a budget of 701, so the budget rows fall to 641.
