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

- Survey: `ast-grep` for `databaseHandle` over `packages tooling tests scripts` scanned 5423 TS files (113 matches) and 1040 TSX files (0 matches). A literal `rg` for imports from `@orb/db/wiring-owner` found the same eight domain importers: `character/persistence/handoff-copy-write.ts`, `character/service.ts`, `chat/context.ts`, `chat/persistence/import-write.ts`, `chat/persistence/token-usage-backfill.ts`, `chat/verbs/generation-observation-sink.ts`, `embeddings/verbs/record-usage.ts` and `imagery/service.ts`. Every other caller already imports `@orb/db/wiring-driver`.
- Threading: each of the eight minted a handle only to pass its own connection back across the stats seam. Each now forwards the handle its caller supplied (`input.db`, `assembly.db`, or the factory's `input`). An `ast-grep` sweep of every `applyStatsDelta`, `applyCharacterStatsDelta`, `settleRetainedChatRebase` and `bumpStatsCanonVersion` call in `packages/server/src` (1812 files) showed every verb passes `ctx.db` or a local `db` destructured from it. So the forwarded handle names the same connection the minted one did. No composition file changed.
- Facade: `packages/db/src/client/wiring-owner/index.ts` no longer re-exports `databaseHandle`. D335 states both mints are absent.
- Red first: `tests/db/client/wiring-capabilities.int.test.ts` now asserts `await import("@orb/db/wiring-owner")` has no `databaseHandle`. On the old facade it failed (`expected true to be false`, 1 of 5). After the fix it passes 5 of 5.
- Knip: the six unused facade types the item cites were already gone on this base. `pnpm knip` before and after reports only `ChatWireFrame` in `tests/e2e/support/stream-tap.ts`, which is outside this item. `pnpm knip:prod` exits 0.
- Runs: `pnpm test` on the wiring suite, `forged-boot-grant`, `runtime-accounting`, `import-overlay-remap`, `import-persona-heal`, `handoff-json-boundaries`, `row-clocks`, `imported-opening-row`, `retained-cohort`, and the chat-handoff and imagery factories (11 files, 58 tests pass). `pnpm typecheck packages/db/tsconfig.json packages/server/tsconfig.json tsconfig.json` exits 0. `pnpm depcruise` finds no violations. Scoped `pnpm lint:eslint` and Biome exit 0.
