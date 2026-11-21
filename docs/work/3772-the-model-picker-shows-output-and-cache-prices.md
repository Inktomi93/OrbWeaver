---
kind: work
status: open
updated: 2026-11-21
priority: P3
area: credentials
---

# The model picker shows output and cache prices

## What

modelCatalogEntrySchema (packages/contracts/src/inference/catalog.ts) holds completionPrice, cacheReadPrice and cacheWritePrice; the picker row shows only promptPrice (model-picker-row\.tsx). A variant also stores tokenDetails, the provider-reported input and output token counts by modality (packages/contracts/src/inference/usage.ts), and no screen shows them.

## Why

Output usually costs more than input, so a prompt price alone misleads a pick.

## Done when

The picker row shows input and output price, the row detail shows cache prices where the catalog has them, and a CT covers a priced and an unpriced model. The row detail also shows the modality split of a turn's tokens when the provider reported one.

## Evidence

Filled at landing: what ran and where its output is.
