---
kind: bug
status: open
updated: 2026-11-15
priority: P2
area: rpg
---

# A turn's game writes are not lost in silence when another turn commits first

## What

The turn-write fold in `packages/server/src/domain/rpg/snapshot-edit.ts` returns the head outcome for any head past its own beat and treats it as a superseded regenerate of an older message. A second speaker whose turn commits during the first speaker's state round is classified the same way, so the first turn's writes disappear with no record; the comment in that function names the gap but no board row carries it. Make the fold tell a regenerate of an earlier message from a later concurrent turn, and record a lost write on the turn's tool-call row.

## Why

In a group room assistants speak back to back, so overlapping rounds are ordinary play, and a dropped write leaves the tracked state wrong with nothing to explain it.

## Done when

A server test runs speakers with overlapping state rounds and finds both rounds' writes in the head or a recorded loss on the losing turn's tool-call row; a regenerate of an older message still stays silent.

## Evidence

Filled at landing: what ran and where its output is.
