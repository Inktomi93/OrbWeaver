---
kind: bug
status: doing
updated: 2026-10-14
priority: P1
area: server
lane: lane/959-rpg-variants
plan: test-foundation
---

# Treat native peer SSE disconnect as cancellation without hiding stream faults

## What

Normal client cancellation of a native notification SSE connection emits incoming ECONNRESET after native aborted/close events. joinNativeHttpRequest records it as unexpected and poisons completed harness teardown. Repair physical stream completion at its production network owner; retain actual close joins and genuine error propagation.

## Why

The native notification corpus reaches its lifecycle assertions and zero live sockets, but root disposal rejects. Ignoring the aggregate in testkit would hide the physical-edge defect.

## Done when

A real native serve/disconnect regression observes Request.signal and physical close events, fails before the fix and passes afterward. Existing owned-cancellation and unexpected-fault race controls remain discriminating. The native notification lifecycle and root disposal complete without weakened assertions or timeout changes.

## Evidence

Filled at landing: what ran and where its output is.
