---
kind: bug
status: open
updated: 2026-11-14
priority: P2
area: chat
---

# A stale consolidation is not recalled after its child's summary is dropped

## What

When a scene's summary goes stale and its re-summary comes back blank, `storeTier0` in `packages/server/src/domain/chat/memory/generate/digests.ts` deletes the stale row, but every stored longer summary built from it stays, because consolidation skips an incomplete group. That parent keeps retelling the scene as it read before the edit and is still recalled. When the build drops a summary, it should also drop every stored ancestor built from it.

## Why

The parent keeps retelling the pre-edit scene, which is the stale memory `storeTier0` exists to prevent. A memory strike already leaves such a parent out by span containment; an unstruck scene has no such guard.

## Done when

A composed-root case edits a scene, gets a blank re-summary, and the next recall admits neither the old scene summary nor the longer summary built from it.

## Evidence

Filled at landing: what ran and where its output is.
