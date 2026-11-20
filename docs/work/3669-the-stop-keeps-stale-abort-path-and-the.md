---
kind: work
status: open
updated: 2026-11-20
priority: P3
area: tests
plan: test-foundation
---

# The Stop-keeps stale abort path and the preset backup script test are proven

## What

A train review found that making a stale abort settle the owed reply leaves every related test green (the code is right, the path untested), and that tests/server/domain/preset/preset-backup-scripts.int.test.ts times out at five seconds under load on main, in code no branch touched.

## Why

An untested abort path can regress unseen, and a load-sensitive timeout reads as a real failure.

## Done when

A test drives a stale abort on an owed reply and fails if it settles; the preset backup script test passes under load or its slowness is found and fixed.

## Evidence

Filled at landing: what ran and where its output is.
