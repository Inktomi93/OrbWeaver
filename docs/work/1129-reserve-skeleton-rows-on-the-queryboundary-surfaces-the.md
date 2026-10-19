---
kind: work
status: open
updated: 2026-10-19
priority: P3
---

# Reserve skeleton rows on the QueryBoundary surfaces the lint rule names

## What

The SkeletonRows reservation lint finding names client surfaces whose QueryBoundary has no reserveKey. Adding one changes rendered layout, so each surface needs CT or snap proof.

## Why

A missing reservation shifts layout when data arrives, and the change is only safe with a rendered check per surface.

## Done when

Every named surface carries its reserveKey, each is proven rendered by a CT or snap check, and side-eye reviews the batch.

## Evidence

Filled at landing: what ran and where its output is.
