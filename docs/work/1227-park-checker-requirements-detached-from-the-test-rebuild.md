---
kind: tooling
status: blocked
updated: 2026-10-21
priority: P2
blocked: owner
---

# Park checker requirements detached from the test rebuild

## What

Preserve checker-only requirements detached from the test rebuild: determinism and spy checker expansion, release and CI selection fixtures, gate inventories, type and waiver budgets, export censuses, and proposed test-only-hook lint or importer checks. Original mixed descriptions are retained under `reports/review/tooling-park-2026-10-21/work-before/`.

## Why

Tooling expansion displaced production test reconstruction. The owner stopped that work and removed it as a test-program prerequisite.

## Done when

Resume only with explicit owner authorization as independently scoped tooling work. Qualify it separately from testkit and replacement-suite completion.

## Evidence

Filled at landing: what ran and where its output is.
