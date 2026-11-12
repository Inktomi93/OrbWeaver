---
kind: bug
status: open
updated: 2026-11-12
priority: P2
area: testing
plan: test-foundation
---

# The private intake test builds its older database without running current services on it

## What

`tests/support/node/corpus-private.int.test.ts` makes a database that lags the shipped chain by its last migration, then seeds it through the current production services. Migration 0011 moved the asset kind into `asset_kinds`, so the current services cannot run on a database without it: the boot purge of image vectors fails with no such table. The case is red on main since D350. Any later migration that a boot query or a seeding verb depends on breaks it the same way.

## Why

The case proves that private intake keeps an owner's real content while it applies a pending migration, and it is the only one that does.

## Done when

The case seeds its content on the full chain and produces the lagging state in a way that does not need current services to run on an old schema, or lags by a migration chosen for the purpose; it passes on main and still goes red when intake skips the pending migration.

## Evidence

Filled at landing: what ran and where its output is.
