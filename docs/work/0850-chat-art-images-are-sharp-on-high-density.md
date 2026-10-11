---
kind: work
status: doing
updated: 2026-10-11
priority: P2
area: imagery
lane: wt/agent-af6669286d41e6e5e
---

# Chat art images are sharp on high-density phones

## What

Moonlit Echoes, which the chat styles match, requires avatar thumbnails at 864x1280 (2:3, PNG quality 100) because echo, whisper and ripple draw their art from the avatar. Our portrait variant ladder tops out at 400x600 WebP (packages/server/src/domain/assets/substrate/variant-policy.ts PORTRAIT_WIDTHS 200 and 400) and banners at 800 wide. Ripple's 180px portrait needs about 540px at DPR 3 and echo's 300px-tall art about 600-900px.

## Why

Parity with Moonlit; art styles look soft on the owner's iPhone.

## Done when

The portrait ladder gains sizes up to about 864 wide (2:3), art surfaces request a DPR-appropriate size via srcset or width-from-DPR, and a test pins the size chosen at DPR 1, 2 and 3.

## Evidence

Filled at landing: what ran and where its output is.
