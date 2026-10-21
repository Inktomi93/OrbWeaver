---
kind: bug
status: blocked
updated: 2026-10-21
priority: P3
blocked: owner
---

# Session loader hardening from the 1166 review

## What

The pinned guard checks for any open transaction rather than the planning writer's, so an unrelated BEGIN keeps a stale pinned reader answering (unreachable today because the catalog disposes first); only shapes and bindings are frozen though every retained family is shared, and runtimeExports() hands out the retained array; inventoryBindingsAt freezes the caller's span object, and inventoryMemberOrigins passes undeduplicated leaves that would refuse on a shared leaf; readInventoryShape, readInventoryDeclarationOutputs and readInventoryRuntimeExports now have only test callers.

## Why

Each is a latent wrong answer or unwired code in the one batched read home.

## Done when

pinned checks the identity of the planning transaction, every retained fact is frozen or copied on hand-out, direct family reads never freeze caller input and dedupe leaves, and the three exports are routed through their families or deleted, each with a red-first row.

## Evidence

Filled at landing: what ran and where its output is.

Owner-directed tooling pause: this work is parked outside the test-foundation and test-mirror programs. Preserve source and evidence; resume only with explicit owner authorization. Custody: `reports/review/tooling-park-2026-10-21/`.
