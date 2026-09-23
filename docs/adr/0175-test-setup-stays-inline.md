---
kind: adr
status: active
updated: 2026-09-23
---

# Test setup stays inline; per-domain fixture families are not built

## Context

A duplication sweep over the test tree found the same `freshDb()`, harness and service preamble repeated inline across many integration suites, and a long tail of clone clusters. The question was whether to consolidate them into per-domain fixture families and parameterized tables.

## Decision

Inline per-test setup stays. A per-domain fixture is written only when a lane is already editing that file for a real reason, never as a mass sweep. The existing `test.extend` families (`app`, `ownerCaller`) are enough. These duplication classes are ruled acceptable and are not reopened: named esoterica pins in `turn.int.test.ts`, the db schema CASCADE-chain tests, the `isConstraintViolation` try/catch shape, the wiring repeats in `entry/compose/services.test.ts`, persistence-versus-verb mirrors, contract and db enum pins, the per-case `entry/http` mock contexts, sibling provider runners, and per-domain `makeHarness` bodies. `castId` at a test seam is the documented id design, not a hole. The real drift hole is a fabricated value, which `no-test-fabrication` and the typed factories in `tests/support/factories/` hold.

## Consequences

An inline arrange reads as a self-contained spec. A service-constructor change reds every inline site at typecheck, so duplication here cannot rot silently. CPD does not scan `tests/`, so this record is what stops a future sweep.

## Alternatives rejected

- Per-domain fixture families swept across every suite: pure DRY with no drift benefit, because the drift they would fix is compiler-caught, and they cost test locality.
- A parameterized loop over the CASCADE-chain tests: it hides which table's CASCADE broke.
- A generic harness over every domain's `makeHarness`: each domain's context is a distinct interface, so it becomes a configuration-object indirection.
