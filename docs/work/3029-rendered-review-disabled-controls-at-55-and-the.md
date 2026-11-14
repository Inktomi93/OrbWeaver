---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: ui
---

# Rendered review: disabled controls at 55% and the darker light-theme primary and intent colours

## What

opacity.disabled stays 55 (was 50). The light seed's primary and the destructive, warning, success and info light branch in packages/ui/src/tokens/themes/light.json moved darker (L 0.5 to 0.415, 0.5 to 0.46, 0.49 to 0.375, 0.47 to 0.365, 0.48 to 0.375) so every disabled fill-less Button clears 3:1 in the light seed.

## Why

The light theme's accent and intent inks, solid pills and chips are visibly deeper; the owner has not seen them rendered.

## Done when

A rendered review of the light theme (chat, settings, a disabled control, a solid pill and a soft chip) accepts the look, and the orchestrator's whole CT run is green.

## Evidence

Filled at landing: what ran and where its output is.
