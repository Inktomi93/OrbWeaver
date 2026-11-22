---
kind: work
status: open
updated: 2026-11-22
priority: P3
area: server
plan: unwired-code
---

# Debug flight-recorder routes pick the fields they return

## What

WireWarning.code in the wire capture outcomes ring and rpgTraceRecordSchema seq and at in the rpg trace ring reach /api/\_debug only inside whole records, and no code reads them by name.

## Why

A field that only rides a whole-object dump is not read; 3841 selects the matching columns by name for its routes.

## Done when

Each route builds its rows by naming the fields, a native application test reads each field from the route, and the ring types keep the fields.

## Evidence

Filled at landing: what ran and where its output is.
