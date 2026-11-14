---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: chat
plan: authorization-and-visibility
---

# A host reorder can carry a live strike endpoint past the struck turns of a span whose other end is gone

## What

When one endpoint of a struck span is deleted, its stored seq stands for it, and a reorder never moves a gone message's seq: it permutes live messages among their own seqs (`planResequence` in `packages/server/src/domain/chat/verbs/edit.ts`). If the host then moves the surviving endpoint to the far side of the gone one, the span resolves between the two seqs and no longer holds the struck turns that were between them. Only the host reorders, so no member path reaches it.

## Why

A struck turn can return to memory after the host's own reorder, without the host restoring it.

## Done when

A ruling states whether a host reorder may move struck turns out of a strike. If not, a composed case deletes one endpoint, moves the other across the gone one, and shows the struck turns stay out.

## Evidence

Filled at landing: what ran and where its output is.
