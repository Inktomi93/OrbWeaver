---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: chat
plan: authorization-and-visibility
---

# A new message on a freed tail seq is covered by an old strike

## What

An append takes the canon head's seq plus one (`packages/server/src/domain/chat/engine/engine.ts`, `nextSeq: maxSeq + 1`), so deleting every message from a struck span's end to the head frees those seqs for the next messages. A strike whose end message is gone resolves that end to its stored seq (`resolveStrikeSpan` in `packages/kit/src/recall/index.ts`), so the new turns that reuse it are left out of memory as part of the struck scene. It needs a struck span ending at the canon head, which a verbatim window of zero allows.

## Why

New story is dropped from memory and the view lists the old strike on its summary. It only over-drops; the strike itself holds.

## Done when

A ruling states whether the loss is accepted. If not, a composed case strikes a span at the head, deletes it, appends, and shows the new turns reach the prompt while no struck turn does.

## Evidence

Filled at landing: what ran and where its output is.
