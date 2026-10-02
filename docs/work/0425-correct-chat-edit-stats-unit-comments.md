---
kind: work
status: open
updated: 2026-10-02
priority: P3
area: chat
---

# Correct chat edit stats unit comments

## What

Correct the stats comments in chat edit operations to describe character units rather than bytes.

## Why

The independent stats review found stale word and byte terminology beside unchanged character-count deltas.

## Done when

Update only the misleading comments beside select and edit stats deltas. Preserve runtime arithmetic and existing tests. Match the canonical UTF-16 code-unit definition.

## Evidence

Independent review: `/tmp/launch-api-0394-verifier.md`. Root confirmed the select and edit comments in `packages/server/src/domain/chat/verbs/edit.ts`. This is separate from the verified stats rename and does not block that implementation.
