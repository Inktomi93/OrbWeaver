---
kind: work
status: open
updated: 2026-10-30
priority: P2
area: plugins
plan: css-system
---

# Carry the clamped style tokens through the routed chat card mint

## What

`packages/server/src/entry/http/card-frame.ts` mints a routed chat card with `styleTokens: undefined`. Accept the clamped style-token slice on the mint input, clamp it again on the server, and deliver it so the frame root reads `--sandbox-root-size`, radius and mono family. Route to `security-executor`: this widens a trust-boundary wire.

## Why

Item 1411 made srcdoc cards and plugin frames follow the viewer's font scale through `packages/ui/src/content/sandbox-frame/use-sandbox-theme.ts`. Routed chat cards never receive the tokens, so their text ignores the scale.

## Done when

The mint schema accepts only the clamped slice and the server clamps it. A routed-delivery CT shows card text scale with the appearance font scale, and a planted out-of-range token is clamped. The CSP, sandbox flags and script hash are unchanged.

## Evidence

Filled at landing: what ran and where its output is.
