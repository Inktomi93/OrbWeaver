---
kind: tooling
status: open
updated: 2026-11-22
priority: P3
area: tooling
plan: unwired-code
---

# Engine one sends node queries in the API's array forms

## What

NativeWorld.symbolsAt and typesAt send one request per node although getSymbolAtLocation and getTypeAtLocation take node arrays, and the per-world answer cache keeps every raw answer for the world's life.

## Why

The array form roughly halves symbol resolution time and lowers the retained heap per world.

## Done when

symbolsAt and typesAt use chunked array forms, the answer cache is bounded or limited to request kinds that repeat by a measured hit rate, and the unwired suite passes.

## Evidence

Filled at landing: what ran and where its output is.
