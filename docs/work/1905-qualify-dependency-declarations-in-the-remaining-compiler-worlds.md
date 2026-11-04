---
kind: work
status: open
updated: 2026-11-04
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

`packages/ui/tsconfig.json`, `packages/client/tsconfig.json`, `packages/kit/tsconfig.json`, `packages/contracts/tsconfig.json` and `tsconfig.tests-iso.json` enable declaration checking. The base config retains its existing setting for unqualified programs.

The native `pnpm typecheck` command passes, including fresh router output. Explicit declaration checks still fail in the remaining programs.

Remaining dependency families include Drizzle adapter declarations, SDK generic and inheritance contracts, NodeNext declaration imports, and browser-specific inputs.

Host declaration ownership is specified in `docs/law/Spine-TypeScript-and-Patterns.md` section 10. Native compiler controls in `tests/tooling/platform-host-types.test.ts` exercise the production configurations, missing-home failures and excluded globals. Runtime controls verify WebAssembly identities, address widths and buffer growth.

Portable testkit helpers compile in ISO; their executable self-tests live in `tests/support/node/iso/` and compile in Node. The native ISO compiler control rejects runner-specific globals.

The plugin loader uses typed WebAssembly memory while preserving its allocation limits and required resizable buffers. Production plugin tests cover heap growth, sandbox isolation and process replacement.

Use `pnpm exec node node_modules/@typescript/native/bin/tsc --noEmit true --incremental false --skipLibCheck false --project <config>` to inspect each program.

Retain the live-schema contract in `tests/support/node/db.ts`. Its generator results use the dependency's inferred snapshot type.
