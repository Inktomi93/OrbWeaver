---
kind: bug
status: doing
updated: 2026-11-11
priority: P3
area: chat
lane: wt/agent-a06d7ca7c655446af
---

# A live-only chat frame on a cursor-less attach resets the socket cursor to zero

## What

On a chat attach with no cursor, live-only frames are stamped with sequence zero (packages/server/src/transport/trpc/stream), so the socket's cursor drops from the attach sequence to zero and a later shed replays from the start. The replay runs the participant check, the caller's history floor and the member strip, so it delivers nothing the member could not already request; the cost is one redundant replay of rows the client holds. A header comment says the cursor never moves backward. Source: the errors lane report and the leg-five security review.

## Why

A redundant full replay on a slow connection is the opposite of what the lag path is for, and the header states an invariant the code does not keep.

## Done when

Live-only frames carry the attach cursor, a test shows a shed after a cursor-less attach replays only from the attach point, and the header matches.

## Evidence

Filled at landing: what ran and where its output is.
