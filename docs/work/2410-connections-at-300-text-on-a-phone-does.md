---
kind: bug
status: doing
updated: 2026-11-10
priority: P2
area: client
lane: wt/agent-a25c03bac14ebf059
plan: cross-surface-consistency
---

# Connections at 300% text on a phone does not scroll sideways

## What

At 300% text on a phone the Connections settings page scrolls sideways and the Allow background work label is cut. It predates the 200% fixes.

## Why

Enlarged-text readers must not scroll a settings page sideways or lose a label.

## Done when

enlargedTextFindings over the settings pane on Connections is empty at 300% on the phone profile, with the label whole, proven by extending tests/client/features/app-shell/surfaces/platform-connections-text-scale.suite.ct.tsx.

## Evidence

Filled at landing: what ran and where its output is.
