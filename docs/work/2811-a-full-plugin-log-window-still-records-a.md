---
kind: bug
status: open
updated: 2026-11-13
priority: P3
area: plugin
plan: authorization-and-visibility
---

# A full plugin log window still records a host fault

## What

A guest can fill its log window with its own lines; a real host fault on its bridge calls then appears only inside the dropped count.

## Why

The operator loses the one record of the fault.

## Done when

Host-fault lines have a reserved share of the window or their own small budget, and a test fills the window from the guest and still reads the fault line.

## Evidence

Filled at landing: what ran and where its output is.
