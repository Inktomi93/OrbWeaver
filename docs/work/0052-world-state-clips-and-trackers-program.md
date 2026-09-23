---
kind: work
status: blocked
updated: 2026-09-23
priority: P2
area: server
blocked: owner
plan: world-state-clips
---

# World-state clips and trackers program

## What

Owner ruling: this program stays parked and stays valid. It is not a decision to resolve now. Do not close or drop it. It wakes when the owner un-parks the program.

`docs/plans/world-state-clips/design.md` designs a memory layer beside the digest
memory. Clips are durable, typed memory statements. Trackers are named state slots that update in place.
World-state is a reconciled snapshot that fills a `{{world_state}}` macro. None of it is built. The RPG
domain has its own tracker in `packages/contracts/src/rpg/tracker.ts`, so the two concepts overlap. The
owner rules whether to build this layer, and how it relates to the RPG tracker and the context panel.

## Why

The spec is committed but unscheduled. Its tracker concept overlaps a built RPG concept, and a builder
cannot resolve that alone.

## Done when

The ruling is recorded, and `docs/law/vocabulary-map.md` names the concept the word tracker belongs to.
For a build, a plan under `docs/plans/` exists and its build items are filed. For a drop, the spec is gone.

## Evidence

Filled at landing: what ran and where its output is.
