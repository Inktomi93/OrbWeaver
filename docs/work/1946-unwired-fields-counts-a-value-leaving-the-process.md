---
kind: tooling
status: open
updated: 2026-11-06
priority: P2
area: tooling
plan: unwired-code
---

# Unwired fields counts a value leaving the process as a read

## What

pnpm unwired fields counts only a member access as a read, so a field that leaves the process reports never-read. Treat these as reads: a provider wire body, a Drizzle insert, stored JSON, tRPC output followed to its client reader, debug inspect shapes, a type serialized to a file, persisted-state library reads, extending types in another compiler world, and Object.freeze writes.

## Why

A sample of the scan shows clear false reports, so the contract and inference judgment tables cannot be trusted as written.

## Done when

A planted field that only reaches each boundary is not reported, a truly dead field still is, each row is sorted dead, forgotten or ask by four tests (reader history, hand authorship, used siblings, and a promise in a setting, copy, law prose or parity claim), and the contract and inference tables are regenerated from the fixed scan.

## Evidence

Filled at landing: what ran and where its output is.
