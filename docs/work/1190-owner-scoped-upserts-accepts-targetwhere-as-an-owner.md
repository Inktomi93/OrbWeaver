---
kind: bug
status: open
updated: 2026-10-20
priority: P1
area: security
plan: test-foundation
---

# owner-scoped-upserts accepts targetWhere as an owner guard

## What

tooling/src/verify/gates/owner-scoped-upserts.ts lists targetWhere in GUARD_PROPS, but ON CONFLICT ... WHERE only selects the conflict index; DO UPDATE then overwrites any owner's colliding row. A node:sqlite probe overwrote the victim row with the guard in targetWhere and left it intact with the same guard in setWhere. No live exposure: the two live targetWhere uses are not owner terms.

## Why

This is the exact cross-tenant write the gate exists to refuse, accepted as safe.

## Done when

targetWhere no longer counts as an owner guard, a mustFlag row proves the overwrite shape refuses, the comment states that only setWhere guards DO UPDATE, and the live verdict is unchanged.

## Evidence

Filled at landing: what ran and where its output is.
