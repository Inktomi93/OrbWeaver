---
kind: bug
status: open
updated: 2026-10-24
priority: P2
area: server
---

# A computed import() specifier bypasses the db admission rules

## What

A domain file can `await import(["@orb","db","wiring-boot"].join("/"))` (or `wiring-driver`): dependency-cruiser sees no dependency and ESLint passes, and a runtime probe from `domain/character/` minted a boot grant and received the raw db. D335 confines the boot grant to `BOOT_GRANT_IMPORTERS`; that holds only for literal specifiers. The only computed import in server, db and inference source today is `packages/inference/src/backends/local-light/model-cache.ts:53`.

## Why

The boot grant carries cross-owner authority; its confinement must not depend on every author writing a literal specifier.

## Done when

An ESLint rule refuses an `ImportExpression` whose source is not a string literal under `packages/server/src`, `packages/db/src` and `packages/inference/src`; `model-cache.ts` carries a named waiver with its reason; a planted computed import fails lint; D335 states that the confinement covers computed specifiers through that rule.

## Evidence

- Premise reproduced: `ast-grep` for `import($X)` over `packages/server/src`, `packages/db/src` and `packages/inference/src` scanned 2046 TS files and found 9 dynamic imports. A second pattern matched no two-argument imports. Only `model-cache.ts:53` has a computed specifier. A probe planted in this worktree's `packages/server/src/domain/character/` imported `["@orb","db","wiring-boot"].join("/")` and ran under `node`. It printed `boot mint from domain/character: function`. dependency-cruiser on the probe cruised 0 dependencies, and `pnpm lint:eslint` on it exited 0. The probe was deleted.
- Rule: `COMPUTED_IMPORT_SYNTAX` in `eslint.config.ts` is a `no-restricted-syntax` entry with the selector `ImportExpression:not([source.type='Literal'])`. It rides `SERVER_SYNTAX`, so it reaches the server and inference block and the seed-root block, and a new block applies it to `packages/db/src`. A no-substitution template literal is refused too: the rule admits only a string literal.
- Waiver: `model-cache.ts` carries one `eslint-disable-next-line no-restricted-syntax` with its reason. The kernel module comes from the composition root's provider seam and the shape check refuses any other module. `reportUnusedDisableDirectives` keeps that waiver honest.
- Red first: `tests/tooling/eslint-computed-import.test.ts` lints a joined, a concatenated and a template-literal specifier under a server domain, the db package, the inference package and a seed root. It expects one finding each and none for a literal specifier. It also lints the real `model-cache.ts` (no finding) and a planted computed specifier at that path (one finding), which proves the waiver is per line. All 5 failed on the old config and pass now (`pnpm test:tools`).
- D335 now states that the confinement covers computed specifiers through this rule, and names the waiver and the test.
- Runs: `pnpm lint:eslint packages/server/src packages/db/src packages/inference/src eslint.config.ts` and the test exit 0. `pnpm typecheck tsconfig.json packages/inference/tsconfig.json` exits 0. `pnpm depcruise` finds no violations. `pnpm knip:prod` exits 0. Scoped Biome exits 0.
