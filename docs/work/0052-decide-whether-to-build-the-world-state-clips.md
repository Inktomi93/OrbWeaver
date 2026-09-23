---
kind: decision
status: open
updated: 2026-09-23
priority: P2
area: server
---

# Decide whether to build the world-state, clips and trackers memory layer

## What

`docs/architecture/proposed/world-state-clips-trackers-spec.md` designs a memory layer beside the digest
memory. Clips are durable, typed memory statements. Trackers are named state slots that update in place.
World-state is a reconciled snapshot that fills a `{{world_state}}` macro. None of it is built. The RPG
domain has its own tracker in `packages/contracts/src/rpg/tracker.ts`, so the two concepts overlap. The
owner rules whether to build this layer, and how it relates to the RPG tracker and the context panel.

## Why

The spec is committed but unscheduled. Its tracker concept overlaps a built RPG concept, and a builder
cannot resolve that alone.

## Done when

The ruling is recorded, and `docs/design/vocabulary-map.md` names the concept the word tracker belongs to.
For a build, a plan under `docs/plans/` exists and its build items are filed. For a drop, the spec is gone.

## Evidence

Filled at landing: what ran and where its output is.
