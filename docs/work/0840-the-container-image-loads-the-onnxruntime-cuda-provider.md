---
kind: bug
status: open
updated: 2026-10-10
priority: P3
area: embeddings
---

# The container image loads the onnxruntime CUDA provider or skips it quietly

## What

At boot the v0.2.0 container logs onnxruntime errors: libonnxruntime_providers_shared.so cannot be opened, then local-light retries on CPU (device auto).

## Why

Every boot prints a red error for a missing library, and GPU hosts silently run local embeddings on CPU.

## Done when

The image either ships the provider library so device auto uses CUDA when present, or resolves auto to CPU without the error on images that ship no provider.

## Evidence

Filled at landing: what ran and where its output is.
