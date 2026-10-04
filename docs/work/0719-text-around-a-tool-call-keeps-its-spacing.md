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

Lane S6: the tool loop joins depth text with content += reduced.content (pipeline.ts near 1033) and stored content is checked against provider text signatures (content-signatures.ts), so a separator changes stored text and next-turn history; ToolCallRecord has no boundary offset. Belongs with the tool history work in 0740.
