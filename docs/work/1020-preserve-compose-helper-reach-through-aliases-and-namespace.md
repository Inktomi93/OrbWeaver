---
kind: bug
status: doing
updated: 2026-10-14
priority: P1
area: tooling
lane: main
plan: test-foundation
---

# Preserve compose helper reach through aliases and namespace members

## What

Repair compose-wiring-only helper reach through canonical callable identity for renamed imports, namespace members and re-export aliases. Preserve construction-time wiring and the entry population boundary.

## Why

Bounded zero-diagnostic native fixtures show per-call entry helpers can bypass the existing identifier-name prefilter and member-reference collection.

## Done when

The retained alias and namespace controls fail against the original checker and pass after correction. Existing compose decisions, queries, wiring and authority controls remain intact. The complete selected policy retains truthful current findings and no tool errors or withheld verdicts.

## Evidence

Original zero-diagnostic fixtures miss renamed imports, namespace values and calls, and re-export aliases. Retained declared controls fail against the original checker and pass after correction. Construction-time counterparts remain allowed. Exact lint, formatting and tooling types pass; independent review remains pending.

Current complete selected evidence is `main-2619498-2026-10-14T17-55-47-609Z`. Original and corrected checkers produce identical current findings and populations through the same shared workspace. Both owners complete without tool errors or withholding. Current compose qualification is owned separately; this correction adds no permission or population change.
