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
---

# Tooling and root configs

## Two config mechanisms

TypeScript configs are checked-in configuration. Edit the owning config directly and validate with `pnpm typecheck`.

`biome.json`, `eslint.config.js` and `.dependency-cruiser.cjs` are hand-authored on purpose, so a
current violation cannot mint its own permission. Fix the native lint or dependency-cruiser rule that owns the constraint.

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
digit and can kill the wrong group — use `killPidGroup` (`tooling/src/floor/process/proc.ts`). Never run
`pnpm` inside a `git archive` extraction that symlinks a worktree's `node_modules`; its dep-status
check can purge the real directory through the symlink. A test-run watchdog kills on silence and zero
CPU across the process tree, never silence alone.

D333 ends custom gate authoring and checker qualification. Use native lint, typecheck, dependency-cruiser and application tests.

## Shared code facts and readers

Before you fold two readers or code facts into one, compare every version case by case. Keep the most correct recognition, or write one merged reader that is better than each. A parity proof alone does not qualify a fold, because it keeps a weaker version's gaps. Record each case where the versions differed, the behavior kept and why, in the change's report.

## Workspace packages

Declare `sideEffects` on every new workspace `package.json` at birth, or prod tree-shaking cannot reach
consumers below the cake. A new `packages/*` package also needs a population root, a dep-cruiser rule pair, `package.json`/`tsconfig`, and a knip
entry. Scope a `pnpm-workspace.yaml` override to its parent
chain when a name is shared across major lines; a bare-name override collapses every instance onto one version.
