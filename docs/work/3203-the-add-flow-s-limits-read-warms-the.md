---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: inference
---

# The add flow's limits read warms the model list without the per-model probe

## What

The limits step reads `connection.capabilities` with `cachedFacts: true`, so nothing dials and no per-model probe loads a local model (`packages/inference/src/contract/catalog.ts` `probeModel`). After `connection.create` invalidates the endpoint mirror, that read is cold, so a server whose `/v1/models` list states its window (vLLM `max_model_len`) still shows the step on add. A capability read that warms the list with no `probeModel` would learn that window without loading anything.

## Why

A vLLM user is asked for a window the server already states.

## Done when

`capabilities.for` takes a list-only warm (list fetched, no `probeModel`), the step uses it, and a CT over a scripted vLLM list with `max_model_len` adds with no limits step while the scripted transport records no per-model probe.

## Evidence

Filled at landing: what ran and where its output is.
