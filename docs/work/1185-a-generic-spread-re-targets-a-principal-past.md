---
kind: bug
status: blocked
updated: 2026-10-21
priority: P2
area: security
blocked: owner
---

# A generic spread re-targets a Principal past the brand and lint

## What

function withUser<T>(p: T, v: UserId): T { return { ...p, userId: v }; } applied to a minted Principal passes tsc (the spread types as T & {userId}) and all orb/principal-\* rules, because the return type is a bare type parameter; structural bounds on userId or role do the same. Only a <T extends Principal> bound is flagged. Pre-existing under both brand spellings.

## Why

One generic with-X helper anywhere in server code forges an identity below the seam.

## Done when

principal-literal reports an object literal containing a spread returned from a function whose return type is a bare or structurally bounded type parameter, in the server and inference scope, with mustFlag rows in native-principal-boundary.test.ts for the unconstrained, userId-bound and role-raise forms, and existing rows hold.

## Evidence

Filled at landing: what ran and where its output is.

Owner-directed tooling pause: this work is parked outside the test-foundation and test-mirror programs. Preserve source and evidence; resume only with explicit owner authorization. Custody: `reports/review/tooling-park-2026-10-21/`.
