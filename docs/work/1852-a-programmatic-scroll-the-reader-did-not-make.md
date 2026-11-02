---
kind: bug
status: open
updated: 2026-11-02
priority: P3
area: ui
plan: cross-surface-consistency
---

# A programmatic scroll the reader did not make (find-in-page, an anchor jump) is re-pinned by the message list's tail follow or reading-row hold

## What

A scroll the list did not write and the reader's input did not start ends the tail follow and any reading-row hold, the way a wheel or touch does.

## Why

On CI the pinned-strip CT set scrollTop to 0 and saw it return to 7249: a late measure re-pinned the list. Browser find-in-page, anchor jumps and assistive scrolls take the same path (`packages/ui/src/primitives/message-list/message-list.tsx` onScrollTracked, `packages/ui/src/primitives/message-list/reading-row.ts`).

## Done when

A CT sets scrollTop away from the end during a hold and during tail follow, then lets a late measure land; the position holds. The short-room R2 crossing and jump-to-latest CTs stay green.

## Evidence

Filled at landing: what ran and where its output is.
