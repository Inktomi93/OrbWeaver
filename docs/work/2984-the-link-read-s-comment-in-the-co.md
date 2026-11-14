---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: chat
plan: checked-law
---

# The link read's comment in the co-participant asset persistence claims the blob door's time shows nothing

## What

The comment inside loadVisibleAssetLinks in packages/server/src/domain/chat/persistence/co-participant-assets.ts says the blob door's time must not show whether anyone holds the bytes it asked for. A holder seated in one of the caller's own rooms with no visible reference makes the link read look up that holder's asset id, so that answer comes slightly later than the answer for no holder or a holder outside the caller's rooms.

## Why

A comment that overstates a security property leads the next change to rely on it. The caller of this read already states the partial timing.

## Done when

The comment states what the empty-list short cut refusal protects: the no-holder and outside-room answers share a time, and a holder in the caller's own room does not.

## Evidence

Filled at landing: what ran and where its output is.
