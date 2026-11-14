---
kind: tooling
status: open
updated: 2026-11-14
priority: P3
plan: test-foundation
---

# One browser door opens a phone's CONTEXT pane wherever the topbar seats its toggle

## What

tests/e2e/support/surface-walker.ts openContext and the openPane helper in tests/client/features/app-shell/surfaces/context-tab-bodies.ct.tsx spell the same inline-or-More-menu press.

## Why

A second copy of a door is a defect, and enlarged text folds the toggle into the trail's More menu, so a CT that presses only the inline toggle skips silently.

## Done when

One helper in the browser testkit opens the pane and asserts it left collapsed; both callers use it.

## Evidence

Filled at landing: what ran and where its output is.
