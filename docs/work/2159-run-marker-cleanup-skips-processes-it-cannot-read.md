---
kind: bug
status: open
updated: 2026-11-08
priority: P2
area: tests
plan: test-foundation
---

# Run-marker cleanup skips processes it cannot read

## What

Run-marker cleanup throws EACCES when it meets an unrelated process it cannot read, which fails test suites at random on a shared box.

## Why

A cleanup that fails on another user's process turns an unrelated machine state into a test red.

## Done when

Cleanup skips an unreadable process, a test plants one and sees cleanup finish, and markers it owns are still removed.

## Evidence

Filled at landing: what ran and where its output is.

The same sweep failure also hangs the run after its cases finish. A corpus-joiner run passed all its cases, logged `metadataRead: EACCES` on an unrelated process and "Consumer completion unconfirmed", and its corpus-fixture process stayed alive about 25 minutes until it was stopped by hand.
