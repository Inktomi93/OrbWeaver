---
kind: tooling
status: open
updated: 2026-11-09
priority: P3
area: tooling
plan: unwired-code
---

# Count removed keys per declaration home, not across the whole diff

## What

removed-keys compares key counts across the whole diff, so a key deleted from one schema and added in another file nets to zero.

## Why

Rename and move refactors are the common deletion shape, and they slip past the check.

## Done when

Counts are kept per declaration home, or the verb prints the limit; a fixture case with a moved key fails before the fix.

## Evidence

Filled at landing: what ran and where its output is.
