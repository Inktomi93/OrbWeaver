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

`pluginFrameMintRequestSchema.styleTokens` is `cardFrameStyleTokensSchema` from `packages/contracts/src/chat/card-frame.ts`. [Plugin frame style tokens](../../tests/server/entry/http/plugin-frame-style-tokens.int.test.ts) installs a real guest that registers a frame and mints through the real HTTP entry. An extra key, a foreign key and a CSS-bearing value answer 400; the in-range slice reaches the served root; the clamped root size is served at its bound. The headers equal `cardFrameResponseHeaders` of the route's one policy on the served, unstyled and miss answers, and the styled document differs from the unstyled one only by its root block. Against the unmodified schema the refusal case failed with 200.
