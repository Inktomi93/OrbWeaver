---
kind: work
status: open
updated: 2026-10-24
priority: P3
area: server
---

# The wiring-owner door still exports the driver-admission mint

## What

After item 1286 the `@orb/db/wiring-owner` facade (packages/db/src/client/wiring-owner/index.ts) re-exports everything except `bootDatabaseHandle`, but it still exports `databaseHandle`, the driver-admission mint, which eight domain files import from that subpath. `pnpm knip` also reports six unused exported types on that facade (`packages/db/src/client/wiring-owner/index.ts`), re-exported when the facade was cut; the facade re-exports only what a consumer imports.

## Why

A door that hands any importer the mint for a capability makes the capability a convention; the boot grant was closed for the same reason.

## Done when

Each of the eight domain imports either receives its handle from its caller or moves to a door ruled for minting; `databaseHandle` leaves the wiring-owner facade; a dynamic-import test proves its absence, as tests/db/client/wiring-capabilities.int.test.ts does for the boot mint; `pnpm knip` reports no unused export on the facade.

## Evidence

Filled at landing: what ran and where its output is.
