---
kind: tooling
status: open
updated: 2026-11-11
priority: P3
area: tooling
plan: checked-law
---

# Ambient node:crypto randomness in e2e specs and helpers

## What

`randomBytes` and `randomUUID` mint joiner handles and names in `tests/e2e/corpus-joiner.local.spec.ts`, `corpus-signed-out.local.spec.ts`, `oidc-pending-join.oidc.spec.ts`, `csrf-gates.local.spec.ts`, `csrf-gates.forward.spec.ts`, `debug-gate.local.spec.ts`, `tests/e2e/support/sse.ts` and `tests/e2e/support/oidc-issuer.ts`, where secrets are legitimate.

## Why

The determinism law bans randomness in tests, and the selectors do not see node:crypto.

## Done when

Each non-secret site draws from a seeded or run-token source, and the selector refuses `randomUUID`, `randomBytes` and `getRandomValues` outside named secret homes.

## Evidence

Filled at landing: what ran and where its output is.
