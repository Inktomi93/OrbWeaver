---
kind: decision
status: open
updated: 2026-11-08
priority: P3
area: chat
---

# ADR 0285 splits under its size cap and covers an away host

## What

docs/adr/0285 is at its size cap, so the away-host case of a hidden reply tail sits only in 1749's evidence. Split the ADR so each ruling has room, and rule how an away host learns that a reply has a hidden tail.

## Why

A ruling kept outside the ledger is not law, and the away host case is visible behaviour.

## Done when

The ADR is split within its cap, the away-host ruling is in the ledger, and the product follows it with a test.

## Evidence

Filled at landing: what ran and where its output is.
