---
kind: work
status: doing
updated: 2026-10-12
priority: P2
lane: codex/legacy-boundary-987
plan: test-foundation
---

# Close the legacy folder migration forks

## What

Adjudicate the legacy migration forks: test-layout uses LEGACY_FILE_CEILING rather than an exact shrinking file set; test-reach credits tests/legacy; jscpd.tests.json includes legacy; the CI qualification generation must distinguish the changed job population; script consumers import legacy test helpers. Keep legacy regression cases in CI while strict gates judge rebuilt tests.

## Why

The folder boundary must not admit replacement files, credit rebuilt coverage from legacy cases, or leave production probes dependent on disposable test helpers.

## Done when

Each fork has a recorded ruling and matching enforcement or a scoped follow-up. Check the qualification generation against the workflow change and retain case coverage.

## Evidence

The workflow declares `Orbweaver qualification product-v3`; its generation predates the legacy job split and did not change with that split. `test-reach` includes `@legacy-tests`, and `jscpd.tests.json` selects the full test tree. Confirm the qualification predicate before choosing its repair.
