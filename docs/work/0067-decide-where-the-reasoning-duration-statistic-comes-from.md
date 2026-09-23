---
kind: decision
status: open
updated: 2026-09-23
priority: P3
area: server
---

# Decide where the reasoning-duration statistic comes from, then retire the deferred open-JSON parity warning

## What

`messageVariants.metadata` has a named `reasoning_duration` reader (the stats rebuild in `packages/server/src/domain/stats/write/rebuild-from-canon.ts`) but no proven live-turn writer. The owner chooses one: stamp `reasoning_duration` on live turns, or source the statistic from a typed first-class column. The chosen repair then lands, and the warning policy `open-json-column-key-parity-deferred` is deleted.

## Why

The debt was parked at warning under GitHub issue 184, and that board no longer tracks work. The warning needs a live owner or it reads as tracked forever.

## Done when

The reasoning-duration statistic has a proven writer or a typed column, and `open-json-column-key-parity-deferred.ts` is deleted.

## Evidence

Filled at landing: what ran and where its output is.
