---
kind: tooling
status: open
updated: 2026-11-23
priority: P3
area: tooling
plan: unwired-code
---

# A value pushed into an array through a wider element type writes the narrower element

## What

The array element step in tooling/src/unwired/graph/flows.ts innerOperands pairs forward only, so pushing a literal through a wider element type leaves the narrower element's member write-only.

## Why

That is a false dead verdict on a live member.

## Done when

A planted push case credits the narrower element and fails without the change.

## Evidence

Filled at landing: what ran and where its output is.
