---
kind: tooling
status: doing
updated: 2026-10-10
priority: P1
area: ci
lane: main
---

# Make workflow failures actionable and protect image publication

## What

Implement the owner-approved workflow feedback and maintenance batch. Add native harness annotations, bounded summaries, Playwright annotations, explicit workflow failures, and verified image publication ordering.

## Why

Opaque stage failures and incomplete publication evidence increase diagnosis time and can expose an unproved image.

## Done when

Pass scoped feedback tests, workflow lint, application static checks, and hosted workflow proofs. Verify development image attestations. Report runner trial decisions and default-branch registration limits.

## Evidence

Filled at landing: what ran and where its output is.
