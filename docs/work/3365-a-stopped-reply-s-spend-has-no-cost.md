---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: ui
---

# A stopped reply's spend has no cost, only estimated tokens

## What

When Stop keeps a streamed reply, the row records estimated tokens (provenance estimated) but cost stays unrecorded, because no backend reports usage on an aborted stream and the per-model price formula is private to packages/inference/src/backends/v4/result.ts.

## Why

The reader sees tokens with no price for a leg the provider billed; owner ruled spend is recorded.

## Done when

A stopped leg carries an estimated cost priced from the catalog through an exported inference pricing door, marked estimated, and the usage surfaces show it as estimated.

## Evidence

Filled at landing: what ran and where its output is.
