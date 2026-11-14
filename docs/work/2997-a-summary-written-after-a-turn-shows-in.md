---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: chat
---

# A summary written after a turn shows in the open Memory tab without a reopen

## What

The Memory tab re-reads `chat.memoryView` on `turnCompleted`, `chatUpdated`, the user-bus `settingsChanged` and every tab open (`packages/client/src/data/invalidation.ts`, `packages/client/src/features/chat/components/memory-view-tab.tsx`). The post-turn memory build runs detached after the turn (`packages/server/src/domain/chat/engine/engine.ts`, the `generateMemory` call) and emits no bus event when it stores a summary, so a summary written after `turnCompleted` stays out of an open tab until the next turn or a reopen. Give the build's completion a covering event, priced like any member-visible bus member, or show the open tab that a build is running.

## Why

A player watching the Memory tab after a reply sees the newest scene appear one turn late.

## Done when

With the Memory tab open, a reply whose post-turn build stores a new summary shows that summary in the tab without another turn or a reopen, proven in a CT or e2e case over the real build.

## Evidence

Filled at landing: what ran and where its output is.
