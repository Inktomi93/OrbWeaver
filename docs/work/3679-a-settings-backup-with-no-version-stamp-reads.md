---
kind: bug
status: open
updated: 2026-11-20
priority: P3
area: settings
plan: cross-surface-consistency
---

# A settings backup with no version stamp reads as the oldest version

## What

A settings backup file carrying schemaKind but no schemaVersion is refused as malformed, while the comment near PRE_STAMP_FILE_VERSION suggests it reads as v10. Every earlier build wrote schemaVersion 1, so only a hand-made file hits it; the backup test also does not assert that a refused newer backup leaves stored settings untouched.

## Why

The comment and the code disagree, and the no-change guarantee on refusal is untested.

## Done when

A file with no version reads as v10 or the comment says it is refused, and a test asserts stored settings are byte-identical after a refused import.

## Evidence

Filled at landing: what ran and where its output is.
