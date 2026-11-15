---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: inference
---

# Image-capable NanoGPT embedders serve image embedding

## What

NanoGPT's embedding list states `input_modalities` with image on some models (Cohere Embed 5, Nemotron Embed), but the docs give no wire form for an image item on /api/v1/embeddings, so the row does not serve `imageEmbed`.

## Why

Avatar and image search need an image embedder; a NanoGPT-only user has none.

## Done when

Once NanoGPT documents the image item shape, an image embed connection on such a model embeds an image through the row.

## Evidence

Filled at landing: what ran and where its output is.
