---
kind: bug
status: open
updated: 2026-11-08
priority: P3
area: tests
---

# Add the CT local recorders to the recorder name list

## What

CT recorders named asked, sent and saved are not in the recorder name list the tail-read rule reads.

## Why

A tail read on those recorders is not refused.

## Done when

The names join the list and a CT plant row with each is refused.

## Evidence

Filled at landing: what ran and where its output is.
