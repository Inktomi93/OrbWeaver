---
kind: bug
status: open
updated: 2026-11-20
priority: P3
area: preset
plan: cross-surface-consistency
---

# The preset Output section says when the window floor raises the sent context

## What

A preset Max context below the settable window floor goes out at the floor, on the settable branch and now on the Ollama native send (nativeWindow). The preset Output section shows no note when this happens, so the user sees a value that is not what the model receives.

## Why

A silent change to what the user set reads as a bug, and the house rule is settings and warnings, never silent changes.

## Done when

The Output section notes when the floor raises the sent context and names the floor, on both branches, with a CT for each.

## Evidence

Filled at landing: what ran and where its output is.
