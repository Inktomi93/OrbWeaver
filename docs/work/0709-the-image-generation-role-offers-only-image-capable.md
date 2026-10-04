---
kind: bug
status: open
updated: 2026-10-04
priority: P2
area: connection
---

# The image generation role offers only image-capable connections

## What

The Image generation picker offers and silently accepts text-only connections such as Sonnet and Gemini Flash, which then fail every image request; same root as the capability chips item (tasks matched on kind, requires skipped). Final pass leg 2 (plugins); review: ~/homelab/development/probe-archive/side-eye-reviews/final-pass-2-plugins.md.

## Why

Plugin final pass finding.

## Done when

The picker filters or flags connections whose model cannot output images, with a test.

## Evidence

Filled at landing: what ran and where its output is.
