---
kind: bug
status: open
updated: 2026-11-13
priority: P3
area: inference
plan: cross-surface-consistency
---

# A partial model-list refresh is reported, in the refresh result and in the picker

## What

When a provider's chat list answers and its embeddings or rerank list fails, the catalog refresh in `packages/inference/src/index.ts` returns no models, the same as a total failure, so the admin refresh button and the scheduled refresh both record a silent success. The add dialog lists the chat models with nothing to say that embedding and rerank models are missing for now; the model listing wire shape has no field for it.

## Why

An owner looking for an embedding model sees a shorter list with no reason, and a failed refresh looks like a good one.

## Done when

The refresh result distinguishes complete, partial and failed; the model listing carries which kinds are missing; the picker shows a notice naming them; a test covers the refresh result and a component test covers the notice.

## Evidence

Filled at landing: what ran and where its output is.
