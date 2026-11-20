---
kind: work
status: open
updated: 2026-11-20
priority: P3
area: chat
plan: chat-html-and-presets
---

# Settle handover paths each have a test

## What

The shared list item that keeps a streamed reply's panels until its settled frame draws releases the ghost when the settled mint is refused, when the reply falls to the plain path, and on continue, but none of those three paths has a test. A reviewer also suspects that deleting the committed row before it draws brings the held ghost back.

## Why

An untested release path can hold a ghost on screen forever.

## Done when

Component tests cover the refused mint, the plain fallback, continue, and a delete before draw, each asserting the ghost is released.

## Evidence

Filled at landing: what ran and where its output is.
