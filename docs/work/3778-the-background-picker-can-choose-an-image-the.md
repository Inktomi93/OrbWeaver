---
kind: work
status: open
updated: 2026-11-21
priority: P3
area: settings
plan: unwired-code
---

# The background picker can choose an image the user already has

## What

Backgrounds come only from an upload, an outside link or set as background on a generated image. assets.listOwned (packages/server/src/domain/assets/persistence/queries.ts) already filters by asset kind and returns each asset's kinds under D350, and no client caller passes a kind: the gallery add-picker is its only reader.

## Why

A gallery or generated picture cannot become a backdrop without downloading and uploading it again, and the kind-filtered list D350 built has no screen.

## Done when

The Appearance background section has a From your images source: a listOwned grid of gallery, generated and background images, each tile naming its uses from kinds; a pick records the background use and adds the library entry in one write; a CT covers a pick from a gallery image.

## Evidence

Filled at landing: what ran and where its output is.
