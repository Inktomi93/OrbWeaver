---
kind: bug
status: doing
updated: 2026-11-13
priority: P2
area: connection
lane: wt/agent-a1b41287df1811879
---

# Keep endpoint internals out of the model-list failure message

## What

The failure notice from `packages/client/src/features/credentials/lib/model-picker-model.ts` prints the request path and query, for example `openrouter catalog?output_modalities=embeddings: transport failure`. Say what failed in user words. Also check whether a failed embeddings sub-catalog fails the chat model list.

## Why

A user adding a chat model sees an embeddings query string and cannot act on it.

## Done when

The notice names the provider and the failure class only, and a chat list loads in the add dialog when only the embeddings or rerank list fails. A partial list never reaches the catalog mirror or its stored snapshot: `openRouterCatalog.warm` in `packages/inference/src/index.ts` fails or marks the result partial, so the earlier snapshot survives. Tests cover the notice, the dialog list and the mirror path.

## Evidence

Filled at landing: what ran and where its output is.
