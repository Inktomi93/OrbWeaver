---
kind: tooling
status: open
updated: 2026-11-10
priority: P3
area: testing
plan: cross-surface-consistency
---

# The context tab strip fade CT runs in WebKit

## What

tests/client/features/chat/components/context-tab-strip-fade.ct.tsx proves the overflow fade paints over the tab cells in Chromium only: the file is outside the WebKit allowlist and the Show details toggle is not visible in the WebKit iPhone project.

## Why

The fade fix ships to Safari users with no WebKit proof.

## Done when

The CT runs and passes in test:ct:webkit.

## Evidence

Filled at landing: what ran and where its output is.
