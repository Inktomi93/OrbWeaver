---
kind: bug
status: open
updated: 2026-11-23
priority: P3
area: tooling
plan: unwired-code
---

# A row passed whole into an optional-member slot writes that member

## What

The unwired graph reports mayActOnRow\.funderUserId (packages/server/src/domain/workloads/substrate/authorize.ts) as member-read-only. Yet retry.ts passes a decoded workload row that carries funderUserId. pnpm unwired graph --why=mayActOnRow\.funderUserId shows the read and no write. The row-value flow in flows.ts does not pair a whole row's members with an optional member of an inline parameter type.

## Why

A live member reads as never written. Its verdict is ask, so it cannot cause a false delete, but it adds noise to the read-only bucket.

## Done when

A planted case passes a decoded row into a slot with an optional member, and the member gets a write. The case fails without the fix.

## Evidence

Filled at landing: what ran and where its output is.
