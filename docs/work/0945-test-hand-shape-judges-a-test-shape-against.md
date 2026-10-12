---
kind: tooling
status: doing
updated: 2026-10-12
priority: P2
area: tooling
lane: wt/agent-a63768b4c4e7202f1
plan: test-mirror
---

# test-hand-shape judges a test shape against the type of the value it annotates

## What

test-hand-shape (item 899) flags an e2e or support shape that copies or overlaps an exported production shape by field names and types, with a calibrated overlap threshold that sits exactly on the founding WireCapture drift and would flag an unrelated row sharing generic fields (id, name, createdAt, updatedAt). Once item 888 lands, e2e values are typed from the AppRouter output (TrpcOutput) and contracts, so the gate can compare a hand shape to the production type of the value it annotates or is passed with. Replace the overlap heuristic with that comparison.

## Why

Owner ruling: judge by type and declaration; a field-name overlap threshold is a calibrated heuristic that only approximates the boundary the shape crosses.

## Done when

test-hand-shape flags a hand shape whose annotated or passed value has a production type it diverges from or copies, the overlap threshold is gone, WireCapture-style drift still flags, and an unrelated generic row passes.

## Evidence

Filled at landing: what ran and where its output is.
