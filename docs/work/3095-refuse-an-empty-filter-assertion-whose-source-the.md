---
kind: tooling
status: open
updated: 2026-11-15
priority: P2
area: tests
plan: test-enforcement
---

# Refuse an empty-filter assertion whose source the case never proves populated

## What

A case that asserts `expect(rows.filter(pred)).toEqual([])` passes when `rows` is empty, so a broken read or an empty fixture greens the check. The planned rule `orb/no-unproven-empty-filter` in `tooling/src/eslint/test-derivation.ts` refuses that shape unless the same case proves the source populated. Collect the site list and its classes first.

## Why

Spine-Testing section 3 asks for a positive control beside every absence. An empty filter over an unproven source is an absence with no control, and sampled sites include real vacuous cases.

## Done when

The rule credits an in-case population proof. A codemod gives the ESLint test helpers a throwing parse guard in place of their fatal filter. Each other site gets `nonEmpty(...)` where the source must hold rows, or a positive control that the detector ran where empty is the healthy state. The rule is on at zero sites with a rule test that pairs each accepted form with a refused neighbour.

## Evidence

Filled at landing: what ran and where its output is.
