---
kind: tooling
status: open
updated: 2026-11-09
priority: P3
area: tooling
plan: unwired-code
---

# Read a constant-built tuple element as its literal in the unions scan

## What

The unions scan skips a whole tuple when one element is not a literal, so PROVIDER_ADJUSTMENT_KINDS drops out of the table now that it is built from constants.

## Why

Each move to constant-built tuples hides more vocabulary from the scan.

## Done when

An element whose checker type is a string literal, such as WARNING_CODE.x, is read as that literal, and a fixture case covers it.

## Evidence

Filled at landing: what ran and where its output is.
