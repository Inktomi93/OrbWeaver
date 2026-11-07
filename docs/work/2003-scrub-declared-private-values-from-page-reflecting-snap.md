---
kind: bug
status: open
updated: 2026-11-07
priority: P3
area: tooling
plan: test-foundation
---

# Scrub declared-private values from page-reflecting snap artifacts

## What

A fill-env value a page sends or displays reaches HAR, the request ring and aria text. Only traces are scrubbed by value.

## Why

A declared-private value should not survive in any kept artifact.

## Done when

A planted env value echoed by a page reaches no run file.

## Evidence

Filled at landing: what ran and where its output is.
