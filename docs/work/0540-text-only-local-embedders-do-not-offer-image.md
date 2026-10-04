---
kind: bug
status: open
updated: 2026-10-04
priority: P3
area: connection
---

# Text-only local embedders do not offer image embedding

## What

Ollama rows list the imageEmbed task even for text-only models such as all-minilm. Found by the 0507 live matrix (observation 4); not exercised.

## Why

Offering a task the model cannot serve leads to a refused bind or a broken picture index.

## Done when

An Ollama embedder offers imageEmbed only when its model states image input; a test covers a text-only model.

## Evidence

Filled at landing: what ran and where its output is.
