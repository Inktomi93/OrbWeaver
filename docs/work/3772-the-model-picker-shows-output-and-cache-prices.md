---
kind: work
status: open
updated: 2026-11-21
priority: P3
area: credentials
---

# The model picker shows output and cache prices

## What

modelCatalogEntrySchema (packages/contracts/src/inference/catalog.ts) holds completionPrice, cacheReadPrice and cacheWritePrice; the picker row shows only promptPrice (model-picker-row\.tsx).

## Why

Output usually costs more than input, so a prompt price alone misleads a pick.

## Done when

The picker row shows input and output price, the row detail shows cache prices where the catalog has them, and a CT covers a priced and an unpriced model.

## Evidence

Filled at landing: what ran and where its output is.
