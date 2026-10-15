---
kind: tooling
status: doing
updated: 2026-10-15
priority: P1
area: code-facts
lane: codex/share-acme-harness-958
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

Native installed database controls reproduce direct-write detection with missing bound-write findings. The structural stand-in does not establish this defect. Native Function wrappers retain their library signatures, so signatures alone cannot establish receiver provenance. Implementation and ownership-policy qualification remain open.
