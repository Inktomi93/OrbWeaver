---
kind: work
status: open
updated: 2026-10-12
priority: P2
area: tests
plan: test-mirror
---

# Spies on internal modules use the real module or a test-only seam

## What

Item 899 extended test-mock-doctrine to vi.spyOn on an authored module's namespace object and baselined markers (most in tests/client/agent-nav/index.dom.test.ts) that say to be boarded. Replace each spy with the real module or an injected test-only seam, delete the marker and lower the test-mock-doctrine budget row.

## Why

Spine-Testing section 3 and 10: a spy on our own module keeps passing when the module changes.

## Done when

No test-mock-doctrine marker remains and its budget row is zero.

## Evidence

Filled at landing: what ran and where its output is.
