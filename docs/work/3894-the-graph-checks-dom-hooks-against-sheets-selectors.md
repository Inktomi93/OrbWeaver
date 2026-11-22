---
kind: tooling
status: open
updated: 2026-11-22
priority: P2
area: tooling
plan: unwired-code
---

# The graph checks DOM hooks against sheets, selectors and tests

## What

Class names, data-\* attributes and test ids link markup to sheets, selectors and tests with no symbol between them. reports/api-play/bloodhound/dom.ts finds sheet selectors nothing writes, data-\* attributes nothing reads and inline test ids no test uses, but cannot follow a name held in a constant.

## Why

A sheet rule or a data-\* hook with no partner is dead code no other scan sees.

## Done when

graph-dom reports those buckets with sealed-library names and dependency-written names excluded and data-slot values judged as published; a constant name is followed through the checker to the attribute API it reaches, so no named-only bucket remains; planted cases per bucket.

## Evidence

Filled at landing: what ran and where its output is.
