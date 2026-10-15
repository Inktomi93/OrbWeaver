---
kind: tooling
status: doing
updated: 2026-10-15
priority: P1
area: code-facts
lane: codex/native-config-999
plan: test-foundation
---

# Resolve native instance-method invocation provenance

## What

Extend canonical native invocation facts to distinguish selected dependency methods, actual receiver provenance and Function wrapper argument transformation. Close bound database-write classification through the existing floor, not a policy-local resolver or invented authored target.

## Why

A typed database receiver currently refuses module/global callable origin, so a bound write can escape the direct-write ownership detector.

## Done when

Real installed-method and bound-write controls preserve receiver and ordered arguments. Shadowed, overwritten, unrelated, stale and foreign sources refuse without a type-name grant. Existing callers keep strict outcomes, and the ownership policy consumes the canonical result.

## Evidence

Reviewed source `98dbff8488` separates native declarations, signatures, wrapper arguments and effective receivers from unresolved receiver provenance. Installed database controls and existing strict invocation controls pass. A finding-specific correction preserves legacy binding fields and key order. Tooling types pass; root retains off-owned errors. Ownership-policy consumption and qualification remain open.
