---
kind: bug
status: open
updated: 2026-09-23
priority: P2
area: verify
---

# Give the structure run's project a real lib and target

## What

The structure run's ts-morph project (projectCtx, one loader in tooling/src/\_shared/ts-workspace.ts) is built without compiler options, so its default lib appears to lack ES2015 types. A planted new Map() in a persistence file resolves to no reachable target: persistence-no-in-memory-state reports it as an unresolvable identity, while its fixture verdict is ambient Map. Confirm the options the loader passes, then give the project the lib and target the product tsconfigs use.

## Why

Any types-analysis policy that skips an unresolved ES2015+ type is blind on the real tree and green on its fixtures. persistence-no-in-memory-state survives only because it refuses unresolvable identities.

## Done when

The structure run resolves Map, Set, Promise and other ES2015+ globals to their lib declarations. A pinned test plants new Map() in a persistence file and gets the ambient-Map verdict on the real-tree project. Every types policy still passes its proofs and liveness pins.

## Evidence

Filled at landing: what ran and where its output is.
