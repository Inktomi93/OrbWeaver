---
kind: bug
status: open
updated: 2026-11-15
priority: P2
area: client
---

# A reply split into thousands of runs hangs the reader's tab while the run stylesheets are carried

## What

`withReplyStyles` and `replyLayout` in `packages/client/src/features/chat/lib/reply-parts.ts` build each run's carried stylesheet lists and sum their size once per run, before the carry budget is judged. The budget bounds carried characters and not the run count, so a reply of many tiny `<style>` elements split by dice paragraphs stays under it while the work grows with the square of the runs. A security review measured tens of seconds on the main thread for a reply near one megabyte.

## Why

A model reply, or a member's message that a display script styles, can freeze the tab of every reader who opens the room.

## Done when

The carry verdict is reached in time linear in the reply, and a reply over the bound takes the plain path before any per-run list is built. A test in `tests/client/features/chat/lib/` drives a many-run reply and fails when the per-run build returns.

## Evidence

Filled at landing: what ran and where its output is.
