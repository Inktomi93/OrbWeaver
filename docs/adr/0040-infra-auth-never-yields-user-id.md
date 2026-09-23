---
kind: adr
status: active
updated: 2026-09-23
---

# Infra auth never yields a user id

## Context

Not recorded in the ledger row.

## Decision

The identity-resolution invariant: `infra/auth` NEVER yields a `userId`/role — it owns only db-free verification; identity→row resolution is a DOMAIN step (`sessions.validate` returns identity + userId; forward-header resolves via `provisionIdentity`); the `Principal` is constructed ONCE per request at `entry/auth/seam.ts` and is immutable; authorization (`can()`/membership) runs PER-CALL on that Principal, never cached onto it. The agent-principal mint is a second construction context (a turn) under the same construct-once discipline. Role + `enabled` re-read from the row each request (revocation propagates immediately); SSO-group→role mapping derivation is governed by D65. Owner uniqueness ships its enforcer (partial unique on `role='owner'`). Every invariant ships its enforcer (e.g. the `keyword_cooccurrence` A\<B CHECK).

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
