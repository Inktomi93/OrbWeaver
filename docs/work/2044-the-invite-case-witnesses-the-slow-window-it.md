---
kind: bug
status: open
updated: 2026-11-07
priority: P3
area: tests
plan: test-foundation
---

# The invite case witnesses the slow window it claims

## What

corpus-signed-out.local.spec.ts now holds only the first guard read of the invite case, so the case does not prove the slow window its title claims.

## Why

A case that skips the slow read passes while the slow path breaks.

## Done when

The case fails when the slow window handling is removed, and it uses no sleep.

## Evidence

Filled at landing: what ran and where its output is.
