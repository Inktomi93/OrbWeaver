---
kind: work
status: open
updated: 2026-11-03
priority: P2
area: tooling
plan: type-law
---

# Qualify dependency declarations in the remaining compiler worlds

## What

Repair dependency declaration compatibility within each remaining Node and ISO program, then enable declaration checking in its owning config.

## Why

Global declaration checking blocks router preparation on unresolved dependency types. Browser programs qualify independently without changing the Node or ISO environment.

## Done when

Affected native programs pass with skipLibCheck false, including fresh router output. Preserve runtime-specific type homes and retain meaningful positive and negative compiler controls.

## Evidence

`packages/ui/tsconfig.json` and `packages/client/tsconfig.json` enable declaration checking. The base config retains its existing setting for unqualified programs.

The native `pnpm typecheck` command passes, including fresh router output. Explicit declaration checks still fail in the remaining programs.

Remaining dependency families include Drizzle adapter declarations, SDK generic and inheritance contracts, NodeNext declaration imports, and browser-specific inputs.

Qualify portable host types such as `URL` and `WebAssembly` against their supported runtimes. Preserve the Node and ISO environments during each repair.

Use `pnpm exec node node_modules/@typescript/native/bin/tsc --noEmit true --incremental false --skipLibCheck false --project <config>` to inspect each program.

Retain the live-schema contract in `tests/support/node/db.ts`. Its generator results use the dependency's inferred snapshot type.
