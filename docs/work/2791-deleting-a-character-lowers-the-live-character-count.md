---
kind: bug
status: open
updated: 2026-11-13
priority: P3
area: stats
plan: authorization-and-visibility
---

# Deleting a character lowers the live character count

## What

The live character count does not drop when a character is deleted.

## Why

The stat disagrees with the library.

## Done when

A delete lowers the live count, and a rebuild of the stats agrees with it.

## Evidence

Filled at landing: what ran and where its output is.
