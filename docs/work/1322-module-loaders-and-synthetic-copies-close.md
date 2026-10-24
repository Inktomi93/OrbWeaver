---
kind: bug
status: open
updated: 2026-10-24
priority: P2
area: server
---

# Host module loaders and the remaining synthetic copies close

## What

The post-merge review of items 1314 and 1315 found:

- `createRequire(import.meta.url)(spec)`, a literal `require` through a `createRequire` alias, and `process.getBuiltinModule("node:module")` load `@orb/db/wiring-boot` from a domain file with ESLint, Biome and dependency-cruiser green. `entry-wiring-no-module-loader` (`.dependency-cruiser.ts`) bans `node:module` only under `entry/`. Two existing calls use only `.resolve`: `packages/server/src/entry/boot/migrate.ts:24` and `packages/inference/src/backends/agent-sdk/executable.ts:18`.
- D335 claims the confinement "covers computed specifiers too"; `vm` with `importModuleDynamically` and the async-function constructor still pass, and only deliberate in-repo evasion reaches them.
- `character.duplicate` copies a synthetic group row into the owner's library: `createDuplicate` reads `loadOwnedCharacterRow` (`character/verbs/duplicate.ts:58`) with no synthetic filter.
- Fork keeps a pre-gate group seat (`chat/verbs/fork.ts:486-492`) because `getCard` returns synthetic rows.
- The `model-cache.ts` waiver says the shape check refuses any other module; the import evaluates the module first, and the check only tests for two function exports.

## Why

The boot grant is a discipline control against accidental reach (the threat model is an in-repo author, sized to a roleplay app), and the natural `createRequire` idiom must not walk around it. A visible "Group" card is the leak item 1314 closed for handoff.

## Done when

A dependency-cruiser rule refuses `node:module` from server, db and inference source with named waivers for the two `.resolve` sites; a `no-restricted-syntax` entry refuses `getBuiltinModule` and an `importModuleDynamically` option; planted `createRequire` and `getBuiltinModule` loads in `domain/` fail; D335 states the control closes accidental computed and host-loader reach, not adversarial in-repo code; `character.duplicate` of a group id is not-found and fork drops a synthetic seat, both red-first; the `model-cache.ts` waiver reason states that the seam is test-only and the check refuses use, not load.

## Evidence

- Survey: `ast-grep` over `packages/server/src`, `packages/db/src` and `packages/inference/src` (2047 TS files) found `node:module` imported only by the two resolve-only sites and bare `module` imported nowhere. `rg` found no `getBuiltinModule` or `importModuleDynamically`. The two `node:vm` users (`primitives/regex/index.ts`, `local-light/model-worker.ts`) pass no dynamic-import hook.
- Loader rule: `host-module-loader-confined` in `.dependency-cruiser.ts` refuses `node:module` (and `module`) from all three source trees. Only the sites `MODULE_LOADER_RESOLVERS` names are exempt: `entry/boot/migrate.ts` and `agent-sdk/executable.ts`, each with its reason. It replaces `entry-wiring-no-module-loader`, which it covers. The whole-tree `pnpm depcruise` finds no violations, so the two waivers hold and no other site imports the module.
- Syntax rule: `MODULE_LOADER_SYNTAX` in `eslint.config.ts` holds three entries, applied to the server and inference block, the seed-root block and the db block:
  - the computed-specifier entry;
  - `getBuiltinModule`, as a dot, string-index or destructured member;
  - an `importModuleDynamically` property.
- Waiver: the `model-cache.ts` reason now says that only the testkit sets the kernel seam and production boot passes none. It also says the import evaluates the module first, so the shape check refuses use, not load.
- D335 says the control closes accidental computed and host-loader reach by an in-repo author, not deliberately adversarial in-repo code such as the async-function constructor. It also names both rules and both tests.
- Red first:
  - `tests/tooling/native-compose-query-boundary.test.ts` plants `createRequire(import.meta.url)(spec)` in `domain/character` and `db/src/client`, and a bare `module` namespace in `inference/src/backends`. All 3 had no violation on the old config. Each now fails `host-module-loader-confined`, and the existing entry alias case still fails under the new rule.
  - `tests/tooling/eslint-computed-import.test.ts` plants four host loaders in a server domain, the db package and the inference package: `process.getBuiltinModule`, its string-index form, a destructured `getBuiltinModule` and `new vm.Script` with `importModuleDynamically`. All 3 scopes passed lint on the old config and fail now.
  - `pnpm test:tools` on both files: 28 of 28 pass.
- Synthetic copies:
  - `createDuplicate` treats a synthetic source as not found.
  - Fork filters its kept seats through `seatableCharacterIds`, the read behind `assertSeatableCharacters`, which drops foreign and synthetic ids in one query.
  - On the old source, "a synthetic group row cannot be duplicated, and a fork drops its seat" got `{ duplicated: "accepted", forkSeats: [card, group], groupCardListed: true }`. It passes now.
- Runs:
  - `pnpm test` on the handle suite: 7 of 7 pass.
  - A coupled run of 12 files and 73 tests passes: `row-clocks`, `handle-legacy-rows`, `collect-garbage`, `bus-golden.suite`, `freeze-provenance.suite`, `role-authority`, `media-placement`, `handoff-settlement.suite`, `import-bundle`, the chat-handoff factory, `game-template-boundaries` and `forged-boot-grant`.
  - `pnpm lint:eslint` over the three source trees, both configs and the changed tests exits 0.
  - `pnpm typecheck packages/server/tsconfig.json packages/inference/tsconfig.json tsconfig.json` exits 0.
  - `pnpm depcruise` and `pnpm knip:prod` pass, and scoped Biome exits 0.
