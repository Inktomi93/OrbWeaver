---
kind: work
status: open
updated: 2026-11-16
priority: P3
area: server
plan: chat-html-and-presets
---

# The frame handle store could evict by last serve, store documents compressed and free expired bytes

## What

Three changes to `packages/server/src/entry/http/frame-handle-store.ts`, measured and not built. Eviction follows mint order, so a frame still being read can go before an unread newer one; a serve could move the entry to the newest place. A stored document compresses about five times at a cost of a few milliseconds a mint, so a screen of heavily split replies would fit a far smaller ceiling. An expired document keeps its bytes counted until a lookup or an eviction, so an idle account's share stays held until the ceilings push it out; a sweep at mint would free it.

## Why

They would let the card ceilings come back down on a small home server with no eviction on a screen of split replies.

## Done when

Each change lands with a test through the mint and serve routes, the ceilings are set again from a measurement, and every property in the store's header is shown to hold.

## Evidence

Filled at landing: what ran and where its output is.
