---
kind: work
status: doing
updated: 2026-11-11
priority: P3
area: testing
lane: wt/agent-a06d7ca7c655446af
---

# The refinery apply path's snapshot retraction on a stale basis has no test

## What

packages/server/src/domain/refinery/verbs/apply-fields.ts takes a snapshot of the card before it applies and retracts that snapshot when the write is refused because the card's basis went stale between the read and the write. The new apply refusal tests cover every itemized refusal; this one is not itemized, it is a race at the write. The refinery's composition (packages/server/src/entry/compose/refinery.ts) binds the character snapshot op at compose time, so a test on the composed root has no way to move the card between the snapshot and the write.

## Why

A snapshot left behind by a refused apply shows up in the card's version history as a restore point for a change that never happened.

## Done when

A test on the composed root makes the card's basis go stale between the snapshot and the write through a production path, such as a second caller's update interleaved by the kit's existing gate helpers, and asserts the apply is refused and the snapshot list is unchanged. If no production path can interleave there, the item records why and the retraction is closed by a type or kept with that reason stated at the code.

## Evidence

Filled at landing: what ran and where its output is.
