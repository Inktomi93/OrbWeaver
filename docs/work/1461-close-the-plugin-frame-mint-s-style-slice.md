---
kind: work
status: open
updated: 2026-10-30
priority: P2
area: plugins
---

# Close the plugin frame mint's style slice to the card-frame shape

## What

pluginFrameMintRequestSchema.styleTokens in packages/contracts/src/plugin/frame.ts accepts any --\* record, while the card-frame mint accepts only the closed three-token slice that packages/kit/src/card-frame/index.ts clamps. The server clamp now drops extra keys silently instead of refusing them.

## Why

Two shapes for one concept, and the plugin trust-boundary wire is the open one. Route to security-executor.

## Done when

The plugin mint reuses the closed slice from its one home, a mint with an extra style key answers 400 through the real HTTP entry, and in-range tokens still reach the plugin frame.

## Evidence

Filled at landing: what ran and where its output is.
