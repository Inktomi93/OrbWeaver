---
kind: work
status: open
updated: 2026-10-24
priority: P1
area: client
plan: css-system
---

# The client architecture gates the law names exist

## What

The UI law names gates that are not in `eslint.config.ts`, `tooling/src/eslint/` or `.dependency-cruiser.ts` (audit: `docs/plans/css-system/ui-law-enforcement-audit.md`, false-claim table): `no-effect-on-shared-selection`, `persistence-boundary`, `form-factory-for-multifield`, `no-form-reset-in-autosave`, `tanstack-form-only-in-shared`, `no-inline-invalidate-outside-seam`, `client-cache-surgery-only-in-data`, the `queryKey` `no-restricted-syntax` selector, `orb/modal-definition-home`, `orb/modal-definition-literal`, `orb/config-group-definition-home`, `no-multiplexed-mutation-error`, `no-parallel-section-map`. Several appear only as comments citing them.

## Why

A gate the law names and the tree lacks is a false guarantee; reviewers and lanes trust it.

## Done when

Each named gate either exists (ESLint `no-restricted-syntax`, a custom `orb/` rule, or a dependency-cruiser rule) with a planted control, and the current tree passes it or its sites are fixed; or the law drops the claim with a one-line reason the rule is not worth a gate. Comments that cite a gate cite only gates that exist. Candidate sites from the audit are judged, not assumed: the two `useEffect` files and the four raw-storage sites.

## Evidence

Filled at landing: what ran and where its output is.
