---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: inference
---

# A stated limit from the OpenRouter and generic list readers gets the same sanity bound as the hosted readers

## What

A stated window or output cap should count only when it is a positive safe integer, and an output cap above its window should be dropped. The OpenRouter catalog reader and the generic `/v1/models` row schema in `packages/inference/src/catalog/endpoint.ts` take any number, so a list can state a fractional, negative or impossible pair and have it reported as the limit.

## Why

A bad list value becomes a reported limit the preset sliders trust.

## Done when

On OpenRouter and a generic endpoint, a window that is not a positive safe integer, or an output cap above the window, leaves the limit assumed, with a hostile-row case per reader.

## Evidence

Filled at landing: what ran and where its output is.
