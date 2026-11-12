---
kind: bug
status: open
updated: 2026-11-12
priority: P3
area: embeddings
plan: stored-data-integrity
---

# A truncated image that keeps its signature counts as embedded or skipped in the image sweep

## What

Item 1486 fails an avatar whose stored bytes carry no image signature. A truncated file that keeps its signature (a 12- or 64-byte PNG prefix in review) is still recognized and admitted, so with a real vision backend it falls back into the silent skip.

## Why

The owner never learns a truncated picture is broken.

## Done when

A truncated file with a valid signature fails as that asset with its id, pinned by a case in tests/server/domain/embeddings/persistence/image-sweep-rows.int.test.ts that plants the prefix through the production store; no admitted complete format is refused.

## Evidence

Filled at landing: what ran and where its output is.
