---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: inference
---

# The limits step shows a LiteRouter model's native window beside the context field

## What

LiteRouter's list states each model's native window (context_window), which the reader keeps as the trained ceiling (packages/inference/src/catalog/endpoint.ts literouterModel, contextTrained) and the resolver uses only to clamp. The capability the step reads carries no trained window, so a plain-variant model shows Our guess: 8,192 with no word that the model takes 131,072.

## Why

Keep the guess then runs 8k on a model whose plan may allow far more, and the user is not told the ceiling for what they type.

## Done when

The capability view carries the trained window where a list states one, and the step shows it beside the context field for a guessed window.

## Evidence

Filled at landing: what ran and where its output is.
