---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: inference
---

# LiteRouter's per-model supported_parameters reach the capability's samplers

## What

Every LiteRouter list row names the request fields the model takes (`supported_parameters`). Live, the chat route accepted every sampler field we send and a made-up field too, so the list is the only structured signal of which knobs a model honours. Read it into the capability's sampling so a preset slider the model ignores is marked as such.

## Why

A user tuning min_p on a model that ignores it sees no effect and no explanation.

## Done when

A LiteRouter model whose list row omits a sampler shows that knob as not honoured, from the list alone.

## Evidence

Filled at landing: what ran and where its output is.
