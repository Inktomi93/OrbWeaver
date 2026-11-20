---
kind: bug
status: doing
updated: 2026-11-20
priority: P2
area: chat
lane: wt/agent-a9c37ddad85685d6d
plan: chat-html-and-presets
---

# The room stylesheet carry stays bounded on long rooms and says when it falls back

## What

The carry grows with every earlier distinct sheet a reply's classes name, reaching hundreds of thousands of characters per frame on long rooms, and its budget sits above the frame mint cap, so a reply past the mint cap goes plain with no notice.

## Why

A long styled room spends memory on every frame and then silently loses its styling.

## Done when

The carry budget sits below the mint cap with a stated per-frame bound, a reply that falls back shows the shared plain notice with its reason, and a test covers a long room.

## Evidence

Filled at landing: what ran and where its output is.
