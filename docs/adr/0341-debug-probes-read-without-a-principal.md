---
kind: adr
status: active
updated: 2026-11-11
---

# Debug probes read without a principal because the gate admits only the box operator

## Context

The `/api/_debug` probes answer an operator's questions about any user's rows: a character's stored render policy, a room's config, the automation fire log. They take ids from query parameters, and the caller is not a tenant of the rows they read. Comments cited D17 and D20 for this read; D17 rules the role model and D20 rules vector-row ownership, and neither states it.

## Decision

A read under `packages/server/src/foundation/observability/debug/` takes no principal and reads every owner's rows. The debug gate is its whole protection. The gate admits only a holder of `DEBUG_TOKEN`, or a principal that `can(p, "owner", global)` judges the box owner. That principal arrives by a session cookie, a verified forward-header JWT, or the loopback owner fallback where `resolveOwnerFallbackCredential` allows it. A delegated admin is refused. The exemption ends when the admitted set widens past those two callers; every probe then takes an owner id and filters on it. Homes: the comment above `characterDetailRow` in `packages/server/src/foundation/observability/debug/inspect/config.ts`, `createDebugAuthMiddleware` in `packages/server/src/foundation/observability/debug/routes.ts`, and `debugGateAdmits` in `packages/server/src/entry/auth/seam.ts`. `tests/server/entry/debug-gate-admission.int.test.ts` and the e2e specs over `tests/e2e/support/debug-gate.ts` check the admitted set.

## Consequences

A new probe behind the gate needs no owner filter. A probe moved to any other surface takes a principal. A change that widens the gate turns `tests/server/entry/debug-gate-admission.int.test.ts` red before any probe leaks.

## Alternatives rejected

Scope each probe to the caller's owner id: the caller is the box operator, so the filter would hide the rows being debugged and protect nothing. Cite D17 or D20: neither states this read.
