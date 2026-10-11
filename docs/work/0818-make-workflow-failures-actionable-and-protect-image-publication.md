---
kind: tooling
status: open
updated: 2026-10-11
priority: P1
area: ci
---

# Make workflow failures actionable and protect image publication

## What

Implement the owner-approved workflow feedback and maintenance batch. Add native harness annotations, bounded summaries, Playwright annotations, explicit workflow failures, and verified image publication ordering.

## Why

Opaque stage failures and incomplete publication evidence increase diagnosis time and can expose an unproved image.

## Done when

Pass scoped feedback tests, workflow lint, application static checks, and hosted workflow proofs. Verify development image attestations. Report runner trial decisions and default-branch registration limits.

## Evidence

Orphaned claim under lane main; no session holds it. Workflow work landed in a385b84278, 7d0732fe88 and 23e50ef2ac. Still owed per Done when: hosted workflow proofs and development image attestation checks, which need a push, plus the runner trial and registration report.
