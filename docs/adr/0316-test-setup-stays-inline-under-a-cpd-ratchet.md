---
kind: adr
status: active
updated: 2026-10-12
supersedes: docs/adr/0175-test-setup-stays-inline.md
---

# Test setup stays inline; test duplication is held by a ratchet, never swept

## Context

Inline per-test setup repeats across integration suites: freshDb, harness and service preambles, and a long tail of clone clusters. Consolidating them into per-domain fixture families was weighed and rejected, because the drift they would fix is compiler-caught and they cost test locality. The test-mirror plan then added a tests-only duplication ratchet, so duplication cannot grow while the accepted classes stay.

## Decision

Inline per-test setup stays. A per-domain fixture is written only when a lane is already editing that file for a real reason, never as a mass sweep. The existing test.extend families (app, ownerCaller) and the typed factories in tests/support/factories are the reuse path for new setup. These duplication classes are ruled acceptable and are not reopened: named esoterica pins in turn.int.test.ts, the db schema CASCADE-chain tests, the isConstraintViolation try/catch shape, the wiring repeats in tests/server/entry/compose/services.test.ts, persistence-versus-verb mirrors, contract and db enum pins, the per-case entry/http mock contexts, sibling provider runners, and per-domain makeHarness bodies. castId at a test seam is the documented id design, not a hole. A tests-only CPD ratchet holds the duplicated-line share of tests/ at or below its baseline: jscpd.tests.json (the same token, line and import settings as jscpd.json, path tests, no extra ignores), run by pnpm cpd:tests in the quality:cpd-tests stage. The accepted classes count toward the baseline, so new setup reuses test.extend or a factory instead of copying a preamble. Homes: jscpd.tests.json, the quality:cpd-tests stage, docs/plans/test-mirror/design.md.

## Consequences

An inline arrange still reads as a self-contained spec, and a service-constructor change still reds every inline site at typecheck. A new suite that copies an existing preamble can push the share over the threshold and red the ratchet; the fix is reuse through test.extend or a factory, never a raised threshold. The threshold only falls.

## Alternatives rejected

Per-domain fixture families swept across every suite: pure DRY with no drift benefit, because the drift they would fix is compiler-caught, and they cost test locality. A parameterized loop over the CASCADE-chain tests: it hides which table's CASCADE broke. A generic harness over every domain's makeHarness: each domain's context is a distinct interface, so it becomes a configuration-object indirection. Ignoring the accepted classes in the ratchet: it would let those classes grow unbounded.
