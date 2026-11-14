---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: server
---

# The inference flow plan names the backfill files at their current paths

## What

`docs/plans/inference-flow/design.md` names the memory backfill files at their paths before the substrate purity work moved them into the chat memory backfill subsystem. The citation test does not read plans, so nothing reports it.

## Why

A plan that points at missing files sends its reader to search.

## Done when

The plan cites the files at their current paths.

## Evidence

Filled at landing: what ran and where its output is.
