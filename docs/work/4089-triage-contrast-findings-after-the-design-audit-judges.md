---
kind: work
status: doing
updated: 2026-11-27
priority: P2
area: ui
lane: wt/agent-a8a76b60ece6b02c7
---

# Triage contrast findings after the design audit judges translucent ink as painted

## What

The design audit now composites a translucent ink's own alpha before judging contrast (tooling/src/ui-audit census-text and checks-color), so muted translucent text that passed before may now report P1 contrast findings on Settings, Characters and chat surfaces.

## Why

A walker change that moves findings must be triaged on the real surfaces before its results guide UI work.

## Done when

A --design-audit surface walk of Settings, Characters and chat runs on the merged walker, and each new contrast finding is fixed or minted as an item with its run path.

## Evidence

Filled at landing: what ran and where its output is.
