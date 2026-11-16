---
kind: work
status: open
updated: 2026-11-16
priority: P2
area: ui
plan: chat-html-and-presets
---

# Coloured dialogue from font colour tags and colour-only span styles loses its colour on rows that do not frame

## What

Presets written for SillyTavern have the model wrap each dialogue line in a `font` tag with a colour, or a span whose style sets only a colour. Neither inline allowlist in `packages/ui/src/markdown/` keeps the `font` tag or any style attribute, so the line prints uncoloured.

## Why

A common preset feature shows nothing, and a colour-only span must not need a frame.

## Done when

A validated colour from a `font` colour attribute or a span style that sets only a colour renders on the span, on both trust policies. Every other declaration is dropped. A component test under `tests/ui/markdown/` covers accepted and refused values.

## Evidence

Filled at landing: what ran and where its output is.
