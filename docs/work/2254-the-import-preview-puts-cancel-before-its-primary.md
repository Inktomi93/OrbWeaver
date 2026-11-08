---
kind: bug
status: open
updated: 2026-11-08
priority: P3
area: client
plan: cross-surface-consistency
---

# The import preview puts Cancel before its primary like the dialog footers

## What

The SillyTavern import preview (import-library-section.tsx) puts its primary before Cancel, unlike every dialog footer. Found in acceptance part 1 and carried out of 2185.

## Why

A reversed button order trains the wrong reach for the destructive or primary action.

## Done when

The import preview's action order matches the dialog footer order through the same owner, with a CT that reads the order. Source: acceptance part 1 report.

## Evidence

Filled at landing: what ran and where its output is.
