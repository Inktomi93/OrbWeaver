---
kind: bug
status: open
updated: 2026-09-23
priority: P3
area: verify
---

# Load the proof harness's fixture project with the real tree's ambient augmentations

## What

A `mode: "types"` policy-conformance fixture project (`policy-conformance.ts#runResourceExample`, `new Project({ skipAddingFilesFromTsConfig: true })`) never loads `platform.d.ts` or `@total-typescript/ts-reset`'s ambient augmentations, even though `tsconfig.base.json`'s `include` pulls both into every real compiler world (docs/law/Spine-TypeScript-and-Patterns.md Sec.9-10, tooling/src/\_shared/project-worlds.ts, type-config-intent.ts). Any types-analysis policy whose verdict depends on an ambient global's full declaration set (item 0107's `Map`/`Set`/`WeakMap`/`WeakSet` case is one instance) can diverge between its fixture proofs and the real tree. Derive the fixture's ambient set from the same world facts the real programs read, instead of a fixture always starting bare.

## Why

Item 0107 fixed one door bug this divergence hid; the same fixture-vs-real-tree gap is structural and can hide the identical class of bug in any other canonical-origin or ambient-identity policy, silently, since no fixture proof can see it.

## Done when

The policy-conformance fixture project's ambient declaration set for `mode: "types"` proofs matches what a real compiler world sees (derived from tsconfig/world data, not hand-listed), or the harness proves no policy's verdict actually depends on the difference. Existing proofs and liveness pins stay green.

## Evidence

Filled at landing: what ran and where its output is.
