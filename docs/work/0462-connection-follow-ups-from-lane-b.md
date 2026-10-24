---
kind: work
status: open
updated: 2026-10-02
priority: P3
area: connection
---

# Connection follow-ups from lane B

## What

(1) A live width probe before binding an own-server embedder whose width is unstated (dimsEstimated). (2) Zero-padding narrower embedders needs an owner ruling against the never-padded rule in the capability embedding headers; it also touches assertSpace and the search dim filter. (3) fitsSpace refuses a wider non-MRL embedder while resolveEmbed truncates it; reconcile.

## Why

Own-server gaps found by lane B outside its items' done criteria.

## Done when

Each sub-point is built or explicitly ruled, with a test where built.

## Evidence

The Ollama /api/show capabilities feed tools, vision and kind in `packages/inference/src/catalog/endpoint.ts:383-441`. The exampleBaseUrl function serves the Server URL placeholder at `packages/contracts/src/inference/providers.ts:38`.
