---
kind: tooling
status: open
updated: 2026-11-22
priority: P2
area: tooling
plan: unwired-code
---

# The graph sees inside the showcase plugin bundles

## What

The showcase author worlds (packages/showcase-plugins/tsconfig.author-main.json, author-ui, author-frame) load plugin-sdk main.d.ts and ui.d.ts through types entries that resolve from their own folder. The merged program in tooling/src/unwired/worlds.ts sits at the repository root, so those entries resolve to nothing and every SDK-typed parameter inside a bundle becomes any; pnpm unwired graph-worlds-check reports them as site-symbol and site-type errors.

## Why

The graph is blind inside the bundles: no member read there is resolved, so their fields and the SDK surface they use look unread or lost.

## Done when

worlds.ts resolves each world types entries from that world folder in the merged program, graph-worlds-check reports no site-symbol or site-type error in the bundles, and a planted world with a folder-relative types entry proves it red.

## Evidence

Filled at landing: what ran and where its output is.
