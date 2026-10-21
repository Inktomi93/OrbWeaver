---
kind: bug
status: blocked
updated: 2026-10-21
priority: P3
area: security
blocked: owner
---

# Security rule spellings the leg 2 review found

## What

principal-alias misses type P\<T = Principal>, conditional types, {p: Principal}\["p"] and ReturnType<() => Principal>. agent-bridge-lock and persistence-boundary miss Reflect.set/get, defineProperty, Object.assign(globalThis, ...), (0, globalThis)\[K], self.\_\_orb and concat, template or member keys. The composed-probe guard keys only on @orb/server/entry/compose, while scripts/probes/row-principal.ts loads foundation/env and four probes import it unguarded.

## Why

Each spelling passes a security rule silently, and an unguarded probe loads the real env.

## Done when

Each spelling is refused or listed as review-only in its law section with a red-first row, and the probe guard covers every probe that reaches foundation/env.

## Evidence

Filled at landing: what ran and where its output is.

Owner-directed tooling pause: this work is parked outside the test-foundation and test-mirror programs. Preserve source and evidence; resume only with explicit owner authorization. Custody: `reports/review/tooling-park-2026-10-21/`.
