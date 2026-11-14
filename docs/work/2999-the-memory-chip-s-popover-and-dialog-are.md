---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: chat
---

# The memory chip's popover and dialog are proven

## What

`packages/client/src/features/chat/components/chat-recall-indicator.tsx` has no test. Its "See what the story remembers" door, which closes the popover or the overflow dialog and opens the side pane on the Memory tab, is unproven, and so is the host-only `RecallHostDetail` it renders under the popover.

## Why

The chip is the second way into the Memory tab and the only live recall count; a broken door or a detail shown to a member would go unseen.

## Done when

A CT opens the chip's popover and the overflow dialog, presses the door in each and sees the side pane open on the Memory tab with the surface closed; a host sees the recall detail under the popover and a member does not.

## Evidence

Filled at landing: what ran and where its output is.
