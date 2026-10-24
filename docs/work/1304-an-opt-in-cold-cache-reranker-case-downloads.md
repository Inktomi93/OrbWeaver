---
kind: work
status: open
updated: 2026-10-24
priority: P3
area: inference
plan: restoration-register
---

# An opt-in cold-cache reranker case downloads and serves the seeded model

## What

The 0991 probe's cold-cache case has no home: the first rerank call on an empty cache should download weights through the shipped local-light loader and serve the seeded model.

## Why

The first-run model download is a user-visible path no maintained case exercises.

## Done when

A case tagged local-model-cache runs only with ORB_LOCAL_LIGHT_E2E=1, passes when opted in, and skips by default.

## Evidence

Filled at landing: what ran and where its output is.
