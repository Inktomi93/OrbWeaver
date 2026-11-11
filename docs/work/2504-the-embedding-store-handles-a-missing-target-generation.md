---
kind: work
status: doing
updated: 2026-11-11
priority: P3
area: embeddings
lane: wt/agent-a06d7ca7c655446af
plan: unwired-code
---

# The embedding store handles a missing target generation that no caller can produce

## What

packages/server/src/domain/embeddings store code throws EmbedFailedError in three places when `resolveTargetGeneration` answers null. The connection resolver rethrows instead of answering null unless a caller passes an explicit connection id, and no caller passes one, so those branches cannot run. The null travels through the `EmbeddingsService.resolveGeneration` contract and the files that read it. The class itself is live through a different path: a whitespace-only databank document produces no vector, which a new ingest test covers. Source: the errors lane report, the rv-errors file under reports/lanes.

## Why

The owner's ruling is that unreachable code is found out and closed, never left as harmless. A null that cannot occur makes every reader handle a case with no test and no input.

## Done when

The resolver's type says when it can answer null: an overload on `ResolveEmbeddingConnectionOp` or an equal type-level split, so `resolveTargetGeneration` is non-null for callers that pass no connection id. The three throws and the null handling behind them are deleted, and typecheck passes with no cast.

## Evidence

Filled at landing: what ran and where its output is.
