---
kind: work
status: open
updated: 2026-11-08
priority: P3
area: tests
plan: surface-walk
---

# Test the disclosure walk's wait for a closed panel

## What

disclosure-walk.ts waits for a closed panel to hide before counting controls, but the disclosure-walk CT stays green with that wait removed.

## Why

A regression that counts controls in a closing panel would pass unnoticed.

## Done when

A case fails with the wait removed and passes with it.

## Evidence

Filled at landing: what ran and where its output is.
