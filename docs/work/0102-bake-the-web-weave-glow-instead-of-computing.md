---
kind: bug
status: open
updated: 2026-09-23
priority: P3
area: ui
---

# Bake the web-weave glow instead of computing it per frame

## What

The motion law now requires baking glow and blur rather than computing them on an animating element. `packages/ui/src/art/web-weave/web-weave-render.ts` sets `ctx.shadowBlur` every frame for the moving highlights and the capture glow.

## Why

A live canvas shadowBlur forces a software raster on every frame, which the bake-glow law now forbids for anything that moves or fades.

## Done when

The weave's glow renders from a baked static asset or a blurred path twin, animated with transform/opacity only, or an owner ruling accepts canvas shadowBlur as a named exception.

## Evidence

Filled at landing: what ran and where its output is.
