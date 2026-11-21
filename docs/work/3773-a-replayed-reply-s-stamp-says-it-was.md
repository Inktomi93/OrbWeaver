---
kind: work
status: open
updated: 2026-11-21
priority: P3
area: chat
---

# A replayed reply's stamp says it was replayed and how old it is

## What

responseCacheSchema (packages/contracts/src/inference/usage.ts) stores ageSeconds, ttlSeconds and sourceGenerationId on a reply served from the response cache; the message stamp does not say so.

## Why

A reader cannot tell a fresh reply from a cached one.

## Done when

The per-message stamp says replayed with its age and links the source reply where it is still present, with a CT.

## Evidence

Filled at landing: what ran and where its output is.
