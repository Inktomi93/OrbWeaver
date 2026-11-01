---
kind: work
status: open
updated: 2026-11-01
priority: P3
area: ui
plan: test-enforcement
---

# Re-judge every DESTRUCTIVE_EXEMPT reason against the code: each exempt control is proven undoable or gets a confirm

## What

The change, in a sentence.

## Why

The symptom or the ruling behind it.

## Done when

The observable bar a verifier can check.

## Evidence

Filled at landing: what ran and where its output is.

Source: `tooling/src/eslint/ui-feature-policy.ts`. Why: Reset to default had a false exemption reason, and it destroyed data. Feeds 1776.
