---
kind: bug
status: open
updated: 2026-11-27
priority: P3
area: client
---

# Overriding one half of a connection's embed batch writes a half the server refuses

## What

In the connection editor, overriding only one half of the embed batch fact writes that half alone, and the server schema refuses a lone half.

## Why

The owner's override fails with no way to set it from the editor.

## Done when

The editor writes both halves together (the other from the folded value), the override saves, and a CT covers overriding one half.

## Evidence

Filled at landing: what ran and where its output is.
