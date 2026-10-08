---
kind: tooling
status: doing
updated: 2026-10-07
priority: P1
area: ci
lane: wt/compiler-cold-proof
---

# Diagnose hosted compiler proof timeouts

## What

Identify the hosted timeout cause in the TypeID import-binding and policy-scope manifest proofs.

## Why

Hosted execution exceeded the default deadline while focused native runs remain clean.

## Done when

Reproduce the failed execution conditions and prove a targeted repair without weakening the import-binding or scope-manifest assertions.

## Evidence

Hosted execution times out in `tests/tooling/codemod/typeid-prefix-boundaries.suite.int.test.ts` and `tests/tooling/verify/lib/policy-scope.test.ts`. Focused native controls remain clean. Their assertions and deadlines remain unchanged. Hosted retry evidence is required before selecting a repair.
