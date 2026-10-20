---
kind: bug
status: open
updated: 2026-10-20
priority: P1
area: tooling
plan: test-foundation
---

# Playwright entry membership excludes nested helper declaration origins

## What

The native file collector adds nested suite and case declaration files to entry membership. Shared debug-gate declarations then appear as unexpected application roots, withholding static stage verdicts.

## Why

Entry ownership and declaration provenance are different native facts.

## Done when

Native root entries reconcile without helper origins, exact case identities and origins remain unchanged, unexpected roots still refuse, and real application collection succeeds.

## Evidence

The shared-declaration regression fails before the reader correction. Focused controls preserve exact case origins and unexpected-root refusal. Real application membership reconciles native and authored entries. Evidence: `reports/review/1218-membership-terminal.txt` and `reports/review/1218-entry-membership-review.md`.
