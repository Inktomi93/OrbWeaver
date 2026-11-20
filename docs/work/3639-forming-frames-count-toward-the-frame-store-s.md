---
kind: work
status: doing
updated: 2026-11-20
priority: P3
area: chat
lane: wt/agent-a29549146644ff113
plan: chat-html-and-presets
---

# Forming frames count toward the frame store's size and leave it at settle

## What

The frame handle store sizing in packages/server/src/entry/http/frame-handle-store.ts does not count forming frame documents, and a forming document stays pinned for its full lifetime after its reply settles, released only by self-eviction.

## Why

Each streamed styled reply leaves dead documents holding store room long after they can be drawn.

## Done when

Forming documents count toward the store ceilings and are released when their reply settles, with a test.

## Evidence

Filled at landing: what ran and where its output is.
