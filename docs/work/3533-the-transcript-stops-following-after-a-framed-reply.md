---
kind: bug
status: open
updated: 2026-11-16
priority: P1
area: chat
plan: chat-html-and-presets
---

# The transcript stops following after a framed reply lands below the fold

## What

With the transcript pinned at the bottom, a fast styled reply commits below the fold. Its frame stays veiled with no height, the list stops short of the bottom and shows the new-messages pill, and every later turn lands out of sight until the reader taps the pill. A plain reply, and a slow stream that settles on screen, keep following.

## Why

After the first styled reply a preset user's own messages and every reply arrive out of sight.

## Done when

A pinned transcript stays pinned when the newest row's frame mints, draws and grows, whether or not the row was on screen at commit, and an unpinned reader is never moved. A component test commits a styled reply below the fold on a pinned list and asserts the list is at the bottom once the frame has its height, with the unpinned control.

## Evidence

Filled at landing: what ran and where its output is.
