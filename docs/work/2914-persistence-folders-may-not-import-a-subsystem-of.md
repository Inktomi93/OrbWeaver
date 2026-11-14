---
kind: tooling
status: open
updated: 2026-11-14
priority: P3
area: server
---

# Persistence folders may not import a subsystem of their own domain

## What

The dependency-cruiser policies `domain-substrate-mediates-subsystems` and `domain-no-cross-subsystem` in `.dependency-cruiser.ts` leave `persistence/` out of their from-set, so a persistence file can drive an engine or a write subsystem. Add `persistence/` to both. The known violator is `packages/server/src/domain/stats/persistence/spend-ledger-portability.ts`, which imports `packages/server/src/domain/stats/write/apply-delta.ts`.

## Why

Law defines `persistence/` as database access. While the policies skip it, orchestration can move there and every check stays green.

## Done when

Both policies cover `persistence/` and `pnpm depcruise` reports no violation.

## Evidence

Filled at landing: what ran and where its output is.
