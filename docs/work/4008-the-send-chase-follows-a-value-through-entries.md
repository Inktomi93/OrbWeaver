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

Rows the hand review ruled as read by a log, trace or bug bundle stay in fields unwired where the chase cannot reach the sink: the bug report and request trace chains pass values through Object.entries and Object.fromEntries and more hops than the depth bound, and the InferenceLog lines reach the main process over the local-light worker's MessagePort (model-worker.ts:79), which the chase does not cross.

## Why

Each such row reads as unwired although the product sends it to a sink, so the fields report keeps false findings in the classes 3857 closed.

## Done when

The chase follows entries and fromEntries rebuilds and a worker port's postMessage to its receiver, each with a planted case and a twin, and the rerun on main shows those rows out of unwired or each one named in the fields limits.

## Evidence

Filled at landing: what ran and where its output is.
