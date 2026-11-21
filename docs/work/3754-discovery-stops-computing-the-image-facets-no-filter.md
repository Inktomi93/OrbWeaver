---
kind: work
status: open
updated: 2026-11-21
priority: P3
area: discovery
plan: unwired-code
---

# Discovery stops computing the image facets no filter reads

## What

ImageFacets (packages/contracts/src/discovery/index.ts) carries chestSizes, skinTones, clothingStates, nudityLevels and exposedParts, counted in packages/server/src/domain/discovery/image-analytics/facets.ts with drill keys in contract/params.ts. No client surface reads or filters by them. Owner ruling: not wired, so not kept.

## Why

A hardcoded facet vocabulary nothing uses costs work and data for no reader.

## Done when

The five facets leave ImageFacets, the facet counter, the drill keys and the image analysis vocabulary they come from, stored image metadata still parses with the keys stripped, and the discovery suites pass.

## Evidence

Filled at landing: what ran and where its output is.
