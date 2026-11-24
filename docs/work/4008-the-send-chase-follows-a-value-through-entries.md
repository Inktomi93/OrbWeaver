---
kind: tooling
status: open
updated: 2026-11-24
priority: P3
area: tooling
plan: unwired-code
---

# The send chase follows a value through entries and object rebuilds and across a worker message door

## What

Rows the hand review ruled as read by a log, trace or bug bundle stay in fields unwired where the send chase cannot reach the sink: the bug report and request trace chains pass values through Object.entries and Object.fromEntries and more hops than the depth bound, and the InferenceLog lines reach the main process over the local-light worker's MessagePort (model-worker.ts:79). The graph already pairs a worker door's sends with their receivers (graph/message-doors.ts); the send chase in open-sends.ts does not use those pairs.

## Why

Each such row reads as unwired although the product sends it to a sink, so the fields report keeps false findings in the classes 3857 closed.

## Done when

The send chase crosses a message door through graph/message-doors.ts's pairs instead of a second door reader, and follows entries and fromEntries rebuilds, each with a planted case and a twin; the rerun on main shows those rows out of unwired or each one named in the fields limits.

## Evidence

Filled at landing: what ran and where its output is.
