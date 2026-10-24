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

Filled at landing: what ran and where its output is.
