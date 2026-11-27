---
kind: work
status: doing
updated: 2026-11-27
priority: P3
area: databank
lane: wt/agent-ab48c9f67c391d41f
plan: unwired-code
---

# A databank indexing run names the documents that failed

## What

ingestRunResultSchema.failed (packages/contracts/src/databank/index.ts) records each failed document and its error, and the databank has no status column by design, so this list is the only record. The workload result line in workloads-result-copy.ts counts the failures and names none, and the document row shows nothing.

## Why

A user is told a document failed and cannot find which one or why.

## Done when

The result line names each failed document with its error and opens it, and a CT covers a run with one failed document.

## Evidence

Filled at landing: what ran and where its output is.
