---
paths:
  - "tooling/src/**"
  - "tests/tooling/**"
  - "biome.json"
  - "eslint.config.js"
  - ".dependency-cruiser.cjs"
  - "knip.ts"
  - "lefthook.yml"
  - "tsconfig*.json"
  - "scripts/vitest-supervised.ts"
---

# Tooling and root configs

## Two config mechanisms

TypeScript configs are generated: `tooling/src/_shared/type-config-intent.ts` is the source, `pnpm
typecheck` and `verify baseline type-configs --check` verify freshness. Never hand-edit a generated
field; change the intent.

`biome.json`, `eslint.config.js` and `.dependency-cruiser.cjs` are hand-authored on purpose, so a
current violation cannot mint its own permission. Fix a rotted per-config liveness gate — never
regenerate the config.

## Biome and tsc

Run Biome before typecheck. Biome's `noUselessUndefined` deletes a trailing `return undefined;` as a
safe fix, which then fails tsc's `noImplicitReturns` on the fall-through. Restructure to one tail
return, or add a `biome-ignore lint/complexity/noUselessUndefined:` naming `noImplicitReturns`.

`biome.json` is strict JSON: a comment in it is skipped silently and Biome loads the next ancestor
config instead — probe with `biome rage --linter` and read its Path line. `useUnicodeRegex` stays off;
TypeScript incremental mode stays off; re-enabling either needs proof.

## Commands

The `lane` skill owns the scoped ESLint, Biome and heap-floor spellings; this file does not restate
them.

## Process control

Never signal a process group with the `kill` binary; a negative pgid without `--` parses by its first
digit and can kill the wrong group — use `killPidGroup` (`tooling/src/_shared/proc.ts`). Never run
`pnpm` inside a `git archive` extraction that symlinks a worktree's `node_modules`; its dep-status
check can purge the real directory through the symlink. Never restart the dev stack
(`tooling/src/stack/**`) with engines on while a test battery runs — both spawn vLLM fleets onto the
same ports. A test-run watchdog kills on silence and zero CPU across the process tree, never silence alone.

## Gates and freshness checks

A ledger's freshness check (`pnpm check:ledgers-fresh`) runs the same derivation as its regenerator and
exits 2 on an empty result. The orchestrator regenerates it on the merged tree; a lane hand-edits only
its own row.

Gate authoring and the lying-instrument fix contract live in `rules/verify-and-gates.md`; this file does
not restate them. Retiring a command or flag: delete it and grep-fix every spelling across code, docs
and rules in the same change; never add a refusal path or alias shim.

## Workspace packages

Declare `sideEffects` on every new workspace `package.json` at birth, or prod tree-shaking cannot reach
consumers below the cake. A new `packages/*` package also needs a population root and an entry in
`tooling/src/_shared/project-worlds.ts`, a dep-cruiser rule pair, `package.json`/`tsconfig`, a knip entry,
and a doc-catalog entry for any doc it cites. Scope a `pnpm-workspace.yaml` override to its parent
chain when a name is shared across major lines; a bare-name override collapses every instance onto one version.
