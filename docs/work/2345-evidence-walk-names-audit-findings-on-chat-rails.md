---
kind: bug
status: doing
updated: 2026-11-09
priority: P3
area: client
lane: wt/agent-a68b323e72355d03f
plan: cross-surface-consistency
---

# Evidence walk: names audit findings on Chat, rails and Config

## What

The names audit fails checkpoints in all three evidence runs (surface-Nn5cKU, surface-q297LL, surface-2sWzKu), mostly in the Chat context tabs and disclosures, composer drills, the chat room and home also-open chats. The surface attachment of each checkpoint lists the subjects.

## Why

A control whose name is missing, duplicated or generic cannot be told apart by assistive tech.

## Done when

Each names finding is fixed at the control's owner or answered with a cited reason, and the checkpoints pass the names audit.

## Evidence

Part, in e8919ddda5: the message-action duplicates were per-speaker article scope, so each message article is named Speaker · #N, clearing about 2100 findings including Select message; archetype duplicates and the room-pair badge fixed. Still open: chat-list, Explore and Similarity rows with identical titles; Refinery Runs View and Use for apply; preset-editor Actions; world-info New entry and wire-trace Copy log.
