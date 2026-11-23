---
kind: tooling
status: open
updated: 2026-11-23
priority: P3
area: tooling
plan: unwired-code
---

# A zod-validated literal's spread, nested and array-element keys write the schema keys

## What

A literal handed to a zod validator writes only its own top-level keys; keys that arrive by spread, in a nested object, or in an array element write nothing.

## Why

Those schema keys read as read-only, an ask verdict where the code does write them.

## Done when

Three planted cases, one per shape, each red without the rule.

## Evidence

Filled at landing: what ran and where its output is.
