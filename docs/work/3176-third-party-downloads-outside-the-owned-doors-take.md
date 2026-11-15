---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: inference
---

# Third-party downloads outside the owned doors take a cancel

## What

The local-light model cache fetches tokenizer files through the transformers library's env.fetch(url) with no signal (packages/inference/src/backends/local-light/model-cache.ts), and the cloudflared relay download in packages/server/src/infra/relay/binary.ts has only a deadline.

## Why

A cancelled rerank model load or relay setup keeps downloading until the file or the deadline ends.

## Done when

Both downloads take the caller's signal, or route through an owned door that does.

## Evidence

Filled at landing: what ran and where its output is.
