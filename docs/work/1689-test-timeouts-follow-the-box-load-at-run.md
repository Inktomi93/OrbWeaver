---
kind: tooling
status: open
updated: 2026-10-31
priority: P2
area: tests
plan: test-foundation
---

# The public Stop canon case runs on the shared cancellation room

## What

canon-input-writers.suite's public Stop case booted a cancellation room of its own (4677 ms under load). It now runs on the file's `registerCancellationRoom()`, so the guest-host boot is paid once in a hook. `withCancellationPeer` had no other caller and is deleted. handoff-debt-rows.suite's detached SDK marker case was checked: it is the file's only SDK-engine case, with its own seeded history and marker policy, so no shared room can serve it. It ran 1967 ms at load average 48 and needs no change.

## Why

A per-case process boot inside the default test deadline turns box load into a timeout.

## Done when

The Stop case reuses the registered room and both suites pass.

## Evidence

Stop case, `tests/server/domain/chat/persistence/canon-input-writers.suite.int.test.ts`: 4677 ms before, 295 ms after (load average 48 both runs). Both suites pass, 25 tests.
