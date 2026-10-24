---
kind: work
status: open
updated: 2026-10-24
priority: P3
area: server
---

# The boot grant closes its dynamic-import and recovery gaps

## What

D335's boot grant refuses a cast handle at runtime through `bootDatabaseForOwner` in `packages/db/src/client/wiring-capabilities.ts`, and an ESLint `no-restricted-imports` entry bans importing the mint from `@orb/db/wiring-owner`. Three gaps remain. ESLint's rule ignores `import()`, so `const { bootDatabaseHandle } = await import("@orb/db/wiring-owner")` in a tooling or test file passes every check. Nothing forces a new grant verb to recover its connection through `bootDatabaseForOwner`: `databaseForOwner` accepts a cast grant because the plain handle is registered, so a verb typed on the grant that calls the wrong recovery silently accepts a forgery. The forged-cast runtime check lives in one suite (`tests/server/domain/chat/persistence/repair-stale-join-seq.int.test.ts`), not over the seventeen verbs.

## Why

A capability that holds for static imports and for the verbs a reviewer happened to check is a capability by habit; the cake closes these with the exports map and a type.

## Done when

The wiring-owner subpath export in `packages/db/package.json` points at a facade that re-exports everything except the mint, so static and dynamic imports close alike and the ESLint entry is removed; `databaseForOwner`'s signature rejects a `BootDatabaseHandle`-typed argument (a type parameter or an overload) so a grant verb must use `bootDatabaseForOwner`, proven by a planted verb that fails `tsc`; the forged-cast refusal is a table over every verb in `tests/server/entry/boot/cross-owner-boot-verbs.test-d.ts`'s list, each shown to reject and leave rows unchanged; D335 names the static-versus-dynamic scope correctly after the facade lands.

## Evidence

- Facade: `@orb/db/wiring-owner` in `packages/db/package.json` resolves to `packages/db/src/client/wiring-owner/index.ts`, which re-exports every conversion of `wiring-capabilities.ts` except `bootDatabaseHandle`. The file is an `index.ts` because Biome's `noBarrelFile` admits re-export doors only there. The lifecycle, seed tools and testkit still mint through `@orb/db/wiring-boot`, whose door imports `wiring-capabilities.ts` relatively; nothing imported the mint from `wiring-owner`. The `BOOT_GRANT_IMPORT` ESLint entry and its five uses are removed. `query-wiring-owner-conversion` in `.dependency-cruiser.ts` now targets the facade and `wiring-capabilities.ts`; against the old target, `tests/tooling/native-compose-query-boundary.test.ts` fails its foundation re-export case (1 of 17), and passes 17 of 17 with the new one.
- Type: `databaseForOwner(handle: DatabaseHandle & { readonly [BOOT]?: never })`, with both recoveries sharing a private lookup. `tests/server/entry/boot/cross-owner-boot-verbs.test-d.ts` plants a grant verb that calls `databaseForOwner` under `@ts-expect-error`, and asserts that the `wiring-owner` module type has no `bootDatabaseHandle`. Against the old source, `pnpm typecheck tsconfig.json` failed both: TS2578 on the unused directive and TS2554 on `not.toHaveProperty`. The whole-tree `pnpm typecheck` then exits 0, so no production verb passed a grant to the plain recovery.
- Table: `tests/server/entry/boot/persistence/forged-boot-grant.int.test.ts` runs 17 rows, one per verb in the type test's list of 17. Each row awaits a rejection with "boot wiring handle is not granted" and then compares a snapshot of every table's rows. A control shows that the snapshot sees a registered grant's write. When `hasSealedCredentials` was rewired to `databaseForOwner` as a probe, exactly its row failed. `SERVER_TEST_REACHES` lists the ten domain doors the suite runs, each with its verbs. The forged case in `repair-stale-join-seq.int.test.ts` moved into the table.
- Runtime: `tests/db/client/wiring-capabilities.int.test.ts` loads `await import("@orb/db/wiring-owner")` and finds no `bootDatabaseHandle`. Against the old exports map, it fails.
- Capability module: a relative path or the root `#db/*` alias still reached `bootDatabaseHandle` in `wiring-capabilities.ts`. The new `query-wiring-capabilities-inside-db` rule in `.dependency-cruiser.ts` refuses any import of that file from outside `packages/db`. Probes planted under `tests/server/entry/boot/`, `packages/server/src/domain/chat/`, `tooling/src/seed/` and `scripts/` covered static and dynamic imports, by relative path and by `#db/*`. dependency-cruiser resolved every edge, the dynamic `#db/*` ones included. The probes passed before the rule. With the rule, each probe failed. The probes were then deleted.
- Type limit: `[BOOT]?: never` rejects only a value typed as the grant. A widening annotation or a generic helper passes, and the forged-grant table is the runtime check for the listed verbs. D335 states this limit.
- Runs: `pnpm test tests/server/entry/boot tests/db/client/wiring-capabilities.int.test.ts tests/server/domain/chat/persistence/repair-stale-join-seq.int.test.ts --no-file-parallelism` (7 files, 38 tests pass); `pnpm test:tools tests/tooling/native-compose-query-boundary.test.ts tests/tooling/native-server-test-mirror.test.ts` (17 and 17 pass); `pnpm typecheck` (exit 0); `pnpm depcruise` (no violations); `pnpm lint:eslint` on the changed files and both configs (exit 0); scoped Biome (exit 0).
