---
kind: tooling
status: open
updated: 2026-11-09
priority: P2
area: testing
plan: surface-walk
---

# Surface checkpoints read geometry while a covering layer is still leaving

## What

`checkpointTextGeometry` in `tests/support/browser/surface-checkpoint.ts` waits for the view transition and the scope's finite animations. It does not wait for a layer outside the scope that covers it. The boot veil at `packages/client/src/features/app-shell/components/boot-veil.tsx:123` stays up for its minimum beat after reload, over Search settings and Filter world info. A modal backdrop covered Compare and Restore after a version restore. Shows at desktop 200%, desktop 300%, phone 200%, phone 300% text on: Config map and search; Config read recovery; Refinery disposable stage execution and versions.

## Why

The probe reports a control as covered by a layer that is about to leave, which is not the resting layout.

## Done when

Checkpoint readiness waits for the boot veil and a closing backdrop to leave, through a production-declared state. These checkpoints show no enlarged-text geometry finding at 200% and 300% text: config-map, config-search-empty, config-world-\*, refinery-execution-version-restored.

## Evidence

Filled at landing: what ran and where its output is.
