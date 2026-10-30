---
kind: work
status: open
updated: 2026-10-30
priority: P3
area: ui
plan: css-system
---

# Moonlit immersive card primitives: feather direction, echo minimum height, hush and whisper tick

## What

Add the three `@orb/ui` pieces the Moonlit Echoes parity (items 0880, 0882) needs:

- a direction variant on the `Stack` `feather` mask (`packages/ui/src/layout/variants.ts`, `packages/ui/src/styles/primitives.css`), so Whisper's banner sits top-right and fades left;
- an `immersive` minimum-height size token in `packages/ui/src/tokens/tokens.json`, so an Echo card is about 200px tall at rest;
- a short edge-tick `artDecoration` treatment (`art-decoration.ts`), for Hush's right-edge tick and Whisper's tick.

Then apply them in the chat row skins and pin each one in `platform-immersive-card-width.suite.ct.tsx` against the reference values in `reports/moonlit-reference/`.

## Why

Chat styles match Moonlit Echoes, mobile included (owner). The chat-styles lane measured these three differences against the Moonlit screenshots and could not close them without primitive or token changes.

## Done when

Whisper's banner is top-right with a left fade, an Echo card is about 200px tall at rest, and Hush and Whisper show their edge tick. Each is pinned within a few px of the Moonlit reference in a production-mounted CT on Chromium and WebKit, red before the change.

## Evidence

Filled at landing: what ran and where its output is.
