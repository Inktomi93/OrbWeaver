---
kind: work
status: open
updated: 2026-11-06
priority: P3
area: ui
plan: test-enforcement
---

# Re-judge every DESTRUCTIVE_EXEMPT reason against the code: each exempt control is proven undoable or gets a confirm

## What

Re-judge every reason in DESTRUCTIVE_EXEMPT in tooling/src/eslint/ui-feature-policy.ts against the code. Prove each exempt control undoable, or give it a confirm.

## Why

Reset to default carried a false exemption reason and it destroyed data. Other reasons may be wrong in the same way. The result feeds item 1776.

## Done when

Every remaining entry in DESTRUCTIVE_EXEMPT names a reason that the code shows to be true, and each control without one has a confirm.

## Evidence

Filled at landing: what ran and where its output is.

Source: `tooling/src/eslint/ui-feature-policy.ts`. Why: Reset to default had a false exemption reason, and it destroyed data. Feeds 1776.
