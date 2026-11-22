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

The author-ui world (packages/showcase-plugins/tsconfig.author-ui.json) is scanned as its own program and its reads fold into the reference graph, because plugin-sdk gives each realm its own global orb (packages/plugin-sdk/shared.d.ts) and one program holds one global scope; worlds.ts resolves every other world types entries from its own folder; graph-worlds-check reports no site-symbol or site-type row in the bundles; D357 records the second program and its reason; planted cases prove both red.

## Evidence

Filled at landing: what ran and where its output is.
