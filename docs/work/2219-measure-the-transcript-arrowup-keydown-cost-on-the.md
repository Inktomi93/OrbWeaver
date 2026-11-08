---
kind: work
status: open
updated: 2026-11-08
priority: P3
area: client
---

# Measure the transcript ArrowUp keydown cost on the release image

## What

The roving keydown handler in the transcript costs 19 to 29 ms per ArrowUp in the pagination CT.

## Why

It dominates the ordinary pagination case and may be felt by a keyboard reader.

## Done when

The cost is measured on the release image and either filed as felt pain with a fix or closed with the measurement.

## Evidence

Filled at landing: what ran and where its output is.
