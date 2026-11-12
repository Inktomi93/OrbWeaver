---
kind: tooling
status: open
updated: 2026-11-12
priority: P3
plan: checked-law
---

# The debug probes' read-only grant on owned tables is enforced for writes

## What

`docs/law/Tier-2-Foundation.md` grants the debug probes under `packages/server/src/foundation/observability/debug/inspect` a read-only view of the database. The owned-table lint rows for the inbox and users tables judge imports only, so inside the probes a write to either table passes. Only the vector tables have a write rule that stays on there.

## Why

The grant is read-only by law and nothing refuses a write through it.

## Done when

A write to an owned table from the probe path is refused by a lint row with a planted control, on at zero, for every owned table the probes read.

## Evidence

Filled at landing: what ran and where its output is.
