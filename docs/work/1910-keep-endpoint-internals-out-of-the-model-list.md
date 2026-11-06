---
kind: bug
status: open
updated: 2026-11-06
priority: P2
area: connection
---

# Keep endpoint internals out of the model-list failure message

## What

The failure notice from `packages/client/src/features/credentials/lib/model-picker-model.ts` prints the request path and query, for example `openrouter catalog?output_modalities=embeddings: transport failure`. Say what failed in user words. Also check whether a failed embeddings sub-catalog fails the chat model list.

## Why

A user adding a chat model sees an embeddings query string and cannot act on it.

## Done when

The notice names the provider and the failure class only, a chat list loads when only the embeddings sub-catalog fails, and tests pin both.

## Evidence

Filled at landing: what ran and where its output is.
