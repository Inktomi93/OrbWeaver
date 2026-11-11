---
kind: bug
status: open
updated: 2026-11-11
priority: P2
area: testing
---

# The stream frame queue's overflow behaviour has no test

## What

packages/server/src/transport/trpc/stream/frame-queue.ts decides what a slow socket gets when its queue fills: a resumable room receives a lag frame and resumes from its watermark, and a room that cannot resume collapses. The choice now reads the `resumable` flag from the room source table. The old header said a unit test covered each policy; no test under tests/server drives the queue to overflow, and nothing there names the lag frame.

## Why

Overflow is the path a slow or backgrounded client takes. A wrong answer there drops events silently or closes a stream that could have resumed, and only a test that fills the queue can show which.

## Done when

A test through the composed stream fills the queue for one resumable room and one that is not, using valid bus events from the kit's builders, and asserts the lag frame with a working resume for the first and the collapse for the second. The frame-queue header names the test file.

## Evidence

Filled at landing: what ran and where its output is.
