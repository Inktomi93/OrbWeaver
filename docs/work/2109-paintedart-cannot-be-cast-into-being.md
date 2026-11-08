---
kind: tooling
status: open
updated: 2026-11-08
priority: P3
area: tests
plan: test-foundation
---

# PaintedArt cannot be cast into being

## What

A cast of an empty object to PaintedArt still compiles; a branded unique symbol minted by the witness alone would close that.

## Why

A forgeable witness proves nothing about painted art.

## Done when

The cast fails tsc, with a type test.

## Evidence

Filled at landing: what ran and where its output is.
