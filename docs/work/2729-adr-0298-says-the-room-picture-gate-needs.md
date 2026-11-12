---
kind: work
status: open
updated: 2026-11-12
priority: P3
area: docs
plan: authorization-and-visibility
---

# ADR 0298 says the room picture gate needs the owner present and enabled

## What

ADR 0298 says the room picture gate needs the picture's owner present. The gate now also needs the owner enabled, through the room's consent set.

## Why

The ledger outranks the code, so a stale ruling invites a fix that reopens the gate.

## Done when

The ADR text states present and enabled, and matches the gate in `resolve-media-ref.ts` and the co-participant art query.

## Evidence

Filled at landing: what ran and where its output is.
