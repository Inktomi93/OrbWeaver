---
kind: bug
status: open
updated: 2026-11-15
priority: P1
area: inference
plan: cross-surface-consistency
---

# A turn on a hosted built-in provider sends the samplers the user set

## What

A turn on the NanoGPT or LiteRouter built-in row sends no sampler unless a model-family row happens to match the model id: temperature, top_p, min_p and the rest are dropped from the request. The generation floor's sampling set is empty, a stated set replaces it, and neither provider has a sampling row or a list reader that states one.

## Why

A user who sets temperature in a preset gets the provider's default with no warning, on the two providers added for the first user.

## Done when

A request-body case for each provider shows every sampler the provider's documentation supports reaching the wire with the user's value, and an unsupported one left out and reported. LiteRouter's per-model list replaces the row where it states one. One live LiteRouter turn confirms it. The report lists any other hosted built-in row with the same gap.

## Evidence

Filled at landing: what ran and where its output is.
