---
kind: bug
status: doing
updated: 2026-10-11
priority: P2
area: chat
lane: wt/agent-ae3ca59f03fa35f89
---

# The chat header keeps the room title, members and memory as the side panels open

## What

On desktop, opening both side panels in a chat room makes the header drop the room title, the member chip and the memory chip even when there is room for them to shrink (packages/client/src/features/chat/components/chat-header.tsx and its container queries).

## Why

Owner report: with both panels open he cannot see who he is chatting with.

## Done when

As the header narrows, items shrink and truncate in priority order (title truncates last, chips collapse to icon-only before hiding), and a CT at the widths produced by both panels open asserts the title and both chips stay visible.

## Evidence

Filled at landing: what ran and where its output is.
