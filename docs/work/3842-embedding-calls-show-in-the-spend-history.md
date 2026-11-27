---
kind: work
status: doing
updated: 2026-11-27
priority: P3
area: client
lane: wt/agent-ac2c798ce3e21fdef
plan: unwired-code
---

# Embedding calls show in the spend history

## What

The retained embedding_calls history records connectionId, servedModel, wire, task, inputCount, inputModalities, totalTokens, tokenDetails, responseCache, costProvenance, costDetails, outcome; only the stats rebuild reads it, for owner, model, provider, prompt tokens, cost and time.

## Why

Owner ruling : data collected and never shown is a product item. Portability rules this history retained canon (packages/server/src/entry/compose/portability.ts).

## Done when

The owner sees per-call embedding history (model served, task, inputs, tokens, cost and its provenance, outcome, connection) where spend is shown, through a production read, covered by a native application test and a rendered check.

## Evidence

Filled at landing: what ran and where its output is.
