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

pnpm unwired fields counts only a member access as a read, so a field that leaves the process reports never-read: a provider wire body, a Drizzle insert, stored JSON, tRPC output and debug inspect shapes. Treat a value that reaches a serialization or persistence boundary as read, and for a wire field follow it to the client that reads it.

## Why

A sample of the scan shows clear false reports, so the contract and inference judgment tables cannot be trusted as written.

## Done when

A planted field that only reaches each boundary is not reported, a truly dead field still is, and the contract and inference tables are regenerated from the fixed scan.

## Evidence

Filled at landing: what ran and where its output is.
