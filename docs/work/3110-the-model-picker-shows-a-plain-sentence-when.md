---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: inference
---

# The model picker shows a plain sentence when a model list is malformed

## What

A list whose `data` is not an array makes `listSchema.parse` in `packages/inference/src/catalog/endpoint.ts` throw a zod error, and the picker shows the raw issue JSON as its failure reason. Give the failure a one-line sentence.

## Why

A user reading the picker sees parser output where the rest of the pane speaks plainly.

## Done when

A malformed model list shows a one-line reason with no JSON in the picker, proven through the add dialog's list read.

## Evidence

Filled at landing: what ran and where its output is.
