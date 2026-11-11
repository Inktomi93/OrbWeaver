---
kind: work
status: doing
updated: 2026-11-11
priority: P2
area: tooling
lane: wt/agent-a3b00fac426662467
---

# The ambient platform types follow the compiler's own library

## What

`platform.d.ts` declares Map, WeakMap, Error and Iterator members that the pinned compiler ships under the es2026 library, and its header says a duplicate-declaration error will announce that moment; merged interface methods raise no such error. `reset.d.ts` says the base tsconfig includes it, but each package tsconfig lists it. `aggregator-assets.d.ts` cites an import no code makes. Source: `reports/codebase-review/units/root-dts.md`.

## Why

The declarations and their suppressions would outlive their need silently, and a new package can miss the reset.

## Done when

`tsconfig.base.json` uses the es2026 library, the four declaration blocks and their suppressions are deleted, `structuredClone` stays, and `tests/tooling/platform-host-types.test.ts` and every typecheck world pass. The two headers describe the real mechanism.

## Evidence

Filled at landing: what ran and where its output is.
