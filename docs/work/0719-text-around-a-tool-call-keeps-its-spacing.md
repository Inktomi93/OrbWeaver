---
kind: bug
status: open
updated: 2026-10-04
priority: P3
area: chat
---

# Text around a tool call keeps its spacing

## What

Prose before and after a tool call is joined with no space: 'with suspicion.I turn the card over' (fp2-od-chatdraw\.png). Final pass leg 2 (plugins); review: ~/homelab/development/probe-archive/side-eye-reviews/final-pass-2-plugins.md.

## Why

Plugin final pass finding.

## Done when

Text segments around tool calls render with their separating whitespace, with a test.

## Evidence

Filled at landing: what ran and where its output is.
