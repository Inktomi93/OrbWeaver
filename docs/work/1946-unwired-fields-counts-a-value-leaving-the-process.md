---
kind: tooling
status: doing
updated: 2026-11-08
priority: P2
area: tooling
lane: wt/agent-ac54a1a5d166cdf1e
plan: unwired-code
---

# Unwired fields counts a value leaving the process as a read

## What

Rescope pnpm unwired fields by boundary. Everything in packages/contracts crosses a boundary, so no in-process read proves nothing there: check a wire field against whether the other side uses it. Keep member-read judgment for internal shapes, and count these as reads: a Drizzle insert, stored JSON, a type serialized to a file, persisted-state reads, extending types in another world, and Object.freeze writes. Judge each forgotten row for the unfinished feature behind it, and include comments that promise a read, verb or field that does not exist.

## Why

A sample of the scan shows clear false reports, so the contract and inference judgment tables cannot be trusted as written.

## Done when

A planted field that only reaches each boundary is not reported, a truly dead field still is, each row is sorted dead, forgotten or ask by four tests (reader history, hand authorship, used siblings, and a promise in a setting, copy, law prose or parity claim), and the contract and inference tables are regenerated from the fixed scan.

## Evidence

Filled at landing: what ran and where its output is.
