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

Filled at landing: what ran and where its output is.
