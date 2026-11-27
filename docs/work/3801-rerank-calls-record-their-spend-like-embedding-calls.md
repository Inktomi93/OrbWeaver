---
kind: work
status: doing
updated: 2026-11-27
priority: P3
area: inference
lane: wt/agent-ac2c798ce3e21fdef
plan: unwired-code
---

# Rerank calls record their spend like embedding calls

## What

In packages/inference/src/roles/executor.ts embed and imageEmbed start embedding accounting before they run, and rerank runs bare; the openai-compatible rerank parser drops the provider's usage. Rerank runs in databank retrieval, chat arbitration and search.

## Why

A paid reranker spends with no record in the usage the app shows.

## Done when

A rerank call records its usage through the same accounting embed uses, the rerank backend passes the provider's token count, and a red-first test proves a rerank call writes a usage row.

## Evidence

Filled at landing: what ran and where its output is.
