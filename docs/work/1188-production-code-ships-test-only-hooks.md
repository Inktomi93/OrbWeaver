---
kind: bug
status: open
updated: 2026-10-21
priority: P2
plan: test-foundation
---

# Production code ships test-only hooks

## What

Adjudicate client test-only exports in their owning replacement cases: \_\_setFrameSchedulerForTest, \_\_readMessageEditDraftForTest, \_\_resetSelection, \_\_resetPresetSelection, \_\_resetRecentSteers and \_\_resetSessionFreshness.

## Why

Production should expose real composition edges rather than legacy-only reset and inspection APIs.

## Done when

Delete unused hooks. Where a selected rebuilt case needs controlled scheduling or state, inject the dependency through production composition and prove the behavior.

## Evidence

The selected hooks are removed. [Client case decisions](0989-adjudicate-unused-production-exports-behind-explicit-package-doors.md#selected-client-surfaces-and-replacement-cases) identify their maintained replacements and explicit restoration limits.

State cases use production actions and hooks. Session cases use the existing document capability with injected time and genuine authenticated recovery. No replacement reset registry or private inspection door is added.

Scoped native tests, compiler programs, production defect controls and exact source restoration qualify the selected purposes. Broader persistence, frame scheduling and lifecycle matrices remain separate restoration work. The anchor story uses the real navigation action in a fresh document; its redundant reset is removed.
