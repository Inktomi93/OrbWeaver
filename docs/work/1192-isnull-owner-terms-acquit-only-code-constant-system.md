---
kind: bug
status: open
updated: 2026-10-20
priority: P2
area: security
plan: test-foundation
---

# isNull owner terms acquit only code-constant system-plane writes

## What

isNull(T.ownerId) counts as an owner term, so a caller-driven write to ownerless shared rows (seed themes, the system default preset) passes with no finding. The live system-seed writes are theme-queries.ts:121 and :152 and preset queries.ts:223, each with code-constant ids and no Principal.

## Why

An unowned shared row written from caller input is a tenancy bypass; waivers for the seeds would raise the budget, which fix-not-excuse forbids.

## Done when

isNull acquits a write only when every key and set value is a code constant with no parameter or caller-derived input (system plane); a caller-driven isNull write is flagged; the three seed writes pass structurally with no new waiver and the budget does not rise; red-first rows for both.

## Evidence

Filled at landing: what ran and where its output is.
